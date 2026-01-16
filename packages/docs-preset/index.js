const fs = require("fs");
const path = require("path");

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
  const pagesOptions = opts.pages || {};

  const themes = [
    ["@docusaurus/theme-classic", themeOptions],
    ["@storybakery/docs-theme", opts.storyTheme || {}],
  ];

  const moonwaveDisabled = opts.moonwave === false;
  const plugins = [];

  if (!moonwaveDisabled) {
    const moonwaveOptions = {
      enabled: true,
      jsonPath: ".generated/moonwave/docs.json",
      outputDir: "docs/reference",
      clean: true,
      docsPath: docsOptions.path,
      ...(opts.moonwave || {}),
    };
    if (Object.prototype.hasOwnProperty.call(opts, "i18nReference")) {
      moonwaveOptions.i18nReference = opts.i18nReference;
    }

    if (moonwaveOptions.enabled !== false) {
      plugins.push([
        path.resolve(__dirname, "plugins/moonwave-bridge"),
        moonwaveOptions,
      ]);
    }
  }

  plugins.push(["@docusaurus/plugin-content-docs", docsOptions]);
  plugins.push(["@docusaurus/plugin-content-pages", pagesOptions]);

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
