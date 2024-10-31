export function randomSubarry<T>(arr: T[], num: number): T[] {
  return arr
    .map((elem) => {
      return { index: Math.random(), elem };
    })
    .sort((a, b) => a.index - b.index)
    .map((compound) => compound.elem).slice(0, Math.min(num, arr.length));
}
