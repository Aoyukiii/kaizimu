import { Context, Logger, Schema } from "koishi";
import DictAdapter, { DictInfo } from "./DictAdapter";
import Game, { GameId } from "./Game";
import {
  DictList,
  GameMonitor,
  GameEndInterface,
  FormatResults,
  FormatInfo,
} from "./templates";

// TODO: JSX nested support
// TODO: logger and shortcut
class Kaizimu {
  private readonly dictInfos: DictInfo[];
  private readonly logger: Logger;
  private dictAdapters: DictAdapter[];
  private games: Game[];

  private dispose: () => void;

  constructor(ctx: Context, config: Kaizimu.Config) {
    this.logger = new Logger("kaizimu");
    this.dictInfos = config.dictInfos;
    this.init().then(() => {
      this.logger.info("初始化已完成。");
    });

    ctx
      .command("dict")
      .before(this.checkDictEmpty.bind(this))
      .action(() => {
        return DictList({ dictAdapters: this.dictAdapters });
      });

    ctx.command("reload").action(({ session }) => {
      this.loadDicts()
        .then(() => {
          session.send("重载完成。");
        })
        .catch((err) => {
          session.send("重载失败。");
          this.logger.error(err);
        });
      return "重新加载中······";
    });

    ctx
      .command("search <dict:string> <name:text>")
      .before(this.checkDictEmpty.bind(this))
      .action((_, dictName: string, name: string) => {
        if (!dictName || !name) return "参数不足。";

        const dictAdapter = this.findDictAdapter(dictName);
        if (!dictAdapter) return `找不到词库 ${dictName}。`;

        const results = dictAdapter.fuseSearcher.search(name, { limit: 5 });
        if (results.length === 0) return "无搜索结果。";
        return FormatResults(results);
      });

    ctx
      .command("info <dict:string> [name:text]")
      .option("id", "-i <id:number>")
      .before(this.checkDictEmpty.bind(this))
      .action(({ options }, dictName: string, name: string) => {
        if (!dictName) return "请提供词库名。";

        const dictAdapter = this.findDictAdapter(dictName);
        if (!dictAdapter) return `找不到词库 ${dictName}。`;

        if (options.id) {
          const dictElem = dictAdapter.dict[options.id];
          if (!dictElem) return "请输入有效范围的id。";
          return FormatInfo(dictElem, options.id);
        }

        if (name) {
          const results = dictAdapter.fuseSearcher.search(name, {
            limit: 1,
          });
          if (results.length === 0) return "无搜索结果。";
          return FormatInfo(results[0].item, results[0].refIndex);
        }

        return "请提供搜索名或者id。";
      });

    ctx
      .command("addalias <dict:string> <id:number> <alias:text>")
      .option("force", "-f")
      .alias("aa")
      .before(this.checkDictEmpty.bind(this))
      .action(
        ({ options, session }, dictName: string, id: number, alias: string) => {
          if (!id || !alias) return "参数不足。";

          const dictAdapter = this.findDictAdapter(dictName);
          if (!dictAdapter) return `找不到词库 ${dictName}。`;

          if (!config.canWrite) return "管理员已设置词典为不可修改。";

          if (dictAdapter.dictType !== "alias") {
            if (!options.force) return "该词典类型为非别名类型。";
            return "暂未实现。"; // TODO: forced addalias function
          }

          if (this.haveAlias(dictAdapter, alias)) return "该别名已被创建。";

          const dictElem = dictAdapter.dict[id];
          if (!dictElem) return "请输入有效范围的id。";

          dictElem.aliases.push(alias);
          dictAdapter
            .writePath()
            .then(() => {
              session.send("创建别名成功。");
            })
            .catch((err) => {
              session.send("创建别名失败。");
              this.logger.error(err);
            });
          return "创建中······";
        }
      );

    ctx
      .command("kaizimu")
      .option("entries", "-e <entries:number>")
      .alias("开字母")
      .before(this.checkDictEmpty.bind(this))
      .action(({ session, options }, dictName: string) => {
        const { game } = this.getIndexAndGame(session);
        if (game) return "正在游戏中，请使用/giveup指令放弃本次游戏。";

        const dictAdapter = this.findDictAdapter(dictName);
        if (!dictAdapter) return `找不到词库 ${dictName}。`;

        const newGame = new Game(dictAdapter, session);
        this.games.push(newGame);

        this.dispose = ctx.middleware((session, next) => {
          const raw = session.content;

          const { game, index } = this.getIndexAndGame(session);
          if (!game) return next();

          if (raw.slice(0, 2) === "开歌") {
            let result = game.uncoverEntry(raw.slice(2));
            if (game.checkAllGuessed()) {
              const time = Date.now() - game.startTime;
              this.games.splice(index, 1);
              this.dispose();
              return GameEndInterface(result, time);
            }
            return result;
          }

          if (raw.slice(0, 1) === "开") {
            return game.uncoverLetter(raw[1]);
          }
        });

        return newGame.start(options.entries);
      });

    ctx
      .command("giveup")
      .alias("不玩了")
      .action(({ session }) => {
        const { index, game } = this.getIndexAndGame(session);
        if (!game) return "未开始游戏，请使用/kaizimu指令开启游戏。";

        this.games.splice(index, 1);
        return game.giveup();
      });

    ctx.command("monitor").action(() => {
      return GameMonitor({ games: this.games });
    });
  }

  checkDictEmpty() {
    if (this.dictAdapters.length === 0) {
      return "没有词库，请联系管理员。";
    }
  }

  findDictAdapter(dictName: string) {
    for (const _dictAdapter of this.dictAdapters) {
      if (_dictAdapter.dictName === dictName) return _dictAdapter;
    }
    return null;
  }

  haveAlias(dictAdapter: DictAdapter, alias: string) {
    for (const _dictElem of dictAdapter.dict) {
      for (const _alias of _dictElem.aliases) {
        if (_alias === alias) return true;
      }
    }
    return false;
  }

  async init() {
    this.games = [];
    await this.loadDicts();
  }

  async loadDicts() {
    this.dictAdapters = [];

    if (this.dictInfos.length === 0) {
      this.logger.info("当前没有任何词库。");
      return;
    }

    const loadPromises = this.dictInfos.map(
      (dictInfo) =>
        new Promise<void>((resolve) => {
          const dictAdapter = new DictAdapter(dictInfo);
          dictAdapter
            .loadPath()
            .then((dictName) => {
              this.dictAdapters.push(dictAdapter);
              this.logger.info(`成功加载词库 ${dictName}。`);
              resolve();
            })
            .catch((err) => {
              this.logger.error(err);
              resolve();
            });
        })
    );

    await Promise.all(loadPromises);

    this.logger.info(
      `词库已加载 ${this.dictAdapters.length}/${this.dictInfos.length} 个。`
    );
  }

  getIndexAndGame(gameId: GameId) {
    for (const [index, game] of this.games.entries()) {
      if (game.hasGameId(gameId)) return { index, game };
    }
    return { index: null, game: null };
  }
}

namespace Kaizimu {
  export interface Config {
    dictInfos: DictInfo[];
    canWrite: boolean;
  }

  export const Config: Schema<Config> = Schema.object({
    dictInfos: Schema.array(
      Schema.object({
        dictName: Schema.string()
          .required()
          .description("词库名称（用于指令查询）"),
        path: Schema.path().required().description("词库路径"),
      })
    )
      .role("table")
      .description("词库列表。"),
    canWrite: Schema.boolean().default(false).description("是否允许写入别名。"),
  });
}

export default Kaizimu;
