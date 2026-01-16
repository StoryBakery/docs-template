const fs = require("fs");
const path = require("path");
const { convertMoonwaveJson } = require("./convert");

function resolvePath(siteDir, filePath) {
  if (!filePath) {
    return null;
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(siteDir, filePath);
}

function resolveSourceOptions(source, siteConfig) {
  if (!source) {
    return null;
  }

  if (source === true) {
    if (!siteConfig || !siteConfig.organizationName || !siteConfig.projectName) {
      return null;
    }
    return {
      repoUrl: `https://github.com/${siteConfig.organizationName}/${siteConfig.projectName}`,
    };
  }

  if (typeof source === "string") {
    return { repoUrl: source };
  }

  if (typeof source === "object") {
    return { ...source };
  }

  return null;
}

function resolveI18nLocales(i18nReference, siteConfig) {
  if (i18nReference && Array.isArray(i18nReference.locales)) {
    return i18nReference.locales;
  }

  const locales = siteConfig && siteConfig.i18n && siteConfig.i18n.locales;
  const defaultLocale =
    siteConfig && siteConfig.i18n && siteConfig.i18n.defaultLocale;

  if (!Array.isArray(locales)) {
    return [];
  }

  return locales.filter((locale) => locale !== defaultLocale);
}

function syncI18nReference(options, context, outputDir) {
  const i18nReference = options.i18nReference;
  if (i18nReference === false) {
    return;
  }

  const locales = resolveI18nLocales(i18nReference, context.siteConfig);
  if (!locales.length) {
    return;
  }

  const docsRoot = resolvePath(context.siteDir, options.docsPath || "docs");
  if (!docsRoot) {
    return;
  }

  const relativePath = path.relative(docsRoot, outputDir);
  if (relativePath.startsWith("..")) {
    console.warn(
      "[storybakery] Skipping i18n sync because outputDir is outside docs."
    );
    return;
  }

  for (const locale of locales) {
    const targetDir = path.join(
      context.siteDir,
      "i18n",
      locale,
      "docusaurus-plugin-content-docs",
      "current",
      relativePath
    );

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(outputDir, targetDir, { recursive: true });
  }
}

module.exports = function moonwaveBridge(context, options = {}) {
  const siteDir = context.siteDir;
  const jsonPath = resolvePath(
    siteDir,
    options.jsonPath || ".generated/moonwave/docs.json"
  );
  const outputDir = resolvePath(
    siteDir,
    options.outputDir || "docs/reference"
  );
  const clean = options.clean !== false;
  const enabled = options.enabled !== false;

  function runConversion() {
    if (!enabled) {
      return;
    }

    if (!jsonPath || !outputDir) {
      return;
    }

    if (!fs.existsSync(jsonPath)) {
      console.warn(
        `[storybakery] Moonwave JSON not found: ${path.relative(
          siteDir,
          jsonPath
        )}`
      );
      return;
    }

    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const parsed = JSON.parse(raw);
      const { jsonPath: _jsonPath, outputDir: _outputDir, enabled: _enabled, ...rest } = options;
      const sourceOptions = resolveSourceOptions(options.source, context.siteConfig);
      convertMoonwaveJson(parsed, {
        ...rest,
        outputDir,
        clean,
        source: sourceOptions,
      });
      syncI18nReference(options, context, outputDir);
      console.log(
        `[storybakery] Moonwave docs generated: ${path.relative(
          siteDir,
          outputDir
        )}`
      );
    } catch (error) {
      console.error("[storybakery] Moonwave conversion failed.");
      console.error(error);
    }
  }

  return {
    name: "storybakery-moonwave-bridge",
    loadContent() {
      runConversion();
      return null;
    },
    getPathsToWatch() {
      return jsonPath ? [jsonPath] : [];
    },
  };
};
