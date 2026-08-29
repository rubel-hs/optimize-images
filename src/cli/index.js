"use strict";

const path = require("path");

const { discoverImages } = require("../discover");
const { removeUnfinishedTempFiles } = require("../encode");
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
  printStopping,
  printSummary,
  printVersion,
} = require("./reporter");

const EXIT_FAILURE = 1;

/** What a shell reports for a process the user interrupted. */
const EXIT_INTERRUPTED = 130;

/**
 * Ctrl+C asks the run to stop after whatever is encoding right now, so the
 * summary and the output folder are left in a consistent state. Registering a
 * handler also takes over from Node's default, which would kill the process
 * outright and leave the terminal cursor hidden.
 *
 * sharp cannot be called back once it holds an image, and a single AVIF encode
 * can run for a long time, so waiting can take a while. Say so, and treat a
 * second Ctrl+C as "now" — deleting the half-written temp files on the way out,
 * which the process would otherwise leave behind.
 */
function onInterrupt(controller, bar) {
  const handler = () => {
    if (controller.signal.aborted) {
      bar().stop();
      removeUnfinishedTempFiles();
      process.exit(EXIT_INTERRUPTED);
    }

    controller.abort();
    printStopping();
  };

  process.on("SIGINT", handler);
  return () => process.removeListener("SIGINT", handler);
}

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

    const controller = new AbortController();
    // The bar is read through a function because the handler is armed first:
    // Ctrl+C during the gap has a controller to abort but no bar to stop yet.
    const releaseInterrupt = onInterrupt(controller, () => bar ?? { stop() {} });

    bar = createProgressBar(files.length);
    let summary;
    try {
      summary = await optimizeImages(
        files,
        { ...options, inputRoot: root, signal: controller.signal },
        {
          onProgress: (done, total) => {
            // Planning can drop files, so the bar can have fewer steps than found.
            bar.setTotal(total);
            bar.update(done);
          },
          onFailure: printFileFailure,
        },
      );
    } finally {
      // A collision/overwrite error thrown out of optimizeImages must not
      // leave the terminal cursor hidden.
      bar.stop();
      releaseInterrupt();
    }

    printSummary(summary);
    if (summary.cancelled) process.exitCode = EXIT_INTERRUPTED;
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
