"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const sharp = require("sharp");
const { after, describe, it } = require("node:test");

const { optimizeImage } = require("../src/optimize-image");
const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  sizeOf,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

after(cleanupFixtures);

describe("optimizeImage keeping the original format", () => {
  it("rewrites the file in place", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.jpg", { width: 200, height: 150 });
    const before = sizeOf(file);

    const result = await optimizeImage(file, { quality: 20 });

    assert.equal(result.outputPath, file);
    assert.equal(result.originalSize, before);
    assert.equal(result.newSize, sizeOf(file));
    assert.deepEqual(listFiles(dir), ["photo.jpg"]);
  });

  it("shrinks a noisy image at low quality", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.jpg", { width: 200, height: 150 });

    const result = await optimizeImage(file, { quality: 20 });

    assert.ok(
      result.newSize < result.originalSize,
      `expected ${result.newSize} < ${result.originalSize}`,
    );
  });

  it("encodes each file back to its own format", async () => {
    const dir = createTempDir();
    const png = await writeImage(dir, "a.png");
    const webp = await writeImage(dir, "b.webp");

    await optimizeImage(png, {});
    await optimizeImage(webp, {});

    assert.equal((await sharp(png).metadata()).format, "png");
    assert.equal((await sharp(webp).metadata()).format, "webp");
  });

  it("never deletes the source, even with deleteOriginal set", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.jpg");

    const result = await optimizeImage(file, { deleteOriginal: true });

    assert.equal(result.deleted, false);
    assert.deepEqual(listFiles(dir), ["photo.jpg"]);
  });
});

describe("optimizeImage converting", () => {
  it("writes a new file and leaves the source alone", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.png");

    const result = await optimizeImage(file, { format: "webp" });

    assert.equal(result.outputPath, path.join(dir, "photo.webp"));
    assert.equal(result.deleted, false);
    assert.deepEqual(listFiles(dir), ["photo.png", "photo.webp"]);
    assert.equal((await sharp(result.outputPath).metadata()).format, "webp");
  });

  it("deletes the source when asked and the path differs", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.png");

    const result = await optimizeImage(file, {
      format: "webp",
      deleteOriginal: true,
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(listFiles(dir), ["photo.webp"]);
  });

  it("normalises alias formats to one extension", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.png");

    const result = await optimizeImage(file, { format: "jpeg" });

    assert.equal(result.outputPath, path.join(dir, "photo.jpg"));
    assert.equal((await sharp(result.outputPath).metadata()).format, "jpeg");
  });
});

describe("optimizeImage resizing", () => {
  it("fits inside the box and keeps the aspect ratio", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "wide.png", { width: 400, height: 200 });

    await optimizeImage(file, { size: { width: 100, height: 100 } });

    const { width, height } = await sharp(file).metadata();
    assert.deepEqual({ width, height }, { width: 100, height: 50 });
  });

  it("never enlarges an image already smaller than the box", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "small.png", { width: 40, height: 30 });

    await optimizeImage(file, { size: { width: 800, height: 600 } });

    const { width, height } = await sharp(file).metadata();
    assert.deepEqual({ width, height }, { width: 40, height: 30 });
  });
});

describe("optimizeImage failures", () => {
  it("throws on a file sharp cannot read", async () => {
    const dir = createTempDir();
    const file = writeBrokenImage(dir, "broken.png");

    await assert.rejects(optimizeImage(file, {}));
  });

  it("leaves the source untouched when encoding fails", async () => {
    const dir = createTempDir();
    const file = writeBrokenImage(dir, "broken.png");
    const before = sizeOf(file);

    await assert.rejects(optimizeImage(file, {}));

    assert.equal(sizeOf(file), before);
  });

  it("leaves no temporary file behind", async () => {
    const dir = createTempDir();
    writeBrokenImage(dir, "broken.png");
    await assert.rejects(optimizeImage(path.join(dir, "broken.png"), {}));

    const leftovers = listFiles(dir).filter((file) => file.endsWith(".oi_tmp"));
    assert.deepEqual(leftovers, []);
  });
});
