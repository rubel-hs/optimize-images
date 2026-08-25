"use strict";

const {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
} = require("../defaults");
const { REQUESTABLE_FORMATS, normalizeFormatName } = require("../formats");
const { UserError } = require("../user-error");

const SIZE_PATTERN = /^(\d+)x(\d+)$/i;

/**
 * Each flag reads its own value off the argument list and returns the options it
 * contributes. `next()` pulls the flag's value, so adding a flag means adding
 * one entry here and one line to the help text.
 */
const FLAGS = {
  "-q": readQuality,
  "--quality": readQuality,
  "-f": readFormat,
  "--format": readFormat,
  "-s": readSize,
  "--size": readSize,
  "-j": readConcurrency,
  "--concurrency": readConcurrency,
  "-d": () => ({ deleteOriginal: true }),
  "--delete-original": () => ({ deleteOriginal: true }),
};

const HELP_FLAGS = new Set(["-h", "--help"]);

function readQuality(next, flag) {
  const quality = parseInt(next(flag), 10);
  if (isNaN(quality) || quality < QUALITY_MIN || quality > QUALITY_MAX) {
    throw new UserError(
      `Quality must be a number between ${QUALITY_MIN}-${QUALITY_MAX}.`,
    );
  }
  return { quality };
}

function readConcurrency(next, flag) {
  const concurrency = parseInt(next(flag), 10);
  if (
    isNaN(concurrency) ||
    concurrency < CONCURRENCY_MIN ||
    concurrency > CONCURRENCY_MAX
  ) {
    throw new UserError(
      `Concurrency must be a number between ${CONCURRENCY_MIN}-${CONCURRENCY_MAX}.`,
    );
  }
  return { concurrency };
}

function readFormat(next, flag) {
  const requested = next(flag);
  const format = normalizeFormatName(requested);
  if (!format) {
    throw new UserError(
      `Unsupported format "${requested}". Valid: ${REQUESTABLE_FORMATS.join(", ")}`,
    );
  }
  return { format };
}

function readSize(next, flag) {
  const match = String(next(flag)).match(SIZE_PATTERN);
  if (!match) {
    throw new UserError("Size must be in WxH format, e.g. 600x300.");
  }
  return {
    size: { width: parseInt(match[1], 10), height: parseInt(match[2], 10) },
  };
}

/**
 * Turn `process.argv` into options.
 *
 * @returns {{helpRequested: boolean, path: string|null, ...DEFAULT_OPTIONS}}
 */
function parseArguments(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args.some((arg) => HELP_FLAGS.has(arg))) {
    return { ...DEFAULT_OPTIONS, path: null, helpRequested: true };
  }

  const options = { ...DEFAULT_OPTIONS, path: null, helpRequested: false };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = (flag) => {
      const value = args[++index];
      if (value === undefined) throw new UserError(`Missing value for "${flag}".`);
      return value;
    };

    if (FLAGS[arg]) {
      Object.assign(options, FLAGS[arg](next, arg));
    } else if (arg.startsWith("-")) {
      throw new UserError(`Unknown flag "${arg}".`);
    } else if (options.path) {
      throw new UserError(`Unexpected argument "${arg}". Only one path allowed.`);
    } else {
      options.path = arg;
    }
  }

  if (!options.path) throw new UserError("No image path provided.");

  return options;
}

module.exports = { parseArguments };
