"use strict";

/**
 * Run `worker` over every item, never more than `limit` at a time.
 *
 * Results come back in input order however the work interleaves, so callers can
 * fold them into a summary that does not depend on which image finished first.
 *
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 * @template T, R
 */
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  const consume = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, consume);
  await Promise.all(workers);

  return results;
}

module.exports = { runPool };
