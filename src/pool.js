"use strict";

/**
 * Results come back in input order. An aborted signal stops new items from
 * being picked up; whatever is already running is left to finish, so a worker
 * mid-write is never cut off. Items that never ran stay holes in the result.
 *
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {AbortSignal} [signal]
 * @returns {Promise<R[]>}
 * @template T, R
 */
async function runPool(items, limit, worker, signal) {
  const results = new Array(items.length);
  let next = 0;

  const consume = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, consume);
  await Promise.all(workers);

  return results;
}

module.exports = { runPool };
