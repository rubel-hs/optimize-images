"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const temporaryDirectories = [];

/** A scratch directory that `cleanupFixtures()` will remove. */
function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-test-"));
  temporaryDirectories.push(dir);
  return dir;
}

function cleanupFixtures() {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
}

/**
 * Deterministic pseudo-random pixels — a flat colour compresses to almost
 * nothing, which would make quality and savings assertions meaningless.
 */
function noisePixels(width, height, seed = 1) {
  const pixels = Buffer.allocUnsafe(width * height * 3);
  let state = seed;
  for (let i = 0; i < pixels.length; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    pixels[i] = state % 256;
  }
  return pixels;
}

/**
 * Write a noisy test image. The format comes from the file extension unless
 * `format` says otherwise, so `writeImage(dir, "photo.jpeg")` just works.
 */
async function writeImage(dir, fileName, { width = 64, height = 48, seed = 1, format } = {}) {
  const filePath = path.join(dir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const encoding = format || path.extname(fileName).slice(1).toLowerCase();
  const pipeline = sharp(noisePixels(width, height, seed), {
    raw: { width, height, channels: 3 },
  });

  await pipeline.toFormat(encoding === "jpg" ? "jpeg" : encoding).toFile(filePath);
  return filePath;
}

function writeBrokenImage(dir, fileName = "broken.png") {
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, "this is not an image");
  return filePath;
}

/** Every file in a tree, relative to it and sorted, for stable assertions. */
function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

function sizeOf(filePath) {
  return fs.statSync(filePath).size;
}

module.exports = {
  cleanupFixtures,
  createTempDir,
  listFiles,
  sizeOf,
  writeBrokenImage,
  writeImage,
};
