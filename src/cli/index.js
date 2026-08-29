"use strict";

const path = require("path");

const { discoverImages } = require("../discover");
const { optimizeImages } = require("../run");
const { resolveOutputRoot } = require("../plan");
const { UserError } = require("../errors");
const { parseArguments } = require("./args");
const { printHelp } = require("./help");
const {
  createProgressBar,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
  printVersion,
} = require("./reporter");

const EXIT_FAILURE = 1;

async function runCli(argv) {
  let bar = null;
  try {
    const { path: inputPath, helpRequested, versionRequested, ...options } =
      parseArguments(argv);

    if (helpRequested) {
      printHelp();
      return;
    }

    if (versionRequested) {
      printVersion();
      return;
    }

    const { root, files } = await discoverImages(inputPath);
    const outputRoot = resolveOutputRoot(root, options);

    printRunHeader(path.resolve(inputPath), files.length, options, outputRoot);

    bar = createProgressBar(files.length);
    let summary;
    try {
      summary = await optimizeImages(files, { ...options, inputRoot: root }, {
        onProgress: (done, total) => {
          // Planning can drop files, so the bar can have fewer steps than found.
          bar.setTotal(total);
          bar.update(done);
        },
        onFailure: printFileFailure,
      });
    } finally {
      // A collision/overwrite error thrown out of optimizeImages must not
      // leave the terminal cursor hidden.
      bar.stop();
    }

    printSummary(summary);
  } catch (error) {
    if (error instanceof UserError) {
      printError(error.message);
    } else {
      printFatal(error.message);
    }
    process.exitCode = EXIT_FAILURE;
  }
}

module.exports = { runCli };
