#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const targetDir = args[0] || "website";
const cwd = process.cwd();
const templateDir = path.resolve(__dirname, "..", "template");
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

if (!isDirectoryEmpty(destDir)) {
  console.error(`[storybakery] target directory not empty: ${destDir}`);
  process.exit(1);
}

copyDir(templateDir, destDir);

const install = spawnSync("npm", ["install"], {
  cwd: destDir,
  stdio: "inherit",
  shell: true,
});

if (install.status !== 0) {
  console.error("[storybakery] npm install failed.");
  process.exit(install.status === null ? 1 : install.status);
}

console.log("");
console.log("[storybakery] setup complete.");
console.log(`- cd ${targetDir}`);
console.log("- npm run dev");
