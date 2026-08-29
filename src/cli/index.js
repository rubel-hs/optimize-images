"use strict";

const path = require("path");

const { findImageFiles } = require("../find-image-files");
const { optimizeImages } = require("../optimize-images");
const { UserError } = require("../errors");
const { parseArguments } = require("./parse-arguments");
const { printHelp } = require("./help");
const {
  createProgressBar,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
} = require("./reporter");

const EXIT_FAILURE = 1;

async function runCli(argv) {
  try {
    const { path: inputPath, helpRequested, ...options } =
      parseArguments(argv);

    if (helpRequested) {
      printHelp();
      return;
    }

    const files = await findImageFiles(inputPath);

    printRunHeader(path.resolve(inputPath), files.length, options);

    const bar = createProgressBar(files.length);
    const summary = await optimizeImages(files, options, {
      onProgress: (done, total) => {
        // Files already sitting at another file's output path are dropped from
        // the run, so the bar can have fewer steps than the folder has images.
        bar.setTotal(total);
        bar.update(done);
      },
      onFailure: printFileFailure,
    });
    bar.stop();

    printSummary(summary, options.format);
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
