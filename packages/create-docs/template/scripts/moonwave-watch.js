const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");
const chokidar = require("chokidar");
const AdmZip = require("adm-zip");

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.resolve(rootDir, "..", "src");
const outputDir = path.join(rootDir, ".generated", "moonwave");
const outputPath = path.join(outputDir, "docs.json");
const binDir = path.join(outputDir, "bin");
const debounceMs = Number(process.env.MOONWAVE_WATCH_DEBOUNCE || "300");

const commandTemplate = process.env.MOONWAVE_EXTRACTOR_CMD;

const releaseApi =
  "https://api.github.com/repos/evaera/moonwave/releases/latest";

function getBinaryName() {
  return process.platform === "win32"
    ? "moonwave-extractor.exe"
    : "moonwave-extractor";
}

function getAssetPattern() {
  switch (process.platform) {
    case "win32":
      return /^moonwave-extractor(?:-|-.*-)win64\.zip$/;
    case "darwin":
      return /^moonwave-extractor(?:-|-.*-)macos\.zip$/;
    case "linux":
      return /^moonwave-extractor(?:-|-.*-)linux\.zip$/;
    default:
      return null;
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "storybakery-docs-template",
          Accept: "application/vnd.github+json",
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          requestJson(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Moonwave release API failed: ${response.statusCode || "unknown"}`
            )
          );
          response.resume();
          return;
        }

        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { "User-Agent": "storybakery-docs-template" } },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          downloadFile(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Moonwave binary download failed: ${
                response.statusCode || "unknown"
              }`
            )
          );
          response.resume();
          return;
        }

        const fileStream = fs.createWriteStream(destination);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close(resolve);
        });
        fileStream.on("error", reject);
      }
    );

    request.on("error", reject);
  });
}

async function ensureExtractorBinary() {
  if (process.env.MOONWAVE_EXTRACTOR_PATH) {
    return process.env.MOONWAVE_EXTRACTOR_PATH;
  }

  const binaryName = getBinaryName();
  const binaryPath = path.join(binDir, binaryName);
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const assetPattern = getAssetPattern();
  if (!assetPattern) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  fs.mkdirSync(binDir, { recursive: true });

  const release = await requestJson(releaseApi);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((entry) => assetPattern.test(entry.name));

  if (!asset || !asset.browser_download_url) {
    throw new Error("Moonwave release does not include a matching binary.");
  }

  const zipPath = path.join(binDir, asset.name);
  await downloadFile(asset.browser_download_url, zipPath);

  const zip = new AdmZip(zipPath);
  const entry = zip
    .getEntries()
    .find((zipEntry) => zipEntry.entryName.endsWith(binaryName));

  if (!entry) {
    throw new Error("Downloaded archive did not contain the extractor.");
  }

  zip.extractEntryTo(entry, binDir, false, true);
  fs.unlinkSync(zipPath);

  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  return binaryPath;
}

let extractorPromise = null;

async function getExtractorPath() {
  if (!extractorPromise) {
    extractorPromise = ensureExtractorBinary();
  }
  return extractorPromise;
}

async function runExtractorBinary(extractorPath) {
  return new Promise((resolve, reject) => {
    const args = ["extract", sourceDir, "--base", sourceDir];
    const child = spawn(extractorPath, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "inherit"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error("extractor exited with non-zero status."));
        return;
      }
      if (!output.trim()) {
        reject(new Error("extractor produced no output."));
        return;
      }
      fs.writeFileSync(outputPath, output, "utf8");
      resolve();
    });
  });
}

function runCustomCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      cwd: rootDir,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error("extractor exited with non-zero status."));
        return;
      }
      resolve();
    });
  });
}

let running = false;
let pending = false;
let timer = null;

function buildCommand() {
  return commandTemplate
    .replace(/\{out\}/g, outputPath)
    .replace(/\{src\}/g, sourceDir);
}

async function runExtract(reason) {
  if (running) {
    pending = true;
    return;
  }

  running = true;
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[moonwave] extracting (${reason})...`);
  try {
    if (commandTemplate) {
      const command = commandTemplate
        .replace(/\{out\}/g, outputPath)
        .replace(/\{src\}/g, sourceDir);
      await runCustomCommand(command);
    } else {
      const extractorPath = await getExtractorPath();
      await runExtractorBinary(extractorPath);
    }
  } catch (error) {
    console.error("[moonwave] extractor failed.");
    console.error(error.message || error);
  }

  running = false;
  if (pending) {
    pending = false;
    runExtract("queued");
  }
}

function schedule(reason) {
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    runExtract(reason).catch((error) => {
      console.error("[moonwave] extractor failed.");
      console.error(error.message || error);
    });
  }, debounceMs);
}

const watcher = chokidar.watch(
  [path.join(sourceDir, "**/*.luau"), path.join(sourceDir, "**/*.lua")],
  {
    ignoreInitial: true,
  }
);

watcher.on("add", () => schedule("add"));
watcher.on("change", () => schedule("change"));
watcher.on("unlink", () => schedule("unlink"));

process.on("SIGINT", async () => {
  await watcher.close();
  process.exit(0);
});

runExtract("initial");
