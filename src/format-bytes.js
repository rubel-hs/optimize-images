"use strict";

const UNITS = ["B", "KB", "MB", "GB"];
const STEP = 1024;

/** 1536 -> "1.5 KB" */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(STEP)),
    UNITS.length - 1,
  );
  const value = bytes / Math.pow(STEP, unitIndex);

  return `${parseFloat(value.toFixed(1))} ${UNITS[unitIndex]}`;
}

module.exports = { formatBytes };
