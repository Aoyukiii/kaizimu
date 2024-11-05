import DictAdapter, { DictElem } from "./DictAdapter";
import { randomSubarray } from "./utils";

export interface GameId {
  guildId?: string;
  userId: string;
}

interface GuessElem extends DictElem {
  guessed: boolean;
}

export default class Game {
  private dictAdapter: DictAdapter;
  public readonly gameId: GameId;
  public readonly startTime: number;

  private EntriesToGuess: GuessElem[];
  private letterGuessed: string[];

  constructor(dictAdapter: DictAdapter, gameId: GameId) {
    this.startTime = Date.now();
    this.dictAdapter = dictAdapter;
    const { guildId, userId } = gameId;
    this.gameId = { guildId, userId };
  }

  hasGameId(gameId: GameId) {
    if (this.gameId.guildId && !gameId.guildId) return false;
    if (!this.gameId.guildId && gameId.guildId) return false;
    if (this.gameId.guildId) return this.gameId.guildId === gameId.guildId;
    else return this.gameId.userId === gameId.userId;
  }

  start(num?: number) {
    this.letterGuessed = [];
    this.EntriesToGuess = randomSubarray(this.dictAdapter.dict, num ?? 6).map(
      (entry) => {
        return { ...entry, guessed: false };
      }
    );

    return this.showNormal();
  }

  giveup() {
    return this.showGiveup();
  }

  uncoverLetter(letter: string) {
    if (!letter || letter === " ") return "不知道你要开哪个字母捏······";
    if (this.letterGuessed.includes(letter))
      return "这个字母已经被开过了捏······";
    this.letterGuessed.push(letter);
    return this.showNormal();
  }

  uncoverEntry(entry: string) {
    const userGuess = this.dictAdapter.fuseSearcher.search(entry)[0].item.name;
    if (!userGuess) return `未找到"${userGuess}"。`;

    for (const entry of this.EntriesToGuess) {
      if (entry.name === userGuess) {
        if (entry.guessed) return `"${userGuess}"已经被猜过了捏······`;

        entry.guessed = true;
        return this.showNormal();
      }
    }
    return `"${userGuess}"不在本次范围内捏······`;
  }

  showNormal() {
    const reg = new RegExp(`[^${this.letterGuessed.join("")}\\s]+`, "gi");
    return (
      this.EntriesToGuess.map((entry) => {
        if (entry.guessed) return "🟢 " + entry.name;
        else
          return (
            "⚪ " + entry.name.replace(reg, (match) => "*".repeat(match.length))
          );
      }).join("\n") + `\n--------\n已开字母: ${this.letterGuessed.join(" ")}`
    );
  }

  showGiveup() {
    return this.EntriesToGuess.map((entry) => {
      if (entry.guessed) return "🟢 " + entry.name;
      else return "🔴 " + entry.name;
    }).join("\n");
  }

  checkAllGuessed() {
    for (const entry of this.EntriesToGuess) {
      if (!entry.guessed) return false;
    }
    return true;
  }
}
