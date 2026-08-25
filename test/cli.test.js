"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");
const { after, describe, it } = require("node:test");

const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

after(cleanupFixtures);

const BIN = path.join(__dirname, "..", "bin", "oi.js");

/** Colour codes would make the output assertions unreadable, so turn them off. */
function runCli(...args) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return { status, stdout, stderr };
}

describe("oi --help", () => {
  it("prints usage and exits successfully", () => {
    const { status, stdout } = runCli("--help");

    assert.equal(status, 0);
    assert.match(stdout, /Usage:\s+oi <path> \[options\]/);
  });

  it("documents every flag", () => {
    const { stdout } = runCli("--help");

    for (const flag of ["--quality", "--format", "--size", "--concurrency", "--delete-original", "--help"]) {
      assert.ok(stdout.includes(flag), `help does not mention ${flag}`);
    }
  });

  it("shows the real defaults rather than a hard-coded copy", () => {
    const { DEFAULT_OPTIONS } = require("../src/defaults");
    const { stdout } = runCli("--help");

    assert.match(stdout, new RegExp(`default: ${DEFAULT_OPTIONS.quality}\\b`));
    assert.match(stdout, new RegExp(`default: ${DEFAULT_OPTIONS.format}\\b`));
    assert.match(stdout, new RegExp(`default: ${DEFAULT_OPTIONS.concurrency}\\b`));
  });

  it("prints usage when given no arguments at all", () => {
    const { status, stdout } = runCli();

    assert.equal(status, 0);
    assert.match(stdout, /Usage:/);
  });
});

describe("oi on a real folder", () => {
  it("optimizes recursively and reports the savings", async () => {
    const dir = createTempDir();
    await writeImage(dir, "a.jpg", { width: 200, height: 150, seed: 1 });
    await writeImage(dir, "nested/b.jpg", { width: 200, height: 150, seed: 2 });

    const { status, stdout } = runCli(dir, "-q", "20");

    assert.equal(status, 0);
    assert.match(stdout, /Images:\s+2/);
    assert.match(stdout, /2 image\(s\) optimized/);
    assert.match(stdout, /Saved: /);
    assert.deepEqual(listFiles(dir), ["a.jpg", path.join("nested", "b.jpg")]);
  });

  it("converts, resizes and deletes sources in one run", async () => {
    const dir = createTempDir();
    await writeImage(dir, "a.png", { width: 400, height: 200 });

    const { status, stdout } = runCli(dir, "-f", "webp", "-s", "100x100", "-d");

    assert.equal(status, 0);
    assert.match(stdout, /Resize:\s+100×100/);
    assert.match(stdout, /Deleted:\s+1 source file\(s\)/);
    assert.deepEqual(listFiles(dir), ["a.webp"]);
  });

  it("reports a broken file but still exits successfully", async () => {
    const dir = createTempDir();
    await writeImage(dir, "good.jpg");
    writeBrokenImage(dir, "broken.png");

    const { status, stdout, stderr } = runCli(dir);

    assert.equal(status, 0);
    assert.match(stderr, /broken\.png/);
    assert.match(stdout, /1 file\(s\) had errors/);
    assert.match(stdout, /1 image\(s\) optimized/);
  });
});

describe("oi failures", () => {
  const expectFailure = (pattern, ...args) => {
    const { status, stderr } = runCli(...args);
    assert.equal(status, 1);
    assert.match(stderr, pattern);
  };

  it("exits 1 on an unknown flag", () => {
    expectFailure(/Error: Unknown flag "--zap"/, ".", "--zap");
  });

  it("exits 1 on a bad quality", () => {
    expectFailure(/Error: Quality must be a number between 1-100/, ".", "-q", "500");
  });

  it("exits 1 on an unsupported format", () => {
    expectFailure(/Error: Unsupported format "bmp"/, ".", "-f", "bmp");
  });

  it("exits 1 on a malformed size", () => {
    expectFailure(/Error: Size must be in WxH format/, ".", "-s", "600");
  });

  it("exits 1 when the path does not exist", () => {
    const dir = createTempDir();
    expectFailure(/Error: Path does not exist/, path.join(dir, "nope"));
  });

  it("exits 1 when a folder holds no images", () => {
    expectFailure(/Error: No supported images found/, createTempDir());
  });

  it("exits 1 on an unsupported file type", () => {
    expectFailure(/Error: Unsupported file type: \.json/, "package.json");
  });
});
