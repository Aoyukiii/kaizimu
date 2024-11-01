import fs from "fs/promises";
import Fuse, { Expression } from "fuse.js";
import { name } from ".";

export interface DictElem {
  name: string;
  aliases?: string[];
}

export interface DictInfo {
  dictName: string;
  path: string;
}

export class UnkownError extends Error {
  constructor(dictName: string, err: Error) {
    super(`加载词库 ${dictName} 时出错：未知错误。\n${err.message}`);
    this.name = this.constructor.name;
  }
}

export class DictUnrecognizeError extends Error {
  constructor(dictName: string) {
    super(`加载词库 ${dictName} 时出错：无法识别的词库。`);
    this.name = this.constructor.name;
  }
}

export default class DictAdapter {
  private readonly path: string;
  public dict: DictElem[];
  public dictName: string;
  public dictType: "name-only" | "alias";
  public fuseSearcher: Fuse<DictElem>;

  constructor(dictInfo: DictInfo) {
    this.path = dictInfo.path;
    this.dictName = dictInfo.dictName;
    // this.loadPath(this.path);
  }

  parse(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new DictUnrecognizeError(this.dictName);
    }
  }

  async loadPath() {
    try {
      const raw = await fs.readFile(this.path, "utf-8");

      let arrRaw: unknown[] = this.parse(raw);
      if (typeof arrRaw[0] === "string") {
        this.dictType = "name-only";
        this.dict = (arrRaw as string[]).map((name) => {
          return { name };
        });
      } else if (
        typeof arrRaw[0] === "object" &&
        (arrRaw[0] as DictElem).name
      ) {
        this.dictType = "alias";
        this.dict = arrRaw as DictElem[];
      } else {
        throw new DictUnrecognizeError(this.dictName);
      }

      this.fuseSearcher = new Fuse(this.dict, {
        includeScore: true,
        keys: ["name", "aliases"],
      });

      return this.dictName;
    } catch (err) {
      if (err instanceof DictUnrecognizeError) {
        throw err;
      }
      throw new UnkownError(this.dictName, err);
    }
  }

  async writePath() {
    try {
      await fs.writeFile(this.path, JSON.stringify(this.dict, null, 2));
    } catch (err) {
      throw err;
    }
  }
}
