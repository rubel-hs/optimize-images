"use strict";

const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const { after, describe, it } = require("node:test");

const { optimizeImages } = require("../src/optimize-images");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  sizeOf,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

after(cleanupFixtures);

describe("optimizeImages", () => {
  it("tallies sizes across every file", async () => {
    const dir = createTempDir();
    const files = [
      await writeImage(dir, "a.jpg", { width: 200, height: 150, seed: 1 }),
      await writeImage(dir, "b.jpg", { width: 200, height: 150, seed: 2 }),
    ];
    const before = files.reduce((total, file) => total + sizeOf(file), 0);

    const summary = await optimizeImages(files, { quality: 20 });

    assert.equal(summary.total, 2);
    assert.equal(summary.optimized, 2);
    assert.equal(summary.failed, 0);
    assert.equal(summary.originalSize, before);
    assert.equal(
      summary.newSize,
      files.reduce((total, file) => total + sizeOf(file), 0),
    );
    assert.ok(summary.newSize < summary.originalSize);
  });

  it("counts deleted sources", async () => {
    const dir = createTempDir();
    const files = [
      await writeImage(dir, "a.png"),
      await writeImage(dir, "b.png"),
    ];

    const summary = await optimizeImages(files, {
      format: "webp",
      deleteOriginal: true,
    });

    assert.equal(summary.deleted, 2);
    assert.deepEqual(listFiles(dir), ["a.webp", "b.webp"]);
  });

  it("keeps going past a broken file and records the failure", async () => {
    const dir = createTempDir();
    const good = await writeImage(dir, "good.jpg");
    const broken = writeBrokenImage(dir, "broken.png");
    const alsoGood = await writeImage(dir, "also-good.jpg");

    const summary = await optimizeImages([good, broken, alsoGood], {});

    assert.equal(summary.total, 3);
    assert.equal(summary.optimized, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0].file, broken);
    assert.match(summary.failures[0].message, /unsupported image format/i);
  });

  it("excludes failed files from the size totals", async () => {
    const dir = createTempDir();
    const good = await writeImage(dir, "good.jpg", { width: 200, height: 150 });
    const broken = writeBrokenImage(dir, "broken.png");
    const goodSize = sizeOf(good);

    const summary = await optimizeImages([good, broken], { quality: 20 });

    assert.equal(summary.originalSize, goodSize);
    assert.equal(summary.newSize, sizeOf(good));
  });

  it("reports progress once per file, in order", async () => {
    const dir = createTempDir();
    const files = [
      await writeImage(dir, "a.jpg"),
      writeBrokenImage(dir, "broken.png"),
      await writeImage(dir, "c.jpg"),
    ];

    const progress = [];
    await optimizeImages(files, {}, {
      onProgress: (done, total) => progress.push([done, total]),
    });

    assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  });

  it("hands each failure to onFailure as it happens", async () => {
    const dir = createTempDir();
    const broken = writeBrokenImage(dir, "broken.png");

    const seen = [];
    await optimizeImages([broken], {}, {
      onFailure: (file, error) => seen.push([path.basename(file), error.message]),
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0][0], "broken.png");
    assert.match(seen[0][1], /unsupported image format/i);
  });

  it("lets a conversion overwrite a previous run's output", async () => {
    const dir = createTempDir();
    const jpg = await writeImage(dir, "logo.jpg", { width: 200, height: 150, seed: 1 });
    const webp = await writeImage(dir, "logo.webp", { width: 200, height: 150, seed: 2 });

    const summary = await optimizeImages([jpg, webp], { format: "webp" });

    assert.equal(summary.total, 2);
    assert.equal(summary.optimized, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(listFiles(dir), ["logo.jpg", "logo.webp"]);
  });

  it("counts progress against the files it will actually touch", async () => {
    const dir = createTempDir();
    const jpg = await writeImage(dir, "logo.jpg");
    const webp = await writeImage(dir, "logo.webp");

    const progress = [];
    await optimizeImages([jpg, webp], { format: "webp" }, {
      onProgress: (done, total) => progress.push([done, total]),
    });

    assert.deepEqual(progress, [[1, 1]]);
  });

  it("optimizes a file already in the target format when nothing contests it", async () => {
    const dir = createTempDir();
    const webp = await writeImage(dir, "solo.webp", { width: 200, height: 150 });

    const summary = await optimizeImages([webp], { format: "webp", quality: 20 });

    assert.equal(summary.optimized, 1);
    assert.equal(summary.skipped, 0);
  });

  it("refuses a run where two files would land on the same output path", async () => {
    const dir = createTempDir();
    const jpg = await writeImage(dir, "logo.jpg");
    const png = await writeImage(dir, "logo.png");

    await assert.rejects(
      () => optimizeImages([jpg, png], { format: "webp" }),
      (error) =>
        error instanceof UserError && error.message.includes("logo.webp"),
    );

    assert.deepEqual(listFiles(dir), ["logo.jpg", "logo.png"]);
  });

  const CORES = os.availableParallelism();

  it("finishes sooner with a wider concurrency", {
    // On a single-core box — a pinned CI container, a small VM — there is no
    // second core to spread onto and the claim is simply not true.
    skip: CORES > 1 ? false : `needs more than one core, this machine offers ${CORES}`,
  }, async () => {
    const corpus = async () => {
      const dir = createTempDir();
      return Promise.all(
        Array.from({ length: 8 }, (_, seed) =>
          writeImage(dir, `img-${seed}.jpg`, {
            width: 1200,
            height: 900,
            seed: seed + 1,
          }),
        ),
      );
    };

    const time = async (files, concurrency) => {
      const started = process.hrtime.bigint();
      const summary = await optimizeImages(files, { concurrency, format: "webp" });
      assert.equal(summary.optimized, 8);
      return Number(process.hrtime.bigint() - started);
    };

    const wide = Math.min(4, CORES);
    const serial = await time(await corpus(), 1);
    const parallel = await time(await corpus(), wide);

    assert.ok(
      parallel < serial * 0.8,
      `expected ${wide} at a time to beat 1 at a time on ${CORES} cores, ` +
        `got ${parallel / 1e6}ms vs ${serial / 1e6}ms`,
    );
  });

  it("handles an empty list without touching the callbacks", async () => {
    let calls = 0;
    const summary = await optimizeImages([], {}, {
      onProgress: () => calls++,
      onFailure: () => calls++,
    });

    assert.equal(calls, 0);
    assert.deepEqual(summary, {
      total: 0,
      optimized: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
      originalSize: 0,
      newSize: 0,
      failures: [],
    });
  });

  it("works without any handlers", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "a.jpg");

    const summary = await optimizeImages([file]);

    assert.equal(summary.optimized, 1);
  });
});
