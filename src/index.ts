import { Context, Logger, Schema, Session } from "koishi";
import Fuse, { FuseResult } from "fuse.js";
import { randomSubarray } from "./utils";
import { permission } from "process";
import DictAdapter, { DictInfo, DictElem } from "./DictAdapter";

export const name = "kaizimu";

export interface Config {}

export const Config: Schema<Config> = Schema.object({});

interface LibItem {
  name: string;
  aliases?: string[];
}

interface GuessInfo extends LibItem {
  // name: string;
  guessed: boolean;
}

class Kaizimu {
  private readonly dictInfos: DictInfo[];
  private dictAdapters: DictAdapter[];
  private readonly logger: Logger;

  constructor(ctx: Context, config: Kaizimu.Config) {
    this.logger = new Logger("kaizimu");
    this.dictInfos = config.dictInfos;
    this.init(ctx).then(() => {
      this.logger.info("初始化已完成。");
    });

    ctx
      .command("dict")
      .before(this.checkDictEmpty.bind(this))
      .action(() => {
        return (
          "词库:\n• " +
          this.dictAdapters
            .map((dictAdapter) => dictAdapter.dictName)
            .join("\n• ")
        );
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
        return this.formatResults(results);
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
          return this.formatInfo(dictElem, options.id);
        }

        if (name) {
          const results = dictAdapter.fuseSearcher.search(name, {
            limit: 1,
          });
          if (results.length === 0) return "无搜索结果。";
          return this.formatInfo(results[0].item, results[0].refIndex);
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

          if (options.force && dictAdapter.dictType !== "alias") {
            return "暂未实现。"; // TODO
          }

          if (dictAdapter.dictType === "alias") {
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
            return "创建中......";
          }
        }
      );
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

  async init(ctx: Context) {
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

  formatResults(results: FuseResult<DictElem>[]) {
    return (
      `搜索结果:\n` +
      results
        .map(
          (result, i) =>
            `[${i + 1}] ${result.item.name}` +
            `\n      (${result.score.toFixed(2)}, id: ${
              result.refIndex // TODO: id not suitable
            })`
        )
        .join("\n")
    );
  }

  formatInfo(result: DictElem, id: number) {
    return (
      `${result.name}\n------------\n` +
      `id: ${id}\n` +
      `别名:` +
      (result.aliases.length === 0 ? ` 无` : `\n• `) +
      result.aliases.join("\n• ")
    );
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
