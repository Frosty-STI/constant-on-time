export const nearestXIndex = (samples: readonly number[], target: number): number => {
  if (samples.length === 0 || !Number.isFinite(target)) return 0;
  if (target <= (samples[0] ?? target)) return 0;
  const lastIndex = samples.length - 1;
  if (target >= (samples[lastIndex] ?? target)) return lastIndex;

  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((samples[middle] ?? target) < target) low = middle + 1;
    else high = middle;
  }

  const right = low;
  const left = Math.max(0, right - 1);
  return target - (samples[left] ?? target) <= (samples[right] ?? target) - target ? left : right;
};
