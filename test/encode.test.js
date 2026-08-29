"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const sharp = require("sharp");

const { encodeImage } = require("../src/encode");
const {
  cleanupFixtures,
  createTempDir,
  sizeOf,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

function job(source, outputPath, format, whenLarger) {
  return { source, outputPath, format, whenLarger };
}

test("writes an optimized copy without touching the source", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg", { width: 256, height: 256 });
  const before = fs.readFileSync(source);

  const result = await encodeImage(
    job(source, path.join(out, "a.jpg"), "jpg", "copy"),
    { quality: 60, size: null },
  );

  assert.equal(result.action, "written");
  assert.ok(result.newSize < result.originalSize);
  assert.ok(fs.existsSync(path.join(out, "a.jpg")));
  assert.deepEqual(fs.readFileSync(source), before);
});

test("converts to the job's format", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg");

  const result = await encodeImage(
    job(source, path.join(out, "a.webp"), "webp", "write"),
    { quality: 70, size: null },
  );

  assert.equal(result.action, "written");
  const metadata = await sharp(path.join(out, "a.webp")).metadata();
  assert.equal(metadata.format, "webp");
});

test("copies the source when the encode is larger and whenLarger is copy", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  // Encode once at low quality so a q100 re-encode is guaranteed larger.
  const original = await writeImage(dir, "big.jpg", { width: 256, height: 256 });
  await encodeImage(job(original, path.join(dir, "small.jpg"), "jpg", "write"), {
    quality: 40,
    size: null,
  });
  const source = path.join(dir, "small.jpg");

  const result = await encodeImage(
    job(source, path.join(out, "small.jpg"), "jpg", "copy"),
    { quality: 100, size: null },
  );

  assert.equal(result.action, "copied");
  assert.equal(result.newSize, result.originalSize);
  assert.equal(sizeOf(path.join(out, "small.jpg")), sizeOf(source));
});

test("keeps the source when the encode is larger and whenLarger is keep", async () => {
  const dir = createTempDir();
  const original = await writeImage(dir, "big.jpg", { width: 256, height: 256 });
  await encodeImage(job(original, path.join(dir, "small.jpg"), "jpg", "write"), {
    quality: 40,
    size: null,
  });
  const source = path.join(dir, "small.jpg");
  const before = fs.readFileSync(source);

  const result = await encodeImage(job(source, source, "jpg", "keep"), {
    quality: 100,
    size: null,
  });

  assert.equal(result.action, "kept");
  assert.deepEqual(fs.readFileSync(source), before);
});

test("resizes to fit within the requested size", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg", { width: 200, height: 100 });

  await encodeImage(job(source, path.join(out, "a.jpg"), "jpg", "write"), {
    quality: 80,
    size: { width: 50, height: 50 },
  });

  const metadata = await sharp(path.join(out, "a.jpg")).metadata();
  assert.ok(metadata.width <= 50 && metadata.height <= 50);
});

test("cleans up the temp file when encoding fails", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = writeBrokenImage(dir);

  await assert.rejects(
    encodeImage(job(source, path.join(out, "broken.png"), "png", "copy"), {
      quality: 80,
      size: null,
    }),
  );

  assert.deepEqual(
    fs.readdirSync(out).filter((name) => name.includes("oi_tmp")),
    [],
  );
});
