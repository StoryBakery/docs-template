#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const cwd = process.cwd();
const defaultTemplateDir = path.resolve(__dirname, "..", "template");
let targetDir = "website";
let templateDir = defaultTemplateDir;
let install = true;
let force = false;
let packageManager = "npm";

function printHelp() {
  console.log("Usage: create-docs [dir] [options]");
  console.log("");
  console.log("Options:");
  console.log("  --dir <dir>              Target directory (default: website)");
  console.log("  --template <path>        Template directory path");
  console.log("  --no-install             Skip package installation");
  console.log("  --skip-install           Alias for --no-install");
  console.log("  --package-manager <pm>   npm | pnpm | yarn | bun (default: npm)");
  console.log("  --force                  Allow non-empty directory");
  console.log("  -h, --help               Show help");
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    printHelp();
    process.exit(0);
  }
  if (arg === "--dir" && args[i + 1]) {
    targetDir = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--template" && args[i + 1]) {
    templateDir = path.resolve(cwd, args[i + 1]);
    i += 1;
    continue;
  }
  if (arg === "--no-install" || arg === "--skip-install") {
    install = false;
    continue;
  }
  if (arg === "--force") {
    force = true;
    continue;
  }
  if (arg === "--package-manager" && args[i + 1]) {
    packageManager = args[i + 1];
    i += 1;
    continue;
  }
  if (!arg.startsWith("-") && targetDir === "website") {
    targetDir = arg;
    continue;
  }
  console.error(`[storybakery] unknown option: ${arg}`);
  process.exit(1);
}

const destDir = path.resolve(cwd, targetDir);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
  }
}

function isDirectoryEmpty(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return true;
  }
  const entries = fs.readdirSync(dirPath);
  return entries.length === 0;
}

if (!fs.existsSync(templateDir)) {
  console.error("[storybakery] template directory missing.");
  process.exit(1);
}

if (!force && !isDirectoryEmpty(destDir)) {
  console.error(`[storybakery] target directory not empty: ${destDir}`);
  process.exit(1);
}

copyDir(templateDir, destDir);

if (install) {
  const installResult = spawnSync(packageManager, ["install"], {
    cwd: destDir,
    stdio: "inherit",
    shell: true,
  });

  if (installResult.status !== 0) {
    console.error("[storybakery] install failed.");
    process.exit(installResult.status === null ? 1 : installResult.status);
  }
}

console.log("");
console.log("[storybakery] setup complete.");
console.log(`- cd ${targetDir}`);
if (install) {
  console.log("- npm run dev");
}
