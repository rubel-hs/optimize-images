"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const { optimizeImages } = require("../src/run");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

/** Input folder inside a tracked temp dir, so the -oi-out sibling is cleaned up. */
async function inputFolder(images) {
  const parent = createTempDir();
  const input = path.join(parent, "images");
  for (const [name, options] of images) await writeImage(input, name, options);
  return input;
}

function filesIn(input) {
  return listFiles(input).map((rel) => path.join(input, rel));
}

test("default run mirrors into the -oi-out sibling and leaves sources alone", async () => {
  const input = await inputFolder([
    ["a.jpg", { width: 256, height: 256 }],
    [path.join("nested", "b.jpg"), { width: 256, height: 256 }],
  ]);
  const before = filesIn(input).map((file) => fs.readFileSync(file));

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    quality: 60,
  });

  const outDir = `${input}-oi-out`;
  assert.equal(summary.outputDir, outDir);
  assert.equal(summary.optimized, 2);
  assert.deepEqual(listFiles(outDir), ["a.jpg", path.join("nested", "b.jpg")]);
  assert.deepEqual(
    filesIn(input).map((file) => fs.readFileSync(file)),
    before,
  );
});

test("a custom output folder is honored", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  const custom = path.join(createTempDir(), "optimized");

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    output: custom,
    quality: 60,
  });

  assert.equal(summary.outputDir, path.resolve(custom));
  assert.deepEqual(listFiles(custom), ["a.jpg"]);
});

test("inPlace overwrites sources and creates no sibling folder", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  const file = path.join(input, "a.jpg");
  const sizeBefore = fs.statSync(file).size;

  const summary = await optimizeImages([file], { inPlace: true, quality: 60 });

  assert.equal(summary.outputDir, null);
  assert.ok(fs.statSync(file).size < sizeBefore);
  assert.ok(!fs.existsSync(`${input}-oi-out`));
});

test("re-running over its own output copies files that cannot shrink", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  await optimizeImages(filesIn(input), { inputRoot: input, quality: 40 });
  const firstOut = `${input}-oi-out`;

  const summary = await optimizeImages(
    listFiles(firstOut).map((rel) => path.join(firstOut, rel)),
    { inputRoot: firstOut, quality: 100 },
  );

  assert.equal(summary.copied, 1);
  assert.equal(summary.optimized, 0);
  assert.deepEqual(listFiles(`${firstOut}-oi-out`), ["a.jpg"]);
});

test("a broken image is reported and the run continues", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  writeBrokenImage(input, "broken.png");
  const failures = [];

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    quality: 60,
  }, {
    onFailure: (file) => failures.push(path.basename(file)),
  });

  assert.equal(summary.failed, 1);
  assert.equal(summary.optimized, 1);
  assert.deepEqual(failures, ["broken.png"]);
  assert.equal(summary.failures[0].file, path.join(input, "broken.png"));
});

test("rejects -o aliased to the input dir through a symlink", async (t) => {
  const input = await inputFolder([["a.jpg", {}]]);
  const link = path.join(path.dirname(input), "link-to-images");

  try {
    fs.symlinkSync(input, link, "dir");
  } catch {
    t.skip("cannot create symlinks on this platform");
    return;
  }

  await assert.rejects(
    optimizeImages(filesIn(input), { inputRoot: input, output: link }),
    UserError,
  );
});

test("rejects an output folder nested inside the input tree", async () => {
  const input = await inputFolder([["a.jpg", {}]]);
  const nestedOut = path.join(input, "out");

  await assert.rejects(
    optimizeImages(filesIn(input), { inputRoot: input, output: nestedOut }),
    UserError,
  );
});

test("rejects an output path that exists as a file", async () => {
  const input = await inputFolder([["a.jpg", {}]]);
  const clash = path.join(createTempDir(), "not-a-dir");
  fs.writeFileSync(clash, "occupied");

  await assert.rejects(
    optimizeImages(filesIn(input), { inputRoot: input, output: clash }),
    UserError,
  );
});

test("rejects inPlace combined with output", async () => {
  await assert.rejects(
    optimizeImages([], { inPlace: true, output: "somewhere" }),
    UserError,
  );
});

test("rejects a run without inputRoot unless inPlace", async () => {
  await assert.rejects(optimizeImages([], {}), UserError);
});

test("rejects an unsupported format with a UserError, not a crash", async () => {
  const input = await inputFolder([["a.jpg", {}]]);

  await assert.rejects(
    optimizeImages(filesIn(input), { inputRoot: input, format: "bogus" }),
    UserError,
  );
});

test("format: undefined and format: null both fall back to the default", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);

  for (const format of [undefined, null]) {
    const summary = await optimizeImages(filesIn(input), {
      inputRoot: input,
      format,
      quality: 60,
    });
    assert.equal(summary.optimized + summary.copied, 1);
  }
});
