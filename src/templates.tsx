import { FuseResult } from "fuse.js";
import DictAdapter, { DictElem } from "./DictAdapter";
import Game from "./Game";

export function CustomizeList<T, U>({
  arr,
  callback,
}: {
  arr: T[];
  callback?: (elem: T, index?: number) => U;
}) {
  if (!callback) callback = (elem) => <p>{elem}</p>;

  return <>{arr.map(callback)}</>;
}

export function DictList({ dictAdapters }: { dictAdapters: DictAdapter[] }) {
  return (
    <>
      <p>词库:</p>
      <CustomizeList
        arr={dictAdapters}
        callback={(dictAdapter) => <p>• {dictAdapter.dictName}</p>}
      />
    </>
  );
}

export function GameMonitor({ games }: { games: Game[] }) {
  return (
    <>
      <p>游戏状态:</p>
      <CustomizeList
        arr={games}
        callback={(game, index) => (
          <>
            <p>[{index + 1}]</p>
            <p>
              类型:
              {game.gameId.guildId ? (
                <>群聊 ({game.gameId.guildId})</>
              ) : (
                <>私聊</>
              )}
            </p>
            <p>发起人: {game.gameId.userId}</p>
          </>
        )}
      />
    </>
  );
}

export function GameEndInterface(giveupList: string, time: number) {
  return (
    <>
      <p>nmsl</p>
      <p>{giveupList}</p>
      <p>---- 本次游戏已结束 ----</p>
      <p>---- 用时 {time / 1000} 秒 ----</p>
    </>
  );
}

export function FormatResults({
  results,
}: {
  results: FuseResult<DictElem>[];
}) {
  return (
    <>
      <p>搜索结果</p>
      <CustomizeList
        arr={results}
        callback={(result, i) => (
          <>
            <p>
              [{i + 1}] {result.item.name}
            </p>
            <p>
              ({result.score.toFixed(2)}, id: {result.refIndex})
            </p>
          </>
        )}
      />
    </>
  );
}

export function FormatInfo({ result, id }: { result: DictElem; id: number }) {
  let aliasInfo;
  if (result.aliases.length === 0) aliasInfo = <p>别名: 无</p>;
  else
    aliasInfo = (
      <>
        <p>别名:</p>
        <CustomizeList
          arr={result.aliases}
          callback={(alias) => <p>• {alias}</p>}
        />
      </>
    );
  return (
    <>
      <p>{result.name}</p>
      <p>------------</p>
      <p>id: {id}</p>
      {aliasInfo}
    </>
  );
}
