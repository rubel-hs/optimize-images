"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");

const { discoverImages } = require("../src/discover");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

test("returns the resolved directory as root with every nested image", async () => {
  const dir = createTempDir();
  await writeImage(dir, "z.jpg");
  await writeImage(dir, path.join("nested", "b.png"));
  await writeImage(dir, "a.jpg");

  const { root, files } = await discoverImages(dir);

  assert.equal(root, path.resolve(dir));
  assert.deepEqual(
    files.map((file) => path.relative(root, file)),
    ["a.jpg", path.join("nested", "b.png"), "z.jpg"],
  );
});

test("a single file input uses its parent directory as root", async () => {
  const dir = createTempDir();
  const file = await writeImage(dir, "photo.jpg");

  const { root, files } = await discoverImages(file);

  assert.equal(root, path.resolve(dir));
  assert.deepEqual(files, [path.resolve(file)]);
});

test("skips directories named *-oi-out", async () => {
  const dir = createTempDir();
  await writeImage(dir, "a.jpg");
  await writeImage(dir, path.join("images-oi-out", "old.jpg"));
  await writeImage(dir, path.join("deep", "x-oi-out", "older.jpg"));

  const { files } = await discoverImages(dir);

  assert.deepEqual(files.map((file) => path.basename(file)), ["a.jpg"]);
});

test("an input directory itself named *-oi-out is still walked", async () => {
  const parent = createTempDir();
  const dir = path.join(parent, "images-oi-out");
  await writeImage(dir, "a.jpg");

  const { files } = await discoverImages(dir);

  assert.equal(files.length, 1);
});

test("matches extensions case-insensitively", async () => {
  const dir = createTempDir();
  await writeImage(dir, "UPPER.JPG");

  const { files } = await discoverImages(dir);

  assert.deepEqual(files.map((file) => path.basename(file)), ["UPPER.JPG"]);
});

test("ignores unsupported files inside a directory", async () => {
  const dir = createTempDir();
  await writeImage(dir, "a.jpg");
  require("fs").writeFileSync(path.join(dir, "notes.txt"), "not an image");

  const { files } = await discoverImages(dir);

  assert.equal(files.length, 1);
});

test("rejects an unsupported single file", async () => {
  const dir = createTempDir();
  const file = path.join(dir, "notes.txt");
  require("fs").writeFileSync(file, "not an image");

  await assert.rejects(discoverImages(file), UserError);
});

test("rejects a path that does not exist", async () => {
  const dir = createTempDir();
  await assert.rejects(discoverImages(path.join(dir, "missing")), UserError);
});

test("rejects a directory with no images", async () => {
  const dir = createTempDir();
  await assert.rejects(discoverImages(dir), UserError);
});
