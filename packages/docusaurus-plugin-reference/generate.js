const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SECTION_ORDER = [
  "type",
  "interface",
  "constructor",
  "property",
  "method",
  "function",
  "event",
];

const KIND_LABELS = {
  type: "Types",
  interface: "Interfaces",
  constructor: "Constructors",
  property: "Properties",
  method: "Methods",
  function: "Functions",
  event: "Events",
};

function resolvePath(siteDir, value, fallback) {
  const target = value || fallback;
  if (!target) {
    return null;
  }
  return path.isAbsolute(target) ? target : path.resolve(siteDir, target);
}


function findGitRoot(startDir) {
  let current = startDir;
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}


function normalizeRepoUrl(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }
  let url = remoteUrl.trim();
  if (url.endsWith(".git")) {
    url = url.slice(0, -4);
  }
  if (url.startsWith("git@")) {
    const parts = url.replace("git@", "").split(":");
    const hostPart = parts[0];
    const pathPart = parts.slice(1).join(":");
    if (hostPart && pathPart) {
      return "https://" + hostPart + "/" + pathPart;
    }
  }
  return url;
}

function detectDefaultSource(siteDir) {
  try {
    const gitRoot = findGitRoot(siteDir);
    if (!gitRoot) {
      return null;
    }
    const remote = execSync("git config --get remote.origin.url", { cwd: gitRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (!remote) {
      return null;
    }
    const repoUrl = normalizeRepoUrl(remote);
    if (!repoUrl) {
      return null;
    }
    return {
      repoUrl,
      branch: "main",
      basePath: "",
      stripPrefix: "",
    };
  } catch (error) {
    return null;
  }
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return { data: JSON.parse(raw), raw };
}

function sha1(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function sanitizeRouteBasePath(value, lang) {
  const base = value || `reference/${lang}`;
  return base.replace(/^\/+|\/+$/g, "");
}

function rewriteLegacyApiLinks(markdown, options) {
  if (!markdown) {
    return markdown;
  }

  const basePath = `/${options.routeBasePath}`;
  return markdown.replace(/\]\(\/api\/([A-Za-z0-9_]+)(#[^)]+)?\)/g, (_, name, hash) => {
    const suffix = hash || "";
    return `](${basePath}/${name}${suffix})`;
  });
}

function applyDefaultFenceLanguage(markdown, defaultLang) {
  if (!markdown) {
    return markdown;
  }

  const lines = markdown.split(/\r?\n/);
  const output = [];
  let inFence = false;
  const language = defaultLang || "luau";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      const fenceLang = trimmed.slice(3).trim();
      if (!inFence) {
        if (!fenceLang) {
          output.push("```" + (language === "luau" ? "lua" : language));
        } else if (fenceLang === "luau") {
          output.push("```lua");
        } else {
          output.push(line);
        }
        inFence = true;
      } else {
        output.push(line);
        inFence = false;
      }
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function stripApiPrefix(value) {
  return value.replace(/^(Class|Datatype|Enum|Global|Library)\./, "");
}

function resolveApiTargetLink(target, options, classLinkMap) {
  if (!target || typeof target !== "string") {
    return null;
  }
  if (!target.startsWith("Class.")) {
    return null;
  }
  const rest = target.slice("Class.".length);
  if (!rest) {
    return null;
  }
  const basePath = options && options.routeBasePath ? `/${options.routeBasePath}` : "";
  const match = rest.match(/^([A-Za-z0-9_]+)([:\.])(.+)$/);
  let className = rest;
  let memberName = null;
  if (match) {
    className = match[1];
    memberName = match[3] || null;
  }
  if (!className) {
    return null;
  }
  let link = null;
  if (classLinkMap && classLinkMap.has(className)) {
    link = basePath + "/" + classLinkMap.get(className);
  } else {
    link = basePath + "/classes/" + sanitizeModulePath(className);
  }
  if (memberName) {
    const cleaned = String(memberName).replace(/\(.*\)$/, "");
    const anchor = sanitizeAnchorId(cleaned);
    if (anchor) {
      link += `#${anchor}`;
    }
  }
  return link;
}

function applyApiLinks(markdown, options, classLinkMap) {
  if (!markdown) {
    return markdown;
  }
  return markdown.replace(/`([^`\n]+)`/g, (full, content) => {
    const parts = content.split("|");
    const target = parts.shift().trim();
    const label = parts.length > 0 ? parts.join("|").trim() : null;
    if (label === "no-link") {
      return "`" + target + "`";
    }
    const link = resolveApiTargetLink(target, options, classLinkMap);
    const display = label && label.length > 0 ? label : stripApiPrefix(target);
    if (!link) {
      return "`" + (display || target) + "`";
    }
    return `[${display}](${link})`;
  });
}
function resolveFenceLanguage(options) {
  const configured = (options && options.codeFenceLanguage) || (options && options.lang) || "lua";
  if (configured === "luau") {
    return "lua";
  }
  return configured;
}


function normalizeOptions(siteDir, opts) {
  const lang = opts.lang || "luau";
  const input = resolvePath(
    siteDir,
    opts.input,
    path.join(".generated", "reference", `${lang}.json`)
  );
  const outDir = resolvePath(siteDir, opts.outDir, path.join("docs", "reference", lang));
  const manifestPath = resolvePath(
    siteDir,
    opts.manifestPath,
    path.join(".generated", "reference", "manifest.json")
  );
  const routeBasePath = sanitizeRouteBasePath(opts.routeBasePath, lang);

  return {
    lang,
    input,
    outDir,
    manifestPath,
    routeBasePath,
    renderMode: opts.renderMode || "mdx",
    clean: opts.clean !== false,
    includePrivate: opts.includePrivate === true,
    overviewTitle: opts.overviewTitle || "Overview",
    defaultCategory: opts.defaultCategory || "Classes",
    categoryOrder: Array.isArray(opts.categoryOrder) ? opts.categoryOrder : [],
    codeTabSize: typeof opts.codeTabSize === "number" ? opts.codeTabSize : null,
    source: opts.source || detectDefaultSource(siteDir),
  };
}

function loadManifest(manifestPath) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { outputs: {}, inputs: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { outputs: {}, inputs: {} };
  }
}

function saveManifest(manifestPath, manifest) {
  if (!manifestPath) {
    return;
  }
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function cleanStaleFiles(outDir, manifest, nextFiles, lang) {
  const previous = (manifest.outputs && manifest.outputs[lang]) || [];
  const nextSet = new Set(nextFiles);
  for (const file of previous) {
    if (!nextSet.has(file)) {
      removeFileIfExists(path.join(outDir, file));
    }
  }
}

function pruneEmptyDirs(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    pruneEmptyDirs(path.join(dir, entry.name));
  }

  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmdirSync(dir);
  }
}

function sortSymbols(symbols) {
  return symbols.slice().sort((left, right) => {
    const leftName = left.qualifiedName || left.name || "";
    const rightName = right.qualifiedName || right.name || "";
    return leftName.localeCompare(rightName);
  });
}

function getTagValues(symbol, name) {
  const tags = symbol && symbol.docs && Array.isArray(symbol.docs.tags) ? symbol.docs.tags : [];
  return tags
    .filter((tag) => tag.name === name && tag.value)
    .map((tag) => tag.value);
}

function hasEventTag(symbol) {
  const tags = symbol && symbol.docs && Array.isArray(symbol.docs.tags) ? symbol.docs.tags : [];
  return tags.some((tag) => {
    if (tag.name === "event") {
      return true;
    }
    return tag.name === "tag" && String(tag.value).toLowerCase() === "event";
  });
}

function getQualifiedSeparator(symbol) {
  if (!symbol || !symbol.qualifiedName) {
    return null;
  }
  if (symbol.qualifiedName.includes(":")) {
    return ":";
  }
  if (symbol.qualifiedName.includes(".")) {
    return ".";
  }
  return null;
}

function getGroupKind(symbol) {
  const kind = (symbol && symbol.kind) || "module";
  if (kind === "constructor") {
    return "constructor";
  }
  if (kind === "function") {
    const separator = getQualifiedSeparator(symbol);
    if (separator === ":" && symbol.name) {
      return "method";
    }
    if (symbol.name === "new" && separator === "." && extractWithin(symbol)) {
      return "constructor";
    }
  }
  if (hasEventTag(symbol) && kind !== "class" && kind !== "module") {
    return "event";
  }
  if (kind === "field") {
    return "interface";
  }
  return kind;
}

function groupSymbols(symbols) {
  const groups = new Map();
  for (const symbol of symbols) {
    const kind = getGroupKind(symbol);
    if (!groups.has(kind)) {
      groups.set(kind, []);
    }
    groups.get(kind).push(symbol);
  }
  for (const [kind, items] of groups.entries()) {
    groups.set(kind, sortSymbols(items));
  }
  return groups;
}

function extractWithin(symbol) {
  if (!symbol || !symbol.qualifiedName) {
    return null;
  }
  const value = symbol.qualifiedName;
  const colonIndex = value.indexOf(":" );
  if (colonIndex !== -1) {
    return value.slice(0, colonIndex);
  }
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex !== -1) {
    return value.slice(0, dotIndex);
  }
  return null;
}

function sanitizeModulePath(moduleId) {
  const normalized = moduleId.replace(/\\/g, "/");
  const segments = normalized.split("/").map((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) {
      return "unnamed";
    }
    return trimmed.replace(/[<>:"|?*]/g, "_");
  });
  return segments.join("/");
}

function sanitizeCategoryPath(value) {
  if (!value) {
    return "";
  }
  return sanitizeModulePath(value);
}

function getSymbolCategories(symbol) {
  const tags = symbol && symbol.docs && Array.isArray(symbol.docs.tags) ? symbol.docs.tags : [];
  const categories = tags
    .filter((tag) => tag && tag.name === "category" && tag.value)
    .map((tag) => String(tag.value));
  return categories;
}


function sanitizeAnchorId(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const collapsed = trimmed.replace(/\s+/g, "-");
  const cleaned = collapsed.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned || null;
}

function createAnchorId(symbol, headingLabel, usedIds) {
  if (!usedIds) {
    return sanitizeAnchorId(symbol && symbol.name) || sanitizeAnchorId(headingLabel);
  }

  const candidates = [];
  const nameId = sanitizeAnchorId(symbol && symbol.name);
  if (nameId) {
    candidates.push(nameId);
  }

  const qualifiedId = sanitizeAnchorId(symbol && symbol.qualifiedName);
  if (qualifiedId && !candidates.includes(qualifiedId)) {
    candidates.push(qualifiedId);
  }

  const fallbackId = sanitizeAnchorId(headingLabel);
  if (fallbackId && !candidates.includes(fallbackId)) {
    candidates.push(fallbackId);
  }

  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
  }

  const base = candidates[0];
  let index = 2;
  let nextId = `${base}-${index}`;
  while (usedIds.has(nextId)) {
    index += 1;
    nextId = `${base}-${index}`;
  }
  usedIds.add(nextId);
  return nextId;
}

function getSectionAnchorId(kind) {
  const label = KIND_LABELS[kind] || kind;
  const fallback = label.toLowerCase().replace(/s+/g, "-");
  return sanitizeAnchorId(label) || fallback;
}

function renderSymbol(symbol, options, usedAnchorIds, anchorOverride = null, headingOverride = null, classLinkMap = null) {
  const headingLabel = headingOverride || symbol.name || symbol.qualifiedName || "Unnamed";
  let anchorId = anchorOverride;
  if (anchorId) {
    usedAnchorIds.add(anchorId);
  } else {
    anchorId = createAnchorId(symbol, headingLabel, usedAnchorIds);
  }
  const sourceUrl = resolveSourceUrl(symbol.location, options && options.source);
  const heading = anchorId ? `### ${headingLabel} {#${anchorId}}` : `### ${headingLabel}`;
  const lines = [heading];
  if (sourceUrl) {
    const label = (options && options.source && options.source.icon) || DEFAULT_SOURCE_ICON;
    lines.push('', `<div class="sb-ref-heading-actions"><a class="sb-ref-source sb-ref-source-inline" href="${sourceUrl}">${label}</a></div>`);
  }

  if (symbol.types && symbol.types.display) {
    const fenceLang = resolveFenceLanguage(options);
    lines.push("", "```" + fenceLang, symbol.types.display, "```");
  }

  const descriptionRaw = symbol.docs && symbol.docs.descriptionMarkdown;
  const normalized = applyDefaultFenceLanguage(descriptionRaw, options.lang || "luau");
  const withApiLinks = applyApiLinks(normalized, options, classLinkMap);
  const description = rewriteLegacyApiLinks(withApiLinks, options);
  const summary = symbol.docs && symbol.docs.summary;
  if (description && description.trim().length > 0) {
    lines.push("", description);
  } else if (summary && summary.trim().length > 0) {
    lines.push("", summary);
  }


  const tags = symbol.docs && Array.isArray(symbol.docs.tags) ? symbol.docs.tags : [];
  if (tags.length > 0) {
    lines.push("", "Tags:");
    for (const tag of tags) {
      const value = tag.value !== undefined ? `: ${tag.value}` : "";
      lines.push(`- ${tag.name}${value}`);
    }
  }

  return lines.join("\n");
}
function renderSymbolBody(symbol, options) {
  const lines = [];

  if (symbol.types && symbol.types.display) {
    const fenceLang = resolveFenceLanguage(options);
    lines.push("", "```" + fenceLang, symbol.types.display, "```");
  }

  const descriptionRaw = symbol.docs && symbol.docs.descriptionMarkdown;
  const normalized = applyDefaultFenceLanguage(descriptionRaw, options.lang || "luau");
  const withApiLinks = applyApiLinks(normalized, options, null);
  const description = rewriteLegacyApiLinks(withApiLinks, options);
  const summary = symbol.docs && symbol.docs.summary;
  if (description && description.trim().length > 0) {
    lines.push("", description);
  } else if (summary && summary.trim().length > 0) {
    lines.push("", summary);
  }

  const tags = symbol.docs && Array.isArray(symbol.docs.tags) ? symbol.docs.tags : [];
  if (tags.length > 0) {
    lines.push("", "Tags:");
    for (const tag of tags) {
      const value = tag.value !== undefined ? `: ${tag.value}` : "";
      lines.push(`- ${tag.name}${value}`);
    }
  }

  return lines.join("\n");
}

function resolveClassHref(className, classLinkMap) {
  if (!className || !classLinkMap) {
    return null;
  }
  return classLinkMap.get(className) || null;
}


const DEFAULT_SOURCE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="sb-ref-source-icon"><path fill="currentColor" d="M8.7 16.6 4.1 12l4.6-4.6L7.3 6l-6 6 6 6 1.4-1.4zm6.6 0L19.9 12l-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4zM10 19l4-14h2l-4 14z"/></svg>`;

function resolveSourceUrl(location, source) {
  if (!location || !location.file || !source || !source.repoUrl) {
    return null;
  }
  const repoUrl = String(source.repoUrl).replace(/\/+$/g, "");
  const branch = source.branch || "main";
  const basePath = source.basePath ? String(source.basePath).replace(/\/+$/g, "") : "";
  let relative = location.file.replace(/\\/g, "/");
  if (source.stripPrefix && relative.startsWith(source.stripPrefix)) {
    relative = relative.slice(source.stripPrefix.length);
    if (relative.startsWith("/")) {
      relative = relative.slice(1);
    }
  }
  const parts = [repoUrl, "blob", branch];
  if (basePath) {
    parts.push(basePath);
  }
  parts.push(relative);
  let url = parts.join("/");
  if (location.line) {
    url += `#L${location.line}`;
  }
  return url;
}

function renderSummarySection(classSymbol, anchorsByKind, classLinkMap, options) {
  const lines = ["## Summary"];
  if (classSymbol.location && classSymbol.location.file) {
    const sourceUrl = resolveSourceUrl(classSymbol.location, options && options.source);
  }
  const extendsValues = getTagValues(classSymbol, "extends");
  if (extendsValues.length > 0) {
    lines.push("", "### Extends");
    for (const value of extendsValues) {
      const link = resolveClassHref(value, classLinkMap);
      lines.push("- " + (link ? "[" + value + "](" + link + ")" : value));
    }
  }

  for (const kind of SECTION_ORDER) {
    const entries = anchorsByKind.get(kind);
    if (!entries || entries.length === 0) {
      continue;
    }
    const sectionLabel = KIND_LABELS[kind] || kind;
    lines.push("", `### ${sectionLabel}`);
    for (const entry of entries) {
      const anchor = entry.anchorId ? "#" + entry.anchorId : "";
      const label = entry.symbol.name || entry.symbol.qualifiedName || "Unnamed";
      if (anchor) {
        lines.push("- [" + label + "](" + anchor + ")");
      } else {
        lines.push("- " + label);
      }
    }
  }

  return lines;
}

function renderClassPage(classSymbol, members, options, classLinkMap) {
  const className = classSymbol.name || "Class";
  const classSourceUrl = resolveSourceUrl(classSymbol.location, options && options.source);
  const lines = [`# ${className}`];
  if (classSourceUrl) {
    const label = (options && options.source && options.source.icon) || DEFAULT_SOURCE_ICON;
    lines.push("", `<div class="sb-ref-heading-actions"><a class="sb-ref-source sb-ref-source-inline" href="${classSourceUrl}">${label}</a></div>`);
  }
  const body = renderSymbolBody(classSymbol, options);
  if (body.trim().length > 0) {
    lines.push("", body);
  }

  const groups = groupSymbols(members || []);
  const usedAnchorIds = new Set();
  const anchorsByKind = new Map();

  for (const kind of SECTION_ORDER) {
    const items = groups.get(kind);
    if (!items || items.length === 0) {
      continue;
    }
    const entries = [];
    for (const symbol of items) {
      const headingLabel = symbol.name || symbol.qualifiedName || "Unnamed";
      const anchorId = createAnchorId(symbol, headingLabel, usedAnchorIds);
      entries.push({ symbol, anchorId });
    }
    anchorsByKind.set(kind, entries);
  }

  const summaryLines = renderSummarySection(classSymbol, anchorsByKind, classLinkMap, options);
  if (summaryLines.length > 0) {
    lines.push("", ...summaryLines);
  }

  for (const kind of SECTION_ORDER) {
    if (kind === "class" || kind === "module") {
      continue;
    }
    const entries = anchorsByKind.get(kind);
    if (!entries || entries.length === 0) {
      continue;
    }
    const sectionLabel = KIND_LABELS[kind] || kind;
    const sectionAnchor = getSectionAnchorId(kind);
    lines.push("", `## ${sectionLabel} {#${sectionAnchor}}`);
    for (const entry of entries) {
      lines.push(
        "",
        renderSymbol(entry.symbol, options, usedAnchorIds, entry.anchorId, entry.symbol.name, classLinkMap)
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderModulePage(moduleData, options) {
  const className = classSymbol.name || "Class";
  const classSourceUrl = resolveSourceUrl(classSymbol.location, options && options.source);
  let classHeading = className;
  if (classSourceUrl) {
    const label = (options && options.source && options.source.icon) || DEFAULT_SOURCE_ICON;
    classHeading = `<span class="sb-ref-heading-row"><span class="sb-ref-heading-text">${className}</span><a class="sb-ref-source sb-ref-source-inline" href="${classSourceUrl}">${label}</a></span>`;
  }
  const lines = [`# ${classHeading}`];
  if (moduleData.path) {
    lines.push("", `Source: \`${moduleData.path}\``);
  }

  const symbols = Array.isArray(moduleData.symbols) ? moduleData.symbols : [];
  const filtered = symbols.filter((symbol) => {
    if (symbol.visibility === "ignored") {
      return false;
    }
    if (symbol.visibility === "private" && !options.includePrivate) {
      return false;
    }
    return true;
  });

  const groups = groupSymbols(filtered);
  const usedAnchorIds = new Set();
  for (const kind of SECTION_ORDER) {
    const items = groups.get(kind);
    if (!items || items.length === 0) {
      continue;
    }
    lines.push("", `## ${KIND_LABELS[kind] || kind}`);
    for (const symbol of items) {
      lines.push("", renderSymbol(symbol, options, usedAnchorIds));
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderOverviewPage(categoryMap, options) {
  const title = (options && options.overviewTitle) || "Overview";
  const lines = [
    "---",
    `title: ${title}`,
    "sidebar_label: Overview",
    "sidebar_position: 1",
    "---",
    "",
    `# ${title}`,
    "",
    "<div className=\"sb-ref-overview\">",
  ];
  const entries = Array.from(categoryMap.entries());
  if (entries.length === 0) {
    lines.push("<p>No classes found.</p>", "</div>");
    return `${lines.join("\n")}\n`;
  }

  const order = (options && Array.isArray(options.categoryOrder)) ? options.categoryOrder : [];
  const groups = new Map();

  for (const [category, items] of entries) {
    const parts = category.split("/").map((part) => part.trim()).filter(Boolean);
    const top = parts.length > 0 ? parts[0] : category;
    const rest = parts.slice(1).join("/");
    if (!groups.has(top)) {
      groups.set(top, new Map());
    }
    const sub = rest || "";
    if (!groups.get(top).has(sub)) {
      groups.get(top).set(sub, []);
    }
    groups.get(top).get(sub).push(...items);
  }

  const topEntries = Array.from(groups.entries());
  topEntries.sort((left, right) => {
    const leftIndex = order.indexOf(left[0]);
    const rightIndex = order.indexOf(right[0]);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left[0].localeCompare(right[0]);
  });

  for (const [top, subMap] of topEntries) {
    const flatCount = Array.from(subMap.values()).reduce((acc, list) => acc + list.length, 0);
    lines.push("", `<section className=\"sb-ref-section\">`);
    lines.push(`<div className=\"sb-ref-section-title\">${top}</div>`);
    lines.push(`<div className=\"sb-ref-section-meta\">${flatCount} classes</div>`);

    const subEntries = Array.from(subMap.entries());
    subEntries.sort((left, right) => left[0].localeCompare(right[0]));

    for (const [sub, items] of subEntries) {
      const list = items.slice().sort((a, b) => a.id.localeCompare(b.id));
      if (sub) {
        lines.push("", `<div className=\"sb-ref-subtitle\">${sub}</div>`);
      }
      lines.push('<div className="sb-ref-card-grid">');
      for (const entry of list) {
        const link = entry.relativePath.replace(/\\/g, "/").replace(/\.mdx$/, "");
        lines.push(`<a className=\"sb-ref-card\" href=\"${link}\">`);
        lines.push(`<div className=\"sb-ref-card-title\">${entry.id}</div>`);
        lines.push('</a>');
      }
      lines.push('</div>');
    }

    lines.push("</section>");
  }

  lines.push("</div>");

  return `${lines.join("\n")}\n`;
}

function buildOutputs(referenceJson, options) {
  const outputs = [];
  const modules = Array.isArray(referenceJson.modules) ? referenceJson.modules : [];

  const classMap = new Map();

  for (const moduleData of modules) {
    const symbols = Array.isArray(moduleData.symbols) ? moduleData.symbols : [];

    for (const symbol of symbols) {
      if (symbol.kind === "class" && symbol.name) {
        if (!classMap.has(symbol.name)) {
          classMap.set(symbol.name, { classSymbol: symbol, members: [] });
        } else if (!classMap.get(symbol.name).classSymbol) {
          classMap.get(symbol.name).classSymbol = symbol;
        }
      }
    }

    for (const symbol of symbols) {
      if (symbol.kind === "class") {
        continue;
      }

      const within = extractWithin(symbol);
      if (within && classMap.has(within)) {
        classMap.get(within).members.push(symbol);
      }
    }
  }

  const classEntries = [];
  for (const [className, entry] of classMap.entries()) {
    const categories = getSymbolCategories(entry.classSymbol || {});
    const primaryCategory = categories.length > 0 ? categories[0] : "";
    const categoryPath = primaryCategory ? sanitizeCategoryPath(primaryCategory) : "";
    const basePath = categoryPath ? "classes/" + categoryPath : "classes";
    const relativePath = basePath + "/" + sanitizeModulePath(className) + ".mdx";
    classEntries.push({
      id: className,
      relativePath,
      categories,
      classSymbol: entry.classSymbol || { name: className },
      members: entry.members,
    });
  }

  classEntries.sort((left, right) => left.id.localeCompare(right.id));

  const classLinkMap = new Map();
  for (const entry of classEntries) {
    const link = entry.relativePath.replace(/\\/g, "/").replace(/\.mdx$/, "");
    classLinkMap.set(entry.id, link);
  }

  for (const entry of classEntries) {
    outputs.push({
      id: entry.id,
      relativePath: entry.relativePath,
      content: renderClassPage(entry.classSymbol, entry.members, options, classLinkMap),
    });
  }

  const categoryMap = new Map();
  for (const entry of classEntries) {
    const defaultCategory = options.defaultCategory || "Classes";
    const list = entry.categories.length > 0 ? entry.categories : [defaultCategory];
    for (const category of list) {
      const key = category && category.trim().length > 0 ? category : defaultCategory;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, []);
      }
      categoryMap.get(key).push(entry);
    }
  }

  outputs.push({
    id: "index",
    relativePath: "index.mdx",
    content: renderOverviewPage(categoryMap, options),
  });

  return outputs;
}

function generateReferenceDocs(siteDir, opts = {}, providedContent = null) {
  const options = normalizeOptions(siteDir, opts);
  if (options.renderMode !== "mdx") {
    return { written: [], skipped: true };
  }

  const content = providedContent || readJsonFile(options.input);
  if (!content) {
    return { written: [], skipped: true };
  }

  const outputs = buildOutputs(content.data, options);
  const files = outputs.map((item) => item.relativePath);
  const manifest = loadManifest(options.manifestPath);

  if (options.clean) {
    cleanStaleFiles(options.outDir, manifest, files, options.lang);
  }

  for (const output of outputs) {
    writeFile(path.join(options.outDir, output.relativePath), output.content);
  }

  manifest.outputs = manifest.outputs || {};
  manifest.inputs = manifest.inputs || {};
  manifest.outputs[options.lang] = files;
  manifest.inputs[options.lang] = {
    path: options.input,
    hash: sha1(content.raw),
    generatorVersion: content.data.generatorVersion || null,
    generatedAt: new Date().toISOString(),
  };
  saveManifest(options.manifestPath, manifest);
  pruneEmptyDirs(options.outDir);

  const tabSize = typeof options.codeTabSize === "number" ? options.codeTabSize : null;
  if (tabSize) {
    const cssPath = path.join(siteDir, "src", "css", "custom.css");
    ensureDir(path.dirname(cssPath));
    const markerStart = "/* sb-ref-tab-size-start */";
    const markerEnd = "/* sb-ref-tab-size-end */";
    const rule = [
      markerStart,
      ".theme-code-block, pre code {",
      `  tab-size: ${tabSize};`,
      `  -moz-tab-size: ${tabSize};`,
      `  -o-tab-size: ${tabSize};`,
      "}",
      markerEnd,
      "",
    ].join("\n");

    let css = "";
    if (fs.existsSync(cssPath)) {
      css = fs.readFileSync(cssPath, "utf8");
      const regex = /\/\* sb-ref-tab-size-start \*\/[\s\S]*?\/\* sb-ref-tab-size-end \*\//g;
      css = css.replace(regex, "").trimEnd();
      if (css.length > 0 && !css.endsWith("\n")) {
        css += "\n";
      }
    }

    css += rule;
    fs.writeFileSync(cssPath, css, "utf8");
  }

  return {
    written: files,
    manifestPath: options.manifestPath,
    outDir: options.outDir,
    lang: options.lang,
    skipped: false,
  };
}

module.exports = {
  normalizeOptions,
  generateReferenceDocs,
};
