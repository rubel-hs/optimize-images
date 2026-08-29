"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { promisify } = require("util");

const run = promisify(execFile);
const BIN = path.resolve(__dirname, "..", "bin", "oi.js");

const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

async function inputFolder() {
  const parent = createTempDir();
  const input = path.join(parent, "images");
  await writeImage(input, "a.jpg", { width: 256, height: 256 });
  await writeImage(input, path.join("nested", "b.jpg"), { width: 256, height: 256 });
  return input;
}

function oi(...args) {
  return run(process.execPath, [BIN, ...args]);
}

test("default run writes the -oi-out sibling and leaves sources untouched", async () => {
  const input = await inputFolder();
  const before = fs.readFileSync(path.join(input, "a.jpg"));

  const { stdout } = await oi(input, "-q", "60");

  assert.deepEqual(listFiles(`${input}-oi-out`), ["a.jpg", path.join("nested", "b.jpg")]);
  assert.deepEqual(fs.readFileSync(path.join(input, "a.jpg")), before);
  assert.match(stdout, /-oi-out/);
});

test("running the default output twice is idempotent", async () => {
  const input = await inputFolder();
  const before = listFiles(input).map((rel) => fs.readFileSync(path.join(input, rel)));

  await oi(input, "-q", "60");
  const firstRunOutput = listFiles(`${input}-oi-out`);

  await oi(input, "-q", "60");
  const secondRunOutput = listFiles(`${input}-oi-out`);

  assert.deepEqual(secondRunOutput, firstRunOutput);
  assert.deepEqual(
    listFiles(input).map((rel) => fs.readFileSync(path.join(input, rel))),
    before,
  );
});

test("-o writes into the given folder", async () => {
  const input = await inputFolder();
  const custom = path.join(createTempDir(), "optimized");

  await oi(input, "-o", custom, "-q", "60");

  assert.deepEqual(listFiles(custom), ["a.jpg", path.join("nested", "b.jpg")]);
});

test("--in-place overwrites the sources", async () => {
  const input = await inputFolder();
  const file = path.join(input, "a.jpg");
  const sizeBefore = fs.statSync(file).size;

  await oi(input, "--in-place", "-q", "60");

  assert.ok(fs.statSync(file).size < sizeBefore);
  assert.ok(!fs.existsSync(`${input}-oi-out`));
});

test("a single file lands in the parent-named sibling", async () => {
  const input = await inputFolder();

  await oi(path.join(input, "a.jpg"), "-q", "60");

  assert.deepEqual(listFiles(`${input}-oi-out`), ["a.jpg"]);
});

test("-d fails with a migration hint and exit code 1", async () => {
  const input = await inputFolder();

  await assert.rejects(oi(input, "-d"), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /--in-place/);
    return true;
  });
});

test("--in-place with -o fails", async () => {
  const input = await inputFolder();

  await assert.rejects(oi(input, "--in-place", "-o", "out"), (error) => {
    assert.equal(error.code, 1);
    return true;
  });
});

test("a missing path fails with exit code 1", async () => {
  await assert.rejects(oi(path.join(createTempDir(), "missing")), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /does not exist/i);
    return true;
  });
});

test("--help prints usage and exits 0", async () => {
  const { stdout } = await oi("--help");
  assert.match(stdout, /--in-place/);
  assert.match(stdout, /-o, --output/);
  assert.doesNotMatch(stdout, /--delete-original/);
});
