const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const AdmZip = require("adm-zip");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, ".generated", "moonwave");
const outputPath = path.join(outputDir, "docs.json");
const sourceDir = path.resolve(rootDir, "..", "src");
const binDir = path.join(outputDir, "bin");

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
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    cwd: rootDir,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error("extractor exited with non-zero status.");
  }
}

fs.mkdirSync(outputDir, { recursive: true });

async function run() {
  let command;
  try {
    if (commandTemplate) {
      command = commandTemplate
        .replace(/\{out\}/g, outputPath)
        .replace(/\{src\}/g, sourceDir);
    }
  } catch (error) {
    console.error("[moonwave] failed to prepare extractor.");
    console.error(error.message || error);
    console.error(
      "[moonwave] set MOONWAVE_EXTRACTOR_CMD or MOONWAVE_EXTRACTOR_PATH if needed."
    );
    process.exit(1);
  }

  try {
    if (command) {
      runCustomCommand(command);
      return;
    }

    const extractorPath = await ensureExtractorBinary();
    await runExtractorBinary(extractorPath);
  } catch (error) {
    console.error("[moonwave] failed to run extractor.");
    console.error(error.message || error);
    process.exit(1);
  }
}

run();
