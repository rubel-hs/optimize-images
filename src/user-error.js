"use strict";

/**
 * A problem the user can fix — a bad flag, a missing path, an unsupported file.
 *
 * Throwing this instead of exiting keeps every module testable and lets the CLI
 * decide once, in one place, how such problems are printed.
 */
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
  }
}

module.exports = { UserError };
