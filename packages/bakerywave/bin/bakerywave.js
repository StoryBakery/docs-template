#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const toml = require("toml");

const DOCUSAURUS_COMMANDS = new Set([
    "start",
    "build",
    "serve",
    "clear",
    "swizzle",
    "deploy",
    "write-translations",
    "write-heading-ids",
]);

const COMMAND_ALIASES = new Map([["preview", "serve"]]);
const NPM_EXEC_CACHE = { value: null };

function resolveNpmExec() {
    if (NPM_EXEC_CACHE.value) {
        return NPM_EXEC_CACHE.value;
    }

    const npmExecPath = process.env.npm_execpath;
    NPM_EXEC_CACHE.value = resolveNpmCommand();
    return NPM_EXEC_CACHE.value;
}


function resolveNpmCommand() {
    const npmExecPath = process.env.npm_execpath;
    if (npmExecPath && fs.existsSync(npmExecPath)) {
        return { command: process.execPath, args: [npmExecPath] };
    }
    if (process.platform === "win32") {
        return { command: "npm.cmd", args: [] };
    }
    return { command: "npm", args: [] };
}
function sanitizeArgs(args) {
    return args.filter((item) => typeof item === "string" && item.length > 0);
}



function splitArgs(argv) {
    const index = argv.indexOf("--");
    if (index === -1) {
        return { head: argv.slice(), tail: [] };
    }
    return {
        head: argv.slice(0, index),
        tail: argv.slice(index + 1),
    };
}

function hasConfigFile(dirPath) {
    const candidates = [
        "docusaurus.config.js",
        "docusaurus.config.cjs",
        "docusaurus.config.mjs",
        "docusaurus.config.ts",
    ];
    return candidates.some((name) => fs.existsSync(path.join(dirPath, name)));
}

function parseGlobalArgs(argv) {
    const args = argv.slice();
    let cwd = process.cwd();
    let siteDir = null;
    let configPath = null;

    const rest = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--cwd" && args[i + 1]) {
            cwd = path.resolve(args[i + 1]);
            i += 1;
            continue;
        }
        if ((arg === "--site-dir" || arg === "--siteDir") && args[i + 1]) {
            siteDir = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--config" && args[i + 1]) {
            configPath = args[i + 1];
            i += 1;
            continue;
        }
        rest.push(arg);
    }

    if (!siteDir) {
        siteDir = hasConfigFile(cwd) ? "." : "website";
    }

    const resolvedConfigPath = configPath ? path.resolve(cwd, configPath) : null;

    return {
        cwd,
        siteDir,
        configPath: resolvedConfigPath,
        rest,
    };
}

function parseDevArgs(argv) {
    const args = [];
    let restart = true;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--no-restart") {
            restart = false;
            continue;
        }
        if (arg === "--restart") {
            restart = true;
            continue;
        }
        args.push(arg);
    }

    return {
        args,
        restart,
    };
}


function resolveSiteDir(baseCwd, siteDir) {
    return path.resolve(baseCwd, siteDir || ".");
}

function resolveCommand(command) {
    return COMMAND_ALIASES.get(command) || command;
}

function runCommand(command, args, options) {
    const result = spawnSync(command, sanitizeArgs(args), {
        stdio: "inherit",
        cwd: options.cwd,
        env: options.env || process.env,
    });
    if (result.status !== null) {
        process.exit(result.status);
    }
    process.exit(1);
}

function runDocusaurus(command, args, siteDirAbs) {
    if (!fs.existsSync(siteDirAbs)) {
        console.error(`[bakerywave] site directory not found: ${siteDirAbs}`);
        process.exit(1);
    }
    let npmExec = resolveNpmExec();
    const cmdArgs = sanitizeArgs([...npmExec.args, "exec", "docusaurus", "--", command, ...args]);
    try {
        const versionCheck = spawnSync(npmExec.command, ["--version"], { stdio: "ignore" });
        if (versionCheck.error || versionCheck.status !== 0) {
            npmExec = resolveNpmCommand();
        }
    } catch (error) {
        npmExec = resolveNpmCommand();
    }
    try {
        runCommand(npmExec.command, cmdArgs, {
            cwd: siteDirAbs,
        });
        return;
    } catch (error) {
        const docusaurusBin = require.resolve("@docusaurus/core/bin/docusaurus.mjs", { paths: [siteDirAbs, __dirname] });
        runCommand(process.execPath, [docusaurusBin, command, ...args], {
            cwd: siteDirAbs,
        });
    }
}

function spawnDocusaurus(command, args, siteDirAbs) {
    if (!fs.existsSync(siteDirAbs)) {
        console.error(`[bakerywave] site directory not found: ${siteDirAbs}`);
        process.exit(1);
    }
    let npmExec = resolveNpmExec();
    const cmdArgs = sanitizeArgs([...npmExec.args, "exec", "docusaurus", "--", command, ...args]);
    try {
        const versionCheck = spawnSync(npmExec.command, ["--version"], { stdio: "ignore" });
        if (versionCheck.error || versionCheck.status !== 0) {
            npmExec = resolveNpmCommand();
        }
    } catch (error) {
        npmExec = resolveNpmCommand();
    }
    try {
        return spawn(npmExec.command, cmdArgs, {
            stdio: "inherit",
            cwd: siteDirAbs,
            env: process.env,
        });
    } catch (error) {
        const docusaurusBin = require.resolve("@docusaurus/core/bin/docusaurus.mjs", { paths: [siteDirAbs, __dirname] });
        return spawn(process.execPath, [docusaurusBin, command, ...args], {
            stdio: "inherit",
            cwd: siteDirAbs,
            env: process.env,
        });
    }
}


function findPresetOptions(siteConfig) {
    const presets = Array.isArray(siteConfig.presets) ? siteConfig.presets : [];
    for (const preset of presets) {
        if (!Array.isArray(preset)) {
            continue;
        }
        const [name, options] = preset;
        if (name === "@storybakery/docs-preset" && options && typeof options === "object") {
            return options;
        }
    }
    return null;
}

function resolveProjectRoot(baseCwd, siteDirAbs) {
    if (path.basename(siteDirAbs) === "website") {
        return path.resolve(siteDirAbs, "..");
    }
    return baseCwd;
}

function findBakerywaveTomlPath(baseCwd, siteDirAbs) {
    const projectRoot = resolveProjectRoot(baseCwd, siteDirAbs);
    const candidates = [
        path.join(siteDirAbs, "bakerywave.toml"),
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

function loadBakerywaveReferenceOptions(baseCwd, siteDirAbs) {
    const tomlPath = findBakerywaveTomlPath(baseCwd, siteDirAbs);
    if (!tomlPath) {
        return {};
    }

    try {
        const raw = fs.readFileSync(tomlPath, "utf8");
        const parsed = toml.parse(raw);
        const reference = parsed.reference && typeof parsed.reference === "object" ? parsed.reference : {};
        return resolveTomlPathOptions(tomlPath, reference);
    } catch (error) {
        console.error(`[bakerywave] failed to load bakerywave.toml: ${tomlPath}`);
        console.error(error.message);
        return {};
    }
}


function loadBakerywaveI18nOptions(baseCwd, siteDirAbs) {
    const tomlPath = findBakerywaveTomlPath(baseCwd, siteDirAbs);
    if (!tomlPath) {
        return {};
    }

    try {
        const raw = fs.readFileSync(tomlPath, "utf8");
        const parsed = toml.parse(raw);
        const i18n = parsed.i18n && typeof parsed.i18n === "object" ? parsed.i18n : {};
        return { ...i18n };
    } catch (error) {
        console.error(`[bakerywave] failed to load bakerywave.toml: ${tomlPath}`);
        console.error(error.message);
        return {};
    }
}

function loadI18nOptions(baseCwd, siteDirAbs, configPath) {
    const configFile = configPath
        ? path.resolve(baseCwd, configPath)
        : path.join(siteDirAbs, "docusaurus.config.js");
    const bakerywaveOptions = loadBakerywaveI18nOptions(baseCwd, siteDirAbs);

    if (!fs.existsSync(configFile)) {
        return { ...bakerywaveOptions };
    }

    try {
        delete require.cache[require.resolve(configFile)];
        const siteConfig = require(configFile);
        const i18n = siteConfig && siteConfig.i18n && typeof siteConfig.i18n === "object" ? siteConfig.i18n : {};
        return {
            ...i18n,
            ...bakerywaveOptions,
        };
    } catch (error) {
        console.error(`[bakerywave] failed to load config: ${configFile}`);
        console.error(error.message);
        return { ...bakerywaveOptions };
    }
}
function loadReferenceOptions(baseCwd, siteDirAbs, configPath) {
    const configFile = configPath
        ? path.resolve(baseCwd, configPath)
        : path.join(siteDirAbs, "docusaurus.config.js");
    const bakerywaveOptions = loadBakerywaveReferenceOptions(baseCwd, siteDirAbs);

    if (!fs.existsSync(configFile)) {
        return { ...bakerywaveOptions };
    }

    try {
        delete require.cache[require.resolve(configFile)];
        const siteConfig = require(configFile);
        const presetOptions = findPresetOptions(siteConfig);
        if (!presetOptions) {
            return { ...bakerywaveOptions };
        }

        const presetReference =
            presetOptions.reference && typeof presetOptions.reference === "object"
                ? { ...presetOptions.reference }
                : {};

        return {
            ...presetReference,
            ...bakerywaveOptions,
        };
    } catch (error) {
        console.error(`[bakerywave] failed to load config: ${configFile}`);
        console.error(error.message);
        return { ...bakerywaveOptions };
    }
}

function resolveModule(request, searchPaths, fallbackPath) {
    try {
        const resolved = require.resolve(request, { paths: searchPaths });
        return require(resolved);
    } catch (error) {
        if (fallbackPath && fs.existsSync(fallbackPath)) {
            return require(fallbackPath);
        }
        throw error;
    }
}

function resolveDocgenScript(searchPaths) {
    const fallbackPath = path.resolve(__dirname, "..", "..", "luau-docgen", "bin", "luau-docgen.js");
    try {
        return require.resolve("@storybakery/luau-docgen/bin/luau-docgen.js", { paths: searchPaths });
    } catch (error) {
        if (fs.existsSync(fallbackPath)) {
            return fallbackPath;
        }
        throw error;
    }
}

function resolveReferenceGenerator(searchPaths) {
    const fallbackPath = path.resolve(
        __dirname,
        "..",
        "..",
        "docusaurus-plugin-reference",
        "generate.js"
    );
    return resolveModule("@storybakery/docusaurus-plugin-reference/generate", searchPaths, fallbackPath);
}

function parseReferenceArgs(args) {
    const options = {
        lang: null,
        rootDir: null,
        srcDir: null,
        typesDir: null,
        input: null,
        outDir: null,
        manifestPath: null,
        includePrivate: null,
        clean: null,
        renderMode: null,
        failOnWarning: false,
        legacy: false,
    };

    const rest = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--lang" && args[i + 1]) {
            options.lang = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--root" && args[i + 1]) {
            options.rootDir = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--src" && args[i + 1]) {
            options.srcDir = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--types" && args[i + 1]) {
            options.typesDir = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--input" && args[i + 1]) {
            options.input = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--out-dir" && args[i + 1]) {
            options.outDir = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--manifest" && args[i + 1]) {
            options.manifestPath = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--include-private") {
            options.includePrivate = true;
            continue;
        }
        if (arg === "--no-clean") {
            options.clean = false;
            continue;
        }
        if (arg === "--render-mode" && args[i + 1]) {
            options.renderMode = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === "--fail-on-warning") {
            options.failOnWarning = true;
            continue;
        }
        if (arg === "--legacy") {
            options.legacy = true;
            continue;
        }
        rest.push(arg);
    }

    return { options, rest };
}


function resolveReferenceLanguageOptions(referenceOptions, overrides) {
    const options = { ...referenceOptions };
    const languages = options.languages && typeof options.languages === "object" ? options.languages : null;
    const selectedLang = (overrides && overrides.lang) || options.lang || null;
    const defaultLang = selectedLang || (languages ? Object.keys(languages)[0] : null) || "luau";
    options.lang = defaultLang;

    if (languages && languages[defaultLang] && typeof languages[defaultLang] === "object") {
        const langOptions = languages[defaultLang];
        return { ...options, ...langOptions, lang: defaultLang };
    }

    return options;
}
function resolveReferenceOptions(baseOptions, overrides) {
    const merged = { ...baseOptions };
    const keys = [
        "lang",
        "rootDir",
        "srcDir",
        "typesDir",
        "input",
        "outDir",
        "manifestPath",
        "includePrivate",
        "clean",
        "renderMode",
    ];
    for (const key of keys) {
        const value = overrides[key];
        if (value === null || value === undefined) {
            continue;
        }
        merged[key] = value;
    }

    return resolveReferenceLanguageOptions(merged, overrides);
}

function resolveReferenceDefaults(baseCwd, siteDirAbs, referenceOptions) {
    const lang = referenceOptions.lang || "luau";
    let rootDir = null;
    if (referenceOptions.rootDir) {
        rootDir = path.resolve(baseCwd, referenceOptions.rootDir);
    } else if (path.basename(siteDirAbs) === "website") {
        rootDir = path.resolve(siteDirAbs, "..");
    } else {
        rootDir = path.resolve(baseCwd, ".");
    }
    const srcDir = referenceOptions.srcDir || "src";
    const typesDir = referenceOptions.typesDir || null;
    const input =
        referenceOptions.input || path.join(siteDirAbs, ".generated", "reference", `${lang}.json`);

    return {
        lang,
        rootDir,
        srcDir,
        typesDir,
        input,
    };
}

function runLuauDocgen(docgenScript, defaults, docgenFlags) {
    // 1. Try to find native binary next to the executable (for packaged release)
    const binaryName = process.platform === "win32" ? "luau-docgen.exe" : "luau-docgen";
    const binaryPath = path.join(path.dirname(process.execPath), binaryName);

    if (fs.existsSync(binaryPath)) {
        const args = ["--root", defaults.rootDir, "--src", defaults.srcDir, "--out", defaults.input];

        if (defaults.typesDir) {
            args.push("--types", defaults.typesDir);
        }
        if (docgenFlags.failOnWarning) {
            args.push("--fail-on-warning");
        }

        // Native binary doesn't support --legacy flag as it IS the native implementation
        // pass generator version if needed, but we might not have pkg version here easily if we are outside.
        // However, the native binary might not strictly require it for basic functionality.

        const result = spawnSync(binaryPath, args, {
            stdio: "inherit",
            cwd: defaults.rootDir,
        });

        if (result.status !== 0) {
            process.exit(result.status || 1);
        }

        if (!fs.existsSync(defaults.input)) {
            console.error(`[bakerywave] reference JSON not found: ${defaults.input}`);
            process.exit(1);
        }
        return;
    }

    // 2. Fallback to Node.js script
    if (!fs.existsSync(docgenScript)) {
        console.error(`[bakerywave] luau-docgen script not found: ${docgenScript}`);
        process.exit(1);
    }

    const args = [
        docgenScript,
        "--root",
        defaults.rootDir,
        "--src",
        defaults.srcDir,
        "--out",
        defaults.input,
    ];

    if (defaults.typesDir) {
        args.push("--types", defaults.typesDir);
    }
    if (docgenFlags.failOnWarning) {
        args.push("--fail-on-warning");
    }
    if (docgenFlags.legacy) {
        args.push("--legacy");
    }

    const result = spawnSync(process.execPath, args, {
        stdio: "inherit",
        cwd: defaults.rootDir,
    });
    if (result.error) {
        console.error(`[bakerywave] failed to run luau-docgen: ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }

    if (!fs.existsSync(defaults.input)) {
        console.error(`[bakerywave] reference JSON not found: ${defaults.input}`);
        process.exit(1);
    }
}

function runReferenceBuild(docgenScript, generator, baseCwd, siteDirAbs, referenceOptions, docgenFlags, configPath) {
    const defaults = resolveReferenceDefaults(baseCwd, siteDirAbs, referenceOptions);
    runLuauDocgen(docgenScript, defaults, docgenFlags);

    const generatorOptions = {
        ...referenceOptions,
        lang: defaults.lang,
        input: defaults.input,
    };

    const result = generator.generateReferenceDocs(siteDirAbs, generatorOptions);
    if (result.skipped) {
        console.error("[bakerywave] reference generation skipped.");
        process.exit(1);
    }

    const i18nOptions = loadI18nOptions(baseCwd, siteDirAbs, configPath);
    if (generatorOptions.renderMode !== "json") {
        syncReferenceI18n(siteDirAbs, result.outDir, defaults.lang, i18nOptions);
    }

    console.log(`[bakerywave] reference generated: ${result.outDir}`);
}


function resolveI18nDefaults(i18nOptions) {
    const locales = Array.isArray(i18nOptions.locales) ? i18nOptions.locales : [];
    const defaultLocale = i18nOptions.defaultLocale || locales[0] || null;
    let referenceLocales = Array.isArray(i18nOptions.referenceLocales) ? i18nOptions.referenceLocales : [];
    if (referenceLocales.length === 0 && defaultLocale) {
        referenceLocales = locales.filter((locale) => locale !== defaultLocale);
    }
    const referenceCopy = !i18nOptions.reference || i18nOptions.reference.copy !== false;
    return {
        locales,
        defaultLocale,
        referenceLocales,
        referenceCopy,
    };
}

function copyDirSync(source, target) {
    if (!fs.existsSync(source)) {
        return;
    }
    fs.mkdirSync(target, { recursive: true });
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const dstPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, dstPath);
            continue;
        }
        fs.copyFileSync(srcPath, dstPath);
    }
}

function syncReferenceI18n(siteDirAbs, outDir, lang, i18nOptions) {
    const defaults = resolveI18nDefaults(i18nOptions);
    if (!defaults.defaultLocale || defaults.referenceLocales.length === 0 || !defaults.referenceCopy) {
        return;
    }

    const docsRoot = path.join(siteDirAbs, "i18n");
    for (const locale of defaults.referenceLocales) {
        const target = path.join(
            docsRoot,
            locale,
            "docusaurus-plugin-content-docs",
            "current",
            "reference",
            lang
        );
        fs.rmSync(target, { recursive: true, force: true });
        copyDirSync(outDir, target);
    }
}
function createWatchers(targets, onChange) {
    const watchers = [];
    for (const target of targets) {
        if (!fs.existsSync(target)) {
            continue;
        }
        try {
            const watcher = fs.watch(target, { recursive: true }, onChange);
            watchers.push(watcher);
            continue;
        } catch (error) {
            const watcher = fs.watch(target, onChange);
            watchers.push(watcher);
        }
    }
    return watchers;
}

function runReferenceWatch(docgenScript, generator, baseCwd, siteDirAbs, referenceOptions, docgenFlags, configPath) {
    const defaults = resolveReferenceDefaults(baseCwd, siteDirAbs, referenceOptions);
    const watchTargets = [path.join(defaults.rootDir, defaults.srcDir)];
    if (defaults.typesDir) {
        watchTargets.push(path.join(defaults.rootDir, defaults.typesDir));
    }

    let running = false;
    let pending = false;

    const trigger = () => {
        if (running) {
            pending = true;
            return;
        }
        running = true;
        pending = false;
        try {
            runReferenceBuild(docgenScript, generator, baseCwd, siteDirAbs, referenceOptions, docgenFlags, configPath);
        } finally {
            running = false;
            if (pending) {
                trigger();
            }
        }
    };

    trigger();

    const watchers = createWatchers(watchTargets, () => {
        trigger();
    });

    if (watchers.length === 0) {
        console.error("[bakerywave] no watch targets found.");
        process.exit(1);
    }

    console.log("[bakerywave] watching reference sources...");
}

function buildReferenceWatchArgs(siteDirAbs, configPath) {
    const args = ["reference", "watch", "--site-dir", siteDirAbs];
    if (configPath) {
        args.push("--config", configPath);
    }
    return args;
}

function buildRestartTargets(baseCwd, siteDirAbs, configPath) {
    const targets = [];
    const projectRoot = resolveProjectRoot(baseCwd, siteDirAbs);

    const packageDirs = [
        path.join(projectRoot, "packages", "docs-preset"),
        path.join(projectRoot, "packages", "docs-theme"),
        path.join(projectRoot, "packages", "docusaurus-plugin-reference"),
        path.join(projectRoot, "packages", "bakerywave"),
        path.join(projectRoot, "packages", "luau-docgen"),
    ];

    for (const dir of packageDirs) {
        if (fs.existsSync(dir)) {
            targets.push(dir);
        }
    }

    const configCandidates = configPath
        ? [path.resolve(baseCwd, configPath)]
        : [
            path.join(siteDirAbs, "docusaurus.config.js"),
            path.join(siteDirAbs, "docusaurus.config.cjs"),
            path.join(siteDirAbs, "docusaurus.config.mjs"),
            path.join(siteDirAbs, "docusaurus.config.ts"),
        ];

    for (const candidate of configCandidates) {
        if (fs.existsSync(candidate)) {
            targets.push(candidate);
        }
    }

    const tomlCandidates = [
        path.join(siteDirAbs, "bakerywave.toml"),
        path.join(projectRoot, "bakerywave.toml"),
    ];

    for (const candidate of tomlCandidates) {
        if (fs.existsSync(candidate)) {
            targets.push(candidate);
        }
    }

    return targets;
}


function runDev(baseCwd, siteDirAbs, configPath, docusaurusArgs, devOptions) {
    const watchArgs = buildReferenceWatchArgs(siteDirAbs, configPath);
    const watchProcess = spawn(process.execPath, [__filename, ...watchArgs], {
        stdio: "inherit",
        cwd: baseCwd,
        env: process.env,
    });

    const restartEnabled = !(devOptions && devOptions.restart === false);
    const restartTargets = restartEnabled ? buildRestartTargets(baseCwd, siteDirAbs, configPath) : [];
    let startProcess = spawnDocusaurus("start", docusaurusArgs, siteDirAbs);
    const children = [watchProcess, startProcess];
    const restartWatchers = restartTargets.length > 0 ? createWatchers(restartTargets, () => scheduleRestart()) : [];
    let exiting = false;
    let restartTimer = null;

    const scheduleRestart = () => {
        if (!restartEnabled || exiting) {
            return;
        }
        if (restartTimer) {
            return;
        }
        restartTimer = setTimeout(() => {
            restartTimer = null;
            if (exiting) {
                return;
            }
            if (startProcess && startProcess.pid && startProcess.exitCode === null) {
                startProcess.kill();
            }
            startProcess = spawnDocusaurus("start", docusaurusArgs, siteDirAbs);
            children[1] = startProcess;
            startProcess.on("exit", (code) => {
                if (exiting) {
                    return;
                }
                shutdown(code === null ? 1 : code);
            });
        }, 150);
    };

    const shutdown = (exitCode) => {
        if (exiting) {
            return;
        }
        exiting = true;
        for (const watcher of restartWatchers) {
            try {
                watcher.close();
            } catch (error) {
                // ignore
            }
        }
        for (const child of children) {
            if (child && child.pid && child.exitCode === null) {
                child.kill();
            }
        }
        process.exit(exitCode);
    };

    for (const child of children) {
        child.on("exit", (code) => {
            if (exiting) {
                return;
            }
            shutdown(code === null ? 1 : code);
        });
    }

    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
}


function printHelp() {
    console.log("bakerywave");
    console.log("\nUsage:");
    console.log("  bakerywave <command> [siteDir] [-- ...args]");
    console.log("\nCommands:");
    console.log("  start               Start Docusaurus dev server");
    console.log("  dev                 Start dev server with reference watch (auto restart)");
    console.log("  build                Build the site");
    console.log("  serve|preview        Serve the built site");
    console.log("  clear                Clear Docusaurus cache");
    console.log("  swizzle              Swizzle theme components");
    console.log("  write-translations   Generate translation files");
    console.log("  write-heading-ids    Generate heading ids");
    console.log("  reference build      Run docgen and JSON -> MDX");
    console.log("  reference watch      Watch sources and rebuild reference");
    console.log("\nGlobal Options:");
    console.log("  --cwd <dir>          Base working directory");
    console.log("  --site-dir <dir>     Site directory (default: website or cwd)");
    console.log("  --config <path>      Docusaurus config path\n  --no-restart         Disable auto restart for dev");
}

function main() {
    const { head, tail } = splitArgs(process.argv.slice(2));
    const { cwd, siteDir, configPath, rest } = parseGlobalArgs(head);

    if (rest.length === 0) {
        printHelp();
        return;
    }

    const commandRaw = rest[0];
    if (commandRaw === "--help" || commandRaw === "-h" || commandRaw === "help") {
        printHelp();
        return;
    }

    const command = resolveCommand(commandRaw);
    const commandArgs = rest.slice(1);

    let siteDirOverride = null;
    if ((DOCUSAURUS_COMMANDS.has(command) || command === "init" || command === "dev") && commandArgs[0] && !commandArgs[0].startsWith("-")) {
        siteDirOverride = commandArgs[0];
        commandArgs.shift();
    }

    const siteDirAbs = resolveSiteDir(cwd, siteDirOverride || siteDir);

    if (command === "dev") {
        const { args: devArgs, restart } = parseDevArgs([...commandArgs, ...tail]);
        runDev(cwd, siteDirAbs, configPath, devArgs, { restart });
        return;
    }

    if (DOCUSAURUS_COMMANDS.has(command)) {
        runDocusaurus(command, [...commandArgs, ...tail], siteDirAbs);
        return;
    }

    if (command === "init") {
        runCommand("npm", ["create", "@storybakery/docs", siteDirOverride || ""].filter(Boolean), {
            cwd,
        });
        return;
    }

    if (command === "reference") {
        const subcommand = commandArgs[0];
        const subArgs = commandArgs.slice(1);
        if (!subcommand || (subcommand !== "build" && subcommand !== "watch")) {
            printHelp();
            process.exit(1);
        }

        const loadedReferenceOptions = loadReferenceOptions(cwd, siteDirAbs, configPath);
        const { options: parsedOptions } = parseReferenceArgs(subArgs);
        const referenceOptions = resolveReferenceOptions(loadedReferenceOptions, parsedOptions);

        const searchPaths = [siteDirAbs, cwd, __dirname];
        let docgenScript;
        let generator;
        try {
            docgenScript = resolveDocgenScript(searchPaths);
            generator = resolveReferenceGenerator(searchPaths);
        } catch (error) {
            console.error("[bakerywave] required packages are missing.");
            console.error(error.message);
            process.exit(1);
        }

        const docgenFlags = {
            failOnWarning: parsedOptions.failOnWarning === true,
            legacy: parsedOptions.legacy === true,
        };

        if (subcommand === "build") {
            runReferenceBuild(docgenScript, generator, cwd, siteDirAbs, referenceOptions, docgenFlags, configPath);
            return;
        }

        runReferenceWatch(docgenScript, generator, cwd, siteDirAbs, referenceOptions, docgenFlags, configPath);
        return;
    }

    console.error(`[bakerywave] unknown command: ${commandRaw}`);
    process.exit(1);
}

main();
