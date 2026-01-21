#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { generate } = require("../src/index.js");
const pkg = require("../package.json");

function parseArgs(argv) {
  const args = {
    rootDir: process.cwd(),
    srcDir: null,
    typesDir: null,
    out: "reference.json",
    failOnWarning: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--root" && argv[i + 1]) {
      args.rootDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--src" && argv[i + 1]) {
      args.srcDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--types" && argv[i + 1]) {
      args.typesDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--out" && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--fail-on-warning") {
      args.failOnWarning = true;
      continue;
    }

    if (arg === "--legacy") {
      args.legacy = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log("luau-docgen");
  console.log("\nUsage:");
  console.log("  luau-docgen --out <path> [--root <dir>] [--src <dir>] [--types <dir>]");
  console.log("\nOptions:");
  console.log("  --root <dir>         Root directory (default: cwd)");
  console.log("  --src <dir>          Source directory (default: <root>/src)");
  console.log("  --types <dir>        Optional types directory");
  console.log("  --out <path>         Output JSON path (default: reference.json)");
  console.log("  --fail-on-warning    Exit with non-zero when warnings exist");
  console.log("  --legacy             Use legacy JS parser (no Luau native)");
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

function findNativeBinary() {
  const fromEnv = process.env.LUAU_DOCGEN_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const baseDir = path.resolve(__dirname, "..", "native");
  const candidates = [
    path.join(baseDir, "build", "luau-docgen"),
    path.join(baseDir, "build", "luau-docgen.exe"),
    path.join(baseDir, "bin", "luau-docgen"),
    path.join(baseDir, "bin", "luau-docgen.exe"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

if (!args.legacy) {
  const nativeBinary = findNativeBinary();
  if (!nativeBinary) {
    console.error("[luau-docgen] Native binary not found. Build it or use --legacy.");
    process.exit(1);
  }

  const nativeArgs = process.argv.slice(2);
  if (!nativeArgs.includes("--generator-version")) {
    nativeArgs.push("--generator-version", pkg.version);
  }

  const result = spawnSync(nativeBinary, nativeArgs, { stdio: "inherit" });
  if (result.status !== null) {
    process.exit(result.status);
  }
  process.exit(1);
}

const rootDir = path.resolve(args.rootDir);
const srcDir = args.srcDir ? path.resolve(rootDir, args.srcDir) : path.join(rootDir, "src");
const typesDir = args.typesDir ? path.resolve(rootDir, args.typesDir) : null;
const outPath = path.resolve(rootDir, args.out);

const result = generate({
  rootDir,
  srcDir,
  typesDir,
  generatorVersion: pkg.version,
});

const outputDir = path.dirname(outPath);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result.data, null, 2));

if (result.diagnostics.length > 0) {
  for (const diagnostic of result.diagnostics) {
    const level = diagnostic.level.toUpperCase();
    console.error(
      `[luau-docgen] ${level} ${diagnostic.file}:${diagnostic.line} ${diagnostic.message}`
    );
  }
}

if (args.failOnWarning && result.diagnostics.length > 0) {
  process.exit(1);
}
