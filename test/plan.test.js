"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");

const { planJobs, resolveOutputRoot } = require("../src/plan");
const { UserError } = require("../src/errors");

const ROOT = path.resolve(path.join("project", "images"));
const OUT = `${ROOT}-oi-out`;
const inRoot = (...parts) => path.join(ROOT, ...parts);

const defaults = { inputRoot: ROOT, output: null, inPlace: false, format: "original", size: null };

test("resolveOutputRoot: sibling by default, custom with output, null in place", () => {
  assert.equal(resolveOutputRoot(ROOT, {}), OUT);
  assert.equal(
    resolveOutputRoot(ROOT, { output: path.join("custom", "dir") }),
    path.resolve(path.join("custom", "dir")),
  );
  assert.equal(resolveOutputRoot(ROOT, { inPlace: true }), null);
});

test("default mode mirrors the tree into the sibling folder", () => {
  const files = [inRoot("a.jpg"), inRoot("nested", "b.png")];
  const { jobs, outputRoot, outputDirs } = planJobs(files, defaults);

  assert.equal(outputRoot, OUT);
  assert.deepEqual(
    jobs.map((job) => job.outputPath),
    [path.join(OUT, "a.jpg"), path.join(OUT, "nested", "b.png")],
  );
  assert.deepEqual(outputDirs.sort(), [OUT, path.join(OUT, "nested")].sort());
});

test("keep-format out-of-place jobs copy the original when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], defaults);
  assert.equal(jobs[0].whenLarger, "copy");
  assert.equal(jobs[0].format, "jpg");
});

test("conversion out-of-place swaps the extension and always writes", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], { ...defaults, format: "webp" });
  assert.equal(jobs[0].outputPath, path.join(OUT, "a.webp"));
  assert.equal(jobs[0].whenLarger, "write");
});

test("explicit same format still copies when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], { ...defaults, format: "jpg" });
  assert.equal(jobs[0].whenLarger, "copy");
});

test("a size request always writes, even when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    size: { width: 100, height: 100 },
  });
  assert.equal(jobs[0].whenLarger, "write");
});

test("custom output dir is used as the mirror root", () => {
  const custom = path.resolve("optimized");
  const { jobs, outputRoot } = planJobs([inRoot("nested", "b.png")], {
    ...defaults,
    output: "optimized",
  });
  assert.equal(outputRoot, custom);
  assert.equal(jobs[0].outputPath, path.join(custom, "nested", "b.png"));
});

test("in place, keep format: output is the source and larger results are kept", () => {
  const { jobs, outputRoot, outputDirs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    inPlace: true,
  });
  assert.equal(outputRoot, null);
  assert.deepEqual(outputDirs, []);
  assert.equal(jobs[0].outputPath, inRoot("a.jpg"));
  assert.equal(jobs[0].whenLarger, "keep");
});

test("in place, converting: extension swaps in the source directory", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    inPlace: true,
    format: "webp",
  });
  assert.equal(jobs[0].outputPath, inRoot("a.webp"));
  assert.equal(jobs[0].whenLarger, "write");
});

test("collision rule 1: two sources converting to one output is an error", () => {
  assert.throws(
    () =>
      planJobs([inRoot("logo.jpg"), inRoot("logo.jpeg")], {
        ...defaults,
        format: "jpg",
      }),
    UserError,
  );
});

test("collision rule 2: in-place source that is another job's output is skipped", () => {
  const { jobs, skipped } = planJobs([inRoot("logo.jpg"), inRoot("logo.webp")], {
    ...defaults,
    inPlace: true,
    format: "webp",
  });
  assert.equal(skipped, 1);
  assert.deepEqual(
    jobs.map((job) => job.source),
    [inRoot("logo.jpg")],
  );
});

test("duplicate inputs are planned once and counted as skipped", () => {
  const { jobs, skipped } = planJobs([inRoot("a.jpg"), inRoot("a.jpg")], defaults);
  assert.equal(jobs.length, 1);
  assert.equal(skipped, 1);
});

test("out-of-place: a source already in the target format is skipped, not a collision", () => {
  const { jobs, skipped } = planJobs([inRoot("logo.jpg"), inRoot("logo.webp")], {
    ...defaults,
    format: "webp",
  });
  assert.equal(skipped, 1);
  assert.deepEqual(
    jobs.map((job) => [job.source, job.outputPath]),
    [[inRoot("logo.jpg"), path.join(OUT, "logo.webp")]],
  );
});

test("an output dir that overlaps the sources is rejected", () => {
  assert.throws(
    () => planJobs([inRoot("a.jpg")], { ...defaults, output: ROOT }),
    UserError,
  );
});
