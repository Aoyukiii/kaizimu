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

// class Kaizimu {
//   private fuse: Fuse<LibItem>;
//   private logger: Logger;
//   private LibList: LibItem[];
//   private LibType: "name-only" | "alias";

//   private onGame: boolean;
//   private dispose: () => boolean;
//   private itemsToGuess: GuessInfo[];
//   private letterGuessed: string[];

//   constructor(ctx: Context, config: Kaizimu.Config) {
//     this.logger = new Logger("kaizimu");
//     this.onGame = false;

//     this.loadPath(config.dictionaries);

//     ctx.command("search <name:text>").action(({ session }, name: string) => {
//       try {
//         const result = this.search(name);
//         if (result.length === 0) return `无查询结果。`;
//         return [
//           h.quote(session.messageId),
//           h.text(
//             `您要找的是不是：${result[0].item.name} (ID: ${result[0].refIndex})\n`
//           ),
//           h.text(`相似的还有：\n`),
//           h.text(
//             result
//               .map(
//                 (song, index) =>
//                   `[#${index + 1}] ${song.item.name} (${song.score.toFixed(
//                     2
//                   )}, ID: ${song.refIndex})`
//               )
//               .join("\n")
//           ),
//         ];
//       } catch (err) {
//         this.logger.error(err);
//         return "未知错误，请联系管理员。";
//       }
//     });

//     ctx.command("alias <name:text>").action(({ session }, name: string) => {
//       try {
//         const result = this.search(name, 1);
//         if (result.length === 0) return `无查询结果。`;
//         return [
//           h.quote(session.messageId),
//           h.text(
//             `“${result[0].item.name}”(ID: ${result[0].refIndex})有如下别名：`
//           ),
//           h.text(`\n${result[0].item.aliases.join("\n")}`),
//         ];
//       } catch (err) {
//         this.logger.error(err);
//         return "未知错误，请联系管理员。";
//       }
//     });

//     ctx.command("aliasid <id:number>").action(({ session }, id: number) => {
//       try {
//         const item = this.LibList[id];
//         if (!item) return `无查询结果。`;
//         return [
//           h.quote(session.messageId),
//           h.text(`“${item.name}”(ID: ${id})有如下别名：`),
//           h.text(`\n${item.aliases.join("\n")}`),
//         ];
//       } catch (err) {
//         this.logger.error(err);
//         return "未知错误，请联系管理员。";
//       }
//     });

//     ctx
//       .command("kaizimu")
//       .alias("开字母")
//       .option("length", "-l <length:number>")
//       .action(({ session, options }) => {
//         try {
//           if (this.onGame) return "当前正在游戏中，请使用/giveup指令结束。";
//           this.start(ctx, session, options.length ?? 6);
//           this.onGame = true;
//         } catch (err) {
//           this.logger.error(err);
//           return "未知错误，请联系管理员。";
//         }
//       });

//     ctx.command("giveup").action(() => {
//       if (!this.onGame) return "当前未进行游戏，请使用/start指令开始。";
//       this.dispose();
//       this.onGame = false;
//       return this.onGiveupOutput();
//     });

//     ctx
//       .command("addalias <id:number> <alias:text>")
//       .alias("aa")
//       .action(({ session }, id: number, alias: string) => {
//         if (!id || !alias) {
//           return "请使用完整参数。";
//         }
//         if (this.LibType !== "alias") {
//           return "请使用可添加别名的词库。";
//         }
//         if (this.hasAlias(alias)) {
//           return "这个别名已被添加过。";
//         }
//         this.LibList[id].aliases.push(alias);
//         fs.writeFile(
//           config.path,
//           JSON.stringify(this.LibList, null, 2),
//           (err) => {
//             if (err) {
//               this.logger.error(err);
//               session.send("添加失败");
//               return;
//             }
//             session.send("添加成功。");
//           }
//         );
//       });

//     ctx.command("update").action(({ session }) => {
//       this.loadPath(config.path);
//       return "Ciallo";
//     });
//   }

//   loadPath(path: string) {
//     fs.readFile(path, "utf8", (err: any, raw: string) => {
//       if (err) {
//         this.logger.error(err);
//       }
//       try {
//         let arrRaw: unknown[] = JSON.parse(raw);
//         if (typeof arrRaw[0] === "string") {
//           this.LibType = "name-only";
//           this.LibList = (arrRaw as string[]).map((name) => {
//             return { name };
//           });
//         } else if (
//           typeof arrRaw[0] === "object" &&
//           (arrRaw[0] as LibItem).name
//         ) {
//           this.LibType = "alias";
//           this.LibList = arrRaw as LibItem[];
//         } else {
//           this.logger.error("无法识别的词库。");
//           return;
//         }
//         this.fuse = new Fuse(this.LibList, {
//           includeScore: true,
//           keys: ["name", "aliases"],
//         });
//       } catch (err) {
//         this.logger.error(err);
//       }
//     });
//   }

//   search(name: string, length?: number) {
//     return this.fuse.search(name).slice(0, length ?? 5);
//   }

//   hasAlias(alias: string): boolean {
//     for (const item of this.LibList) {
//       for (const libAlias of item.aliases) {
//         if (libAlias === alias) return true;
//       }
//     }
//     return false;
//   }

//   start(ctx: Context, session: Session<never, never, Context>, length: number) {
//     this.init(session, length);
//     this.dispose = ctx.middleware(async (session, next) => {
//       const raw = session.content;

//       if (raw.slice(0, 1) === "开" && raw.length === 2) {
//         this.uncoverLetter(session, raw);
//         return;
//       }
//       if (raw.slice(0, 2) === "开歌") {
//         this.uncoverItem(session, raw);
//         return;
//       }
//       return next();
//     });
//   }

//   onGameOutput(): string {
//     const reg = new RegExp(`[^${this.letterGuessed.join("")}\\s]+`, "gi");
//     return (
//       this.itemsToGuess
//         .map((item) => {
//           if (item.guessed) return "🟢 " + item.name;
//           return (
//             "⚪ " + item.name.replace(reg, (match) => "*".repeat(match.length))
//           );
//         })
//         .join("\n") + `\n--------\n已开字母: ${this.letterGuessed.join(" ")}`
//     );
//   }

//   onGiveupOutput(): string {
//     return this.itemsToGuess
//       .map((item) => {
//         if (item.guessed) return "🟢 " + item.name;
//         else return "🔴 " + item.name;
//       })
//       .join("\n");
//   }

//   checkAllGuessed() {
//     for (const item of this.itemsToGuess) {
//       if (!item.guessed) return false;
//     }
//     return true;
//   }

//   init(session: Session<never, never, Context>, length: number) {
//     this.itemsToGuess = randomSubarray(this.LibList, length).map((item) => {
//       return { ...item, guessed: false };
//     });
//     this.letterGuessed = [];
//     this.logger.info(this.itemsToGuess);
//     session.send(this.onGameOutput());
//   }

//   async uncoverLetter(session: Session<never, never, Context>, raw: string) {
//     if (this.letterGuessed.includes(raw[1])) {
//       session.send([
//         h.quote(session.messageId),
//         h.text("这个字母已经开过啦......"),
//       ]);
//       return;
//     }
//     this.letterGuessed.push(raw[1]);
//     this.logger.info(this.letterGuessed);
//     session.send(this.onGameOutput());
//     return;
//   }

//   async uncoverItem(session: Session<never, never, Context>, raw: string) {
//     const userGuess: LibItem = this.search(raw)[0]?.item ?? { name: "" };
//     if (userGuess.name === "") {
//       session.send([
//         h.quote(session.messageId),
//         h.text(`未找到歌曲“${raw.slice(2)}”。`),
//       ]);
//     } else {
//       let guessAccepted: boolean = false;
//       for (const item of this.itemsToGuess) {
//         if (item.name === userGuess.name) {
//           item.guessed = true;
//           guessAccepted = true;
//           await session.send(this.onGameOutput());
//           break;
//         }
//       }
//       if (this.checkAllGuessed()) {
//         session.send("本次游戏结束。");
//         this.dispose();
//         this.onGame = false;
//       }
//       if (guessAccepted) return;
//       session.send([
//         h.quote(session.messageId),
//         h.text(`您所猜的歌曲“${userGuess.name}”不在范围内。`),
//       ]);
//     }
//     return;
//   }
// }

// DictAdapter

namespace Kaizimu {
  export interface Config {
    dictInfos: DictInfo[];
    canWrite: boolean;
  }

  export const Config: Schema<Config> = Schema.object({
    dictInfos: Schema.array(
      Schema.object({
        dictName: Schema.string().required(),
        path: Schema.path().required(),
      })
    ).role("table"),
    canWrite: Schema.boolean().default(false),
  });
}

export default Kaizimu;
