#!/usr/bin/env node
"use strict";

// Before anything can queue work on the thread pool this sizes it.
require("../src/cli/tune-runtime").tuneRuntime();

require("../src/cli").runCli(process.argv);
