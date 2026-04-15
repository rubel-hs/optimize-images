#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const chalk = require("chalk");
const { glob } = require("glob");
const cliProgress = require("cli-progress");

function parseArgs(argv) {
  const args = {
    path: null,
    quality: 80,
    format: "original",
    size: null,
    deleteOriginal: false,
  };
  const rest = argv.slice(2);

  if (rest.length === 0 || rest.includes("-h") || rest.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  for (let i = 0; i < rest.length; i++) {
    const val = rest[i];
    if (val === "-q" || val === "--quality") {
      const num = parseInt(rest[++i], 10);
      if (isNaN(num) || num < 1 || num > 100) {
        console.error(
          chalk.red("Error: Quality must be a number between 1-100."),
        );
        process.exit(1);
      }
      args.quality = num;
    } else if (val === "-f" || val === "--format") {
      const fmt = rest[++i];
      const valid = [
        "original",
        "jpg",
        "jpeg",
        "png",
        "webp",
        "avif",
        "tiff",
        "gif",
      ];
      if (!valid.includes(fmt.toLowerCase())) {
        console.error(
          chalk.red(
            `Error: Unsupported format "${fmt}". Valid: ${valid.join(", ")}`,
          ),
        );
        process.exit(1);
      }
      args.format = fmt.toLowerCase();
    } else if (val === "-s" || val === "--size") {
      const sizeStr = rest[++i];
      const match = sizeStr.match(/^(\d+)x(\d+)$/i);
      if (!match) {
        console.error(
          chalk.red("Error: Size must be in WxH format, e.g. 600x300."),
        );
        process.exit(1);
      }
      args.size = {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    } else if (val === "-d" || val === "--delete-original") {
      args.deleteOriginal = true;
    } else if (!val.startsWith("-")) {
      if (args.path) {
        console.error(
          chalk.red(
            `Error: Unexpected argument "${val}". Only one path allowed.`,
          ),
        );
        process.exit(1);
      }
      args.path = val;
    } else {
      console.error(chalk.red(`Error: Unknown flag "${val}".`));
      process.exit(1);
    }
  }

  if (!args.path) {
    console.error(chalk.red("Error: No image path provided."));
    process.exit(1);
  }

  return args;
}

function printHelp() {
  console.log(`
${chalk.bold.cyan("oi")} ${chalk.dim("— image optimizer CLI")}

${chalk.bold("Usage:")}
  oi <path> [options]

${chalk.bold("Options:")}
  -q, --quality <1-100>   Image quality (default: 80)
  -f, --format <fmt>      Output format: original, jpg, png, webp, avif, tiff, gif (default: original)
  -s, --size <WxH>        Resize to width x height, e.g. 600x300
  -d, --delete-original   Delete source file after converting to a different format
  -h, --help              Show this help

${chalk.bold("Examples:")}
  oi ./images                          Optimize with defaults (quality 80, keep format)
  oi ./images -q 60                    Quality 60, keep format
  oi ./images -f webp                  Convert all to WebP
  oi ./images -q 75 -f original        Quality 75, keep original formats
  oi ./images -q 90 -f png -s 800x600  Convert to PNG, resize to 800x600, quality 90
`);
}

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".tiff",
  ".tif",
  ".gif",
]);

const EXT_TO_FORMAT = {
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".png": "png",
  ".webp": "webp",
  ".avif": "avif",
  ".tiff": "tiff",
  ".tif": "tiff",
  ".gif": "gif",
};

function getFormatForFile(filePath, targetFormat) {
  if (targetFormat !== "original") return targetFormat;
  return EXT_TO_FORMAT[path.extname(filePath).toLowerCase()] || "jpg";
}

function getOutputPath(filePath, targetFormat) {
  if (targetFormat === "original") return filePath;

  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const newExt = targetFormat === "jpg" ? ".jpg" : `.${targetFormat}`;
  return path.join(path.dirname(filePath), `${base}${newExt}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function processImage(filePath, opts) {
  const format = getFormatForFile(filePath, opts.format);
  const outputPath = getOutputPath(filePath, opts.format);

  let pipeline = sharp(filePath);

  if (opts.size) {
    pipeline = pipeline.resize(opts.size.width, opts.size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const quality = opts.quality;

  switch (format) {
    case "jpg":
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case "png":
      pipeline = pipeline.png({ quality, compressionLevel: 9, effort: 10 });
      break;
    case "webp":
      pipeline = pipeline.webp({ quality });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality });
      break;
    case "tiff":
      pipeline = pipeline.tiff({ quality });
      break;
    case "gif":
      pipeline = pipeline.gif();
      break;
    default:
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  const originalSize = fs.statSync(filePath).size;
  await pipeline.toFile(outputPath + ".oi_tmp");
  fs.renameSync(outputPath + ".oi_tmp", outputPath);
  const newSize = fs.statSync(outputPath).size;

  let deleted = false;
  if (opts.deleteOriginal && path.resolve(outputPath) !== path.resolve(filePath)) {
    fs.unlinkSync(filePath);
    deleted = true;
  }

  return { originalSize, newSize, outputPath, deleted };
}

async function main() {
  const opts = parseArgs(process.argv);

  const targetPath = path.resolve(opts.path);
  if (!fs.existsSync(targetPath)) {
    console.error(chalk.red(`Error: Path does not exist: ${targetPath}`));
    process.exit(1);
  }

  const stat = fs.statSync(targetPath);
  let imageFiles = [];

  if (stat.isFile()) {
    const ext = path.extname(targetPath).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      imageFiles.push(targetPath);
    } else {
      console.error(chalk.red(`Error: Unsupported file type: ${ext}`));
      process.exit(1);
    }
  } else if (stat.isDirectory()) {
    const pattern = `**/*.{jpg,jpeg,png,webp,avif,tiff,tif,gif}`;
    imageFiles = await glob(pattern, {
      cwd: targetPath,
      absolute: true,
      nocase: true,
    });

    if (imageFiles.length === 0) {
      console.error(
        chalk.red(`Error: No supported images found in: ${targetPath}`),
      );
      process.exit(1);
    }
  } else {
    console.error(chalk.red("Error: Path must be a file or directory."));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan("  oi — Optimize Images"));
  console.log(chalk.dim("  ─────────────────────"));
  console.log(`  ${chalk.dim("Path:")}     ${targetPath}`);
  console.log(`  ${chalk.dim("Images:")}   ${imageFiles.length}`);
  console.log(`  ${chalk.dim("Quality:")}  ${opts.quality}`);
  console.log(
    `  ${chalk.dim("Format:")}   ${opts.format}${opts.format === "original" ? " (keep)" : ""}`,
  );
  if (opts.size) {
    console.log(
      `  ${chalk.dim("Resize:")}   ${opts.size.width}×${opts.size.height}`,
    );
  }
  console.log();

  const bar = new cliProgress.SingleBar(
    {
      format: `  {bar} {percentage}% | {value}/{total} files`,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(imageFiles.length, 0);

  let totalOriginal = 0;
  let totalNew = 0;
  let errors = 0;
  let deletedCount = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    try {
      const result = await processImage(imageFiles[i], opts);
      totalOriginal += result.originalSize;
      totalNew += result.newSize;
      if (result.deleted) deletedCount++;
    } catch (err) {
      errors++;
      const file = path.basename(imageFiles[i]);
      process.stderr.write(chalk.dim(`\n  ⚠ ${file}: ${err.message}\n`));
    }
    bar.update(i + 1);
  }

  bar.stop();

  const saved = totalOriginal - totalNew;
  const pct =
    totalOriginal > 0 ? ((saved / totalOriginal) * 100).toFixed(1) : 0;

  console.log();
  if (errors > 0) {
    console.log(chalk.yellow(`  ${errors} file(s) had errors.`));
  }
  console.log(
    `  ${chalk.green("✓")} ${imageFiles.length - errors} image(s) optimized`,
  );
  if (deletedCount > 0) {
    console.log(
      `  ${chalk.dim("Deleted:")} ${deletedCount} source file(s)`,
    );
  }
  console.log(
    `  ${chalk.dim("Before:")} ${formatBytes(totalOriginal)}  →  ${chalk.dim("After:")} ${formatBytes(totalNew)}`,
  );

  if (saved > 0) {
    console.log(
      `  ${chalk.bold.green(`Saved: ${formatBytes(saved)} (${pct}%)`)}`,
    );
  } else if (saved < 0) {
    console.log(
      `  ${chalk.yellow(`Size increased by: ${formatBytes(Math.abs(saved))} (consider lower quality)`)}`,
    );
  } else {
    console.log(`  ${chalk.dim("No size change.")}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
