"use strict";

/** A problem the user can fix; the CLI prints these without a stack trace. */
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
  }
}

module.exports = { UserError };
