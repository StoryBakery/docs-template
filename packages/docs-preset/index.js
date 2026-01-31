const fs = require("fs");
const path = require("path");
const toml = require("toml");

function resolveSidebarPath(siteDir, providedPath) {
  if (providedPath === false) {
    return undefined;
  }
  if (providedPath) {
    return providedPath;
  }

  const tsPath = path.resolve(siteDir, "sidebars.ts");
  if (fs.existsSync(tsPath)) {
    return tsPath;
  }

  const jsPath = path.resolve(siteDir, "sidebars.js");
  if (fs.existsSync(jsPath)) {
    return jsPath;
  }

  return undefined;
}

function normalizeLocales(locales) {
  if (!Array.isArray(locales)) {
    return null;
  }
  return Array.from(new Set(locales)).sort();
}

function arraysEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function getDefaultReferenceOptions(siteDir) {
  if (path.basename(siteDir) !== "website") {
    return {};
  }

  return {
    rootDir: "..",
    srcDir: "src",
  };
}

function resolveProjectRoot(siteDir) {
  if (path.basename(siteDir) === "website") {
    return path.resolve(siteDir, "..");
  }
  return siteDir;
}

function ensurePrismLua(themeConfig) {
  const options = { ...themeConfig };
  const prism = { ...(options.prism || {}) };
  const additional = Array.isArray(prism.additionalLanguages)
    ? prism.additionalLanguages.slice()
    : [];

  if (!additional.includes("lua")) {
    additional.push("lua");
  }

  prism.additionalLanguages = additional;
  options.prism = prism;
  return options;
}



function findBakerywaveTomlPath(siteDir) {
  const projectRoot = resolveProjectRoot(siteDir);
  const candidates = [
    path.join(siteDir, "bakerywave.toml"),
    path.join(projectRoot, "bakerywave.toml"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveTomlPathOptions(tomlPath, options) {
  const resolved = { ...options };
  const baseDir = path.dirname(tomlPath);
  const pathKeys = ["rootDir", "input", "outDir", "manifestPath"];

  for (const key of pathKeys) {
    const value = resolved[key];
    if (!value || path.isAbsolute(value)) {
      continue;
    }
    resolved[key] = path.resolve(baseDir, value);
  }

  return resolved;
}

function loadBakerywaveReferenceOptions(siteDir) {
  const tomlPath = findBakerywaveTomlPath(siteDir);
  if (!tomlPath) {
    return {};
  }

  try {
    const raw = fs.readFileSync(tomlPath, "utf8");
    const parsed = toml.parse(raw);
    const reference = parsed.reference && typeof parsed.reference === "object" ? parsed.reference : {};
    return resolveTomlPathOptions(tomlPath, reference);
  } catch (error) {
    console.error(`[storybakery] bakerywave.toml 파싱 실패: ${tomlPath}`);
    console.error(error.message);
    return {};
  }
}

function storybakeryI18nEnforcer(context, options) {
  const expected = (options && options.expected) || {};
  const expectedLocales = normalizeLocales(expected.locales);
  const expectedDefaultLocale = expected.defaultLocale;

  return {
    name: "storybakery-i18n-enforcer",
    loadContent() {
      const siteI18n = (context.siteConfig && context.siteConfig.i18n) || {};
      const errors = [];

      if (expectedLocales) {
        const actualLocales = normalizeLocales(siteI18n.locales);
        if (!actualLocales) {
          errors.push("siteConfig.i18n.locales가 설정되어 있지 않습니다.");
        } else if (!arraysEqual(actualLocales, expectedLocales)) {
          errors.push(
            `siteConfig.i18n.locales가 정책과 다릅니다. expected=${expectedLocales.join(
              ","
            )} actual=${actualLocales.join(",")}`
          );
        }
      }

      if (expectedDefaultLocale) {
        if (siteI18n.defaultLocale !== expectedDefaultLocale) {
          errors.push(
            `siteConfig.i18n.defaultLocale가 정책과 다릅니다. expected=${expectedDefaultLocale} actual=${
              siteI18n.defaultLocale || "undefined"
            }`
          );
        }
      }

      if (errors.length) {
        throw new Error(
          `[storybakery] i18n 정책 위반:\n- ${errors.join("\n- ")}`
        );
      }
    },
  };
}

module.exports = function storybakeryDocsPreset(context, opts = {}) {
  const siteDir = context.siteDir;

  const docsOptions = {
    path: "docs",
    ...(opts.docs || {}),
  };

  const sidebarPath = resolveSidebarPath(siteDir, docsOptions.sidebarPath);
  if (sidebarPath) {
    docsOptions.sidebarPath = sidebarPath;
  }

  const themeOptions = opts.theme || {};
  const baseThemeConfig = (context.siteConfig && context.siteConfig.themeConfig) || {};
  const themeConfig = ensurePrismLua({ ...baseThemeConfig, ...(opts.themeConfig || {}) });
  if (context.siteConfig) {
    context.siteConfig.themeConfig = themeConfig;
  }
  const pagesOptions = opts.pages || {};

  const themes = [
    ["@docusaurus/theme-classic", themeOptions],
    ["@storybakery/docs-theme", opts.storyTheme || {}],
  ];

  const plugins = [];

  plugins.push(["@docusaurus/plugin-content-docs", docsOptions]);
  plugins.push(["@docusaurus/plugin-content-pages", pagesOptions]);

  const referenceDefaults = getDefaultReferenceOptions(siteDir);
  const referenceFromToml = loadBakerywaveReferenceOptions(siteDir);
  const referenceOptions =
    opts.reference === false
      ? null
      : { ...referenceDefaults, ...referenceFromToml, ...(opts.reference || {}) };
  if (referenceOptions) {
    plugins.push(["@storybakery/docusaurus-plugin-reference", referenceOptions]);
  }

  if (opts.i18n && (opts.i18n.locales || opts.i18n.defaultLocale)) {
    plugins.push([storybakeryI18nEnforcer, { expected: opts.i18n }]);
  }

  if (Array.isArray(opts.extraPlugins)) {
    plugins.push(...opts.extraPlugins);
  }

  if (Array.isArray(opts.extraThemes)) {
    themes.push(...opts.extraThemes);
  }

  return {
    themes,
    plugins,
  };
};
