"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { after, describe, it } = require("node:test");

const { findImageFiles } = require("../src/find-image-files");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  writeImage,
} = require("./helpers/fixtures");

after(cleanupFixtures);

const baseNames = (files) => files.map((file) => path.basename(file)).sort();

describe("findImageFiles", () => {
  it("returns a single supported file as an absolute path", async () => {
    const dir = createTempDir();
    const file = await writeImage(dir, "photo.png");

    assert.deepEqual(await findImageFiles(file), [path.resolve(file)]);
  });

  it("walks a directory recursively", async () => {
    const dir = createTempDir();
    await writeImage(dir, "a.jpg");
    await writeImage(dir, "nested/b.png");
    await writeImage(dir, "nested/deeper/c.webp");

    assert.deepEqual(baseNames(await findImageFiles(dir)), ["a.jpg", "b.png", "c.webp"]);
  });

  it("skips files that are not images", async () => {
    const dir = createTempDir();
    await writeImage(dir, "a.jpg");
    fs.writeFileSync(path.join(dir, "notes.txt"), "hello");
    fs.writeFileSync(path.join(dir, "data.json"), "{}");

    assert.deepEqual(baseNames(await findImageFiles(dir)), ["a.jpg"]);
  });

  it("finds images whose extension is upper case", async () => {
    const dir = createTempDir();
    await writeImage(dir, "SHOUT.PNG", { format: "png" });

    assert.deepEqual(baseNames(await findImageFiles(dir)), ["SHOUT.PNG"]);
  });

  it("returns absolute paths for a relative input", async () => {
    const dir = createTempDir();
    await writeImage(dir, "a.jpg");

    for (const file of await findImageFiles(path.relative(process.cwd(), dir))) {
      assert.ok(path.isAbsolute(file), `${file} is not absolute`);
    }
  });

  const rejects = (pattern) => (error) => {
    assert.ok(error instanceof UserError, `expected UserError, got ${error.name}`);
    assert.match(error.message, pattern);
    return true;
  };

  it("rejects a path that does not exist", async () => {
    const dir = createTempDir();
    await assert.rejects(
      findImageFiles(path.join(dir, "nope")),
      rejects(/Path does not exist/),
    );
  });

  it("rejects a file that is not a supported image", async () => {
    const dir = createTempDir();
    const file = path.join(dir, "notes.txt");
    fs.writeFileSync(file, "hello");

    await assert.rejects(findImageFiles(file), rejects(/Unsupported file type: \.txt/));
  });

  it("rejects a directory holding no images", async () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, "notes.txt"), "hello");

    await assert.rejects(findImageFiles(dir), rejects(/No supported images found/));
  });
});
