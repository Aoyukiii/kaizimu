import { Context, h, Logger, Schema, Session } from "koishi";
import fs from "fs";
import Fuse from "fuse.js";
import { randomSubarray } from "./utils";

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
  private fuse: Fuse<LibItem>;
  private logger: Logger;
  private LibList: LibItem[];

  private onGame: boolean;
  private dispose: () => boolean;
  private itemsToGuess: GuessInfo[];
  private letterGuessed: string[];

  constructor(ctx: Context, config: Kaizimu.Config) {
    this.logger = new Logger("kaizimu");
    this.onGame = false;

    fs.readFile(config.path, "utf8", (err: any, raw: string) => {
      if (err) {
        this.logger.error(err);
      }
      try {
        let arrRaw: unknown[] = JSON.parse(raw);
        if (typeof arrRaw[0] === "string") {
          this.LibList = (arrRaw as string[]).map((name) => {
            return { name };
          });
        } else if (
          typeof arrRaw[0] === "object" &&
          (arrRaw[0] as LibItem).name
        ) {
          this.LibList = arrRaw as LibItem[];
        } else {
          this.logger.error("无法识别的词库。");
          return;
        }
        this.fuse = new Fuse(this.LibList, {
          includeScore: true,
          keys: ["name", "aliases"],
        });
      } catch (err) {
        this.logger.error(err);
      }
    });

    ctx.command("search <name:text>").action(({ session }, name: string) => {
      try {
        const result = this.search(name);
        if (result.length === 0) return `无查询结果。`;
        return [
          h.quote(session.messageId),
          h.text(`您要找的是不是：${result[0].item.name}\n`),
          h.text(`相似的还有：\n`),
          h.text(
            result
              .map(
                (item, index) =>
                  `[#${index + 1}] ${item.item.name} (${item.score.toFixed(2)})`
              )
              .join("\n")
          ),
        ];
      } catch (err) {
        this.logger.error(err);
        return "未知错误，请联系管理员。";
      }
    });

    ctx.command("alias <name:text>").action(({ session }, name: string) => {
      try {
        const result = this.search(name, 1);
        if (result.length === 0) return `无查询结果。`;
        return [
          h.quote(session.messageId),
          h.text(`“${result[0].item.name}”有如下别名：`),
          h.text(`\n${result[0].item.aliases.join("\n")}`),
        ];
      } catch (err) {
        this.logger.error(err);
        return "未知错误，请联系管理员。";
      }
    });

    ctx
      .command("start")
      .option("length", "-l <length:number>")
      .action(({ session, options }) => {
        try {
          if (this.onGame) return "当前正在游戏中，请使用/giveup指令结束。";
          this.start(ctx, session, options.length ?? 6);
          this.onGame = true;
        } catch (err) {
          this.logger.error(err);
          return "未知错误，请联系管理员。";
        }
      });

    ctx.command("giveup").action(() => {
      if (!this.onGame) return "当前未进行游戏，请使用/start指令开始。";
      this.dispose();
      this.onGame = false;
      return this.onGiveupOutput();
    });
  }

  search(name: string, length?: number) {
    return this.fuse.search(name).slice(0, length ?? 5);
  }

  start(ctx: Context, session: Session<never, never, Context>, length: number) {
    this.init(session, length);
    this.dispose = ctx.middleware(async (session, next) => {
      const raw = session.content;

      if (raw.slice(0, 1) === "开" && raw.length === 2) {
        this.uncoverLetter(session, raw);
        return;
      }
      if (raw.slice(0, 2) === "开歌") {
        this.uncoverItem(session, raw);
        return;
      }
      return next();
    });
  }

  onGameOutput(): string {
    const reg = new RegExp(`[^${this.letterGuessed.join("")}\\s]+`, "gi");
    return (
      this.itemsToGuess
        .map((item) => {
          if (item.guessed) return "🟢 " + item.name;
          return (
            "⚪ " + item.name.replace(reg, (match) => "*".repeat(match.length))
          );
        })
        .join("\n") + `\n--------\n已开字母: ${this.letterGuessed.join(" ")}`
    );
  }

  onGiveupOutput(): string {
    return this.itemsToGuess
      .map((item) => {
        if (item.guessed) return "🟢 " + item.name;
        else return "🔴 " + item.name;
      })
      .join("\n");
  }

  checkAllGuessed() {
    for (const item of this.itemsToGuess) {
      if (!item.guessed) return false;
    }
    return true;
  }

  init(session: Session<never, never, Context>, length: number) {
    this.itemsToGuess = randomSubarray(this.LibList, length).map((item) => {
      return { ...item, guessed: false };
    });
    this.letterGuessed = [];
    this.logger.info(this.itemsToGuess);
    session.send(this.onGameOutput());
  }

  uncoverLetter(session: Session<never, never, Context>, raw: string) {
    if (this.letterGuessed.includes(raw[1])) {
      session.send([
        h.quote(session.messageId),
        h.text("这个字母已经开过啦......"),
      ]);
      return;
    }
    this.letterGuessed.push(raw[1]);
    this.logger.info(this.letterGuessed);
    session.send(this.onGameOutput());
    return;
  }

  uncoverItem(session: Session<never, never, Context>, raw: string) {
    const userGuess: LibItem = this.search(raw)[0]?.item ?? { name: "" };
    if (userGuess.name === "") {
      session.send([
        h.quote(session.messageId),
        h.text(`未找到歌曲“${raw.slice(2)}”。`),
      ]);
    } else {
      let guessAccepted: boolean = false;
      for (const item of this.itemsToGuess) {
        if (item.name === userGuess.name) {
          item.guessed = true;
          guessAccepted = true;
          session.send(this.onGameOutput());
          break;
        }
      }
      if (this.checkAllGuessed()) {
        session.send("本次游戏结束。");
        this.dispose();
        this.onGame = false;
      }
      if (guessAccepted) return;
      session.send([
        h.quote(session.messageId),
        h.text(`您所猜的歌曲“${userGuess.name}”不在范围内。`),
      ]);
    }
    return;
  }
}

namespace Kaizimu {
  export interface Config {
    path: string;
  }

  export const Config: Schema<Config> = Schema.object({
    path: Schema.path().required(),
  });
}

export default Kaizimu;
