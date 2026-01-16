const fs = require("fs");
const path = require("path");

const DEFAULT_LABELS = {
  referenceTitle: "Reference",
  referenceDescription: "Generated API reference.",
  summary: "Summary",
  types: "Types",
  properties: "Properties",
  events: "Events",
  constructors: "Constructors",
  methods: "Methods",
  functions: "Functions",
  callbacks: "Callbacks",
  parameters: "Parameters",
  returns: "Returns",
  errors: "Errors",
  name: "Name",
  type: "Type",
  description: "Description",
  source: "View Source",
  classBadge: "Class",
  propertyBadge: "Property",
  eventBadge: "Event",
  constructorBadge: "Constructor",
  methodBadge: "Method",
  functionBadge: "Function",
  callbackBadge: "Callback",
  typeBadge: "Type",
  referenceType: "Class",
  defaultValue: "Default Value",
};

function mergeLabels(labels) {
  return { ...DEFAULT_LABELS, ...(labels || {}) };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeContent(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && Array.isArray(raw.classes)) {
    return raw.classes;
  }
  if (raw && Array.isArray(raw.api)) {
    return raw.api;
  }
  return [];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, "utf8");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePathPart(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeSourceFile(filePath, sourceOptions) {
  if (!filePath) {
    return "";
  }

  let normalized = String(filePath).replace(/\\/g, "/");
  const stripPrefix = sourceOptions && (sourceOptions.stripPrefix || sourceOptions.rootDir);
  if (stripPrefix) {
    const normalizedPrefix = String(stripPrefix).replace(/\\/g, "/").replace(/\/+$/g, "");
    if (normalized.startsWith(normalizedPrefix)) {
      normalized = normalized.slice(normalizedPrefix.length);
    }
  }

  return normalizePathPart(normalized);
}

function renderTable(headers, rows, className) {
  if (!rows.length) {
    return "";
  }

  const headerCells = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
    )
    .join("");

  const classes = ["sb-ref-table", className].filter(Boolean).join(" ");
  return `<table class="${classes}"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderSummaryRow(item, anchorId, kind, className) {
  const name = escapeHtml(item.name || "");
  const type = getSummaryType(item, kind, className);
  const typeText = type ? escapeHtml(type) : "";
  const icon = `<span class="sb-ref-summary-icon sb-ref-summary-icon--${kind}" aria-hidden="true"></span>`;
  const typeMarkup = typeText ? `<span class="sb-ref-summary-type">${typeText}</span>` : "";
  return `<tr><td><div class="sb-ref-summary-cell">${icon}<a href="#${anchorId}">${name}</a>${typeMarkup}</div></td></tr>`;
}

function renderSummaryGroup(section, labels) {
  if (!section.items.length) {
    return "";
  }

  const anchors = buildAnchors(section.items, section.anchorPrefix);
  const rows = section.items
    .map((item, index) =>
      renderSummaryRow(item, anchors[index], section.kind, section.className)
    )
    .join("");
  const table = `<table class="sb-ref-summary-table"><tbody>${rows}</tbody></table>`;

  return `<div class="sb-ref-summary-group"><div class="sb-ref-summary-group-title">${escapeHtml(
    section.title
  )}</div>${table}</div>`;
}

function renderParamTable(params, labels) {
  if (!Array.isArray(params) || params.length === 0) {
    return "";
  }

  const rows = params.map((param) => [
    escapeHtml(param.name || "-"),
    param.lua_type ? `<code>${escapeHtml(param.lua_type)}</code>` : "-",
    escapeHtml(param.desc || ""),
  ]);

  return renderTable([labels.name, labels.type, labels.description], rows, "sb-ref-table--params");
}

function renderReturnsTable(returns, labels) {
  if (!Array.isArray(returns) || returns.length === 0) {
    return "";
  }

  const rows = returns.map((ret) => [
    ret.lua_type ? `<code>${escapeHtml(ret.lua_type)}</code>` : "-",
    escapeHtml(ret.desc || ""),
  ]);
  return renderTable([labels.type, labels.description], rows, "sb-ref-table--returns");
}

function renderErrorsTable(errors, labels) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "";
  }

  const rows = errors.map((err) => [
    err.lua_type ? `<code>${escapeHtml(err.lua_type)}</code>` : "-",
    escapeHtml(err.desc || ""),
  ]);
  return renderTable([labels.type, labels.description], rows, "sb-ref-table--errors");
}

function getFunctionOperator(functionType) {
  if (functionType === "method") {
    return ":";
  }
  return ".";
}

function buildFunctionSignature(luaClassName, fn, options = {}) {
  const params = Array.isArray(fn.params) ? fn.params : [];
  const returns = Array.isArray(fn.returns) ? fn.returns : [];

  const paramsList = params
    .map((param) =>
      param.lua_type ? `${param.name}: ${param.lua_type}` : param.name
    )
    .filter(Boolean);

  const returnTypes = returns
    .map((ret) => ret.lua_type)
    .filter(Boolean);

  const returnText =
    returnTypes.length === 0
      ? "nil"
      : returnTypes.length === 1
      ? returnTypes[0]
      : `(${returnTypes.join(", ")})`;

  const operator = getFunctionOperator(fn.function_type);
  const prefix = `${luaClassName}${operator}${fn.name}`;
  const signatureStyle = options.signatureStyle || "block";

  if (signatureStyle === "block") {
    if (paramsList.length === 0) {
      return `${prefix}()\n  -> ${returnText}`;
    }
    const indent = options.signatureIndent || "  ";
    const paramsBlock = paramsList.join(`,\n${indent}`);
    return `${prefix}(\n${indent}${paramsBlock}\n) -> ${returnText}`;
  }

  const paramsText = paramsList.join(", ");
  return `${prefix}(${paramsText}) -> ${returnText}`;
}

function getSummaryType(item, kind, className) {
  if (!item) {
    return "";
  }

  if (kind === "property" || kind === "event") {
    return item.lua_type || "";
  }

  if (kind === "type") {
    return item.lua_type || "type";
  }

  if (kind === "constructor") {
    return className || "new";
  }

  const returns = Array.isArray(item.returns) ? item.returns : [];
  if (returns.length === 0) {
    return "void";
  }

  const returnTypes = returns
    .map((ret) => ret.lua_type)
    .filter(Boolean);
  return returnTypes.join(", ");
}

function renderTypeDefinition(typeDef) {
  if (typeDef.lua_type) {
    return `type ${typeDef.name} = ${typeDef.lua_type}`;
  }

  if (Array.isArray(typeDef.fields) && typeDef.fields.length > 0) {
    const fields = typeDef.fields
      .map((field) =>
        field.lua_type
          ? `  ${field.name}: ${field.lua_type}`
          : `  ${field.name}`
      )
      .join("\n");
    return `type ${typeDef.name} = {\n${fields}\n}`;
  }

  return `type ${typeDef.name} = unknown`;
}

function collectTags(item) {
  const tags = [];
  if (!item) {
    return tags;
  }
  if (Array.isArray(item.tags)) {
    tags.push(...item.tags);
  }
  if (item.tag) {
    tags.push(item.tag);
  }
  return tags.map((tag) => String(tag || "").toLowerCase());
}

function isSignalType(luaType) {
  return String(luaType || "").toLowerCase().includes("signal");
}

function splitProperties(properties, options) {
  const props = [];
  const events = [];
  const classifySignals = options.classifySignalsAsEvents !== false;

  properties.forEach((prop) => {
    const tags = collectTags(prop);
    const isEvent = tags.includes("event") || (classifySignals && isSignalType(prop.lua_type));
    if (isEvent) {
      events.push(prop);
    } else {
      props.push(prop);
    }
  });

  return { props, events };
}

function groupFunctions(functions) {
  const groups = {
    constructors: [],
    methods: [],
    functions: [],
    callbacks: [],
    events: [],
  };

  functions.forEach((fn) => {
    const type = String(fn.function_type || "").toLowerCase();
    if (type === "constructor") {
      groups.constructors.push(fn);
    } else if (type === "method") {
      groups.methods.push(fn);
    } else if (type === "callback") {
      groups.callbacks.push(fn);
    } else if (type === "event") {
      groups.events.push(fn);
    } else {
      groups.functions.push(fn);
    }
  });

  return groups;
}

function resolveSourceInfo(item) {
  if (!item) {
    return null;
  }

  const directFile =
    item.file || item.filepath || item.path || item.source_path;
  const directLine =
    item.line || item.lineno || item.line_number || item.lineNumber;
  if (typeof directFile === "string") {
    return {
      file: directFile,
      lineStart: directLine,
      lineEnd: item.end_line || item.endLine || item.lineEnd,
    };
  }

  const source = item.source || item.location || item.defined || item.src;
  if (!source) {
    return null;
  }

  if (typeof source === "string") {
    const match = source.match(/^(.*?):(\d+)(?::(\d+))?$/);
    if (!match) {
      return { file: source };
    }
    return {
      file: match[1],
      lineStart: Number(match[2]),
    };
  }

  if (typeof source === "object") {
    const file =
      source.file || source.path || source.filepath || source.source || source.src;
    const lineStart =
      source.line ||
      source.lineno ||
      source.line_number ||
      source.start ||
      source.start_line ||
      source.startLine;
    const lineEnd =
      source.end ||
      source.end_line ||
      source.endLine ||
      source.stop ||
      source.stop_line;
    if (file) {
      return { file, lineStart, lineEnd };
    }
  }

  return null;
}

function buildSourceUrl(sourceInfo, sourceOptions) {
  if (!sourceInfo || !sourceOptions) {
    return null;
  }

  const file = normalizeSourceFile(sourceInfo.file, sourceOptions);
  if (!file) {
    return null;
  }

  let baseUrl = sourceOptions.baseUrl;
  if (!baseUrl && sourceOptions.repoUrl) {
    const repoUrl = String(sourceOptions.repoUrl).replace(/\/+$/g, "");
    const branch = sourceOptions.branch || "main";
    baseUrl = `${repoUrl}/blob/${branch}`;
  }

  if (!baseUrl) {
    return null;
  }

  const basePath = normalizePathPart(sourceOptions.basePath);
  const parts = [baseUrl.replace(/\/+$/g, ""), basePath, file].filter(Boolean);
  let url = parts.join("/");

  const lineStart = sourceInfo.lineStart || sourceInfo.line;
  const lineEnd = sourceInfo.lineEnd;
  if (lineStart) {
    url += lineEnd && lineEnd !== lineStart ? `#L${lineStart}-L${lineEnd}` : `#L${lineStart}`;
  }

  return url;
}

function renderSourceLink(item, sourceOptions, labels) {
  const sourceInfo = resolveSourceInfo(item);
  const url = buildSourceUrl(sourceInfo, sourceOptions);
  if (!url) {
    return "";
  }
  const label = labels.source;
  return `<a class="sb-ref-source" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderBadge(text, variant) {
  const className = variant ? `sb-ref-badge sb-ref-badge--${variant}` : "sb-ref-badge";
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function renderTagChips(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return "";
  }

  const chips = tags
    .map((tag) => `<span class="sb-ref-tag">${escapeHtml(tag)}</span>`)
    .join("");
  return `<div class="sb-ref-tags">${chips}</div>`;
}

function renderMetaLine(parts) {
  const content = parts.filter(Boolean).join("");
  if (!content) {
    return "";
  }
  return `<div class="sb-ref-item-meta">${content}</div>`;
}

function renderSignature(signature) {
  if (!signature) {
    return "";
  }
  return `<div class="sb-ref-item-signature"><code>${escapeHtml(signature)}</code></div>`;
}

function renderSignatureBlock(signature) {
  if (!signature) {
    return "";
  }
  return [
    '<div class="sb-ref-signature-block">',
    "<pre><code>",
    escapeHtml(signature),
    "</code></pre>",
    "</div>",
  ].join("");
}

function renderSubhead(text) {
  return `<div class="sb-ref-subhead">${escapeHtml(text)}</div>`;
}

function buildAnchors(items, prefix) {
  const counts = new Map();
  return items.map((item) => {
    const base = slugify(item.name || "item");
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    const suffix = count === 0 ? base : `${base}-${count + 1}`;
    return `${prefix}-${suffix}`;
  });
}

function renderSectionSummary(labels, rows) {
  if (!rows.length) {
    return "";
  }
  const table = renderTable(
    [labels.name, labels.type, labels.description],
    rows,
    "sb-ref-table--summary"
  );
  return `<div class="sb-ref-section-summary">${renderSubhead(labels.summary)}${table}</div>`;
}

function renderSummaryBlock(sections, labels) {
  const groups = sections
    .map((section) => renderSummaryGroup(section, labels))
    .filter(Boolean)
    .join("");

  if (!groups) {
    return "";
  }

  return [
    `<a id="summary"></a>`,
    `## ${labels.summary}`,
    "",
    `<div class="sb-ref-summary-groups">${groups}</div>`,
  ].join("\n");
}

function renderPropertyItem(
  luaClassName,
  prop,
  anchorId,
  labels,
  sourceOptions,
  badgeLabel,
  badgeVariant = "property"
) {
  const tags = collectTags(prop);
  const typeSuffix = prop.lua_type ? `: ${prop.lua_type}` : "";
  const signature = `${luaClassName}.${prop.name}${typeSuffix}`;
  const sourceLink = renderSourceLink(prop, sourceOptions, labels);
  const metaLine = renderMetaLine([
    badgeLabel ? renderBadge(badgeLabel, badgeVariant) : "",
    prop.lua_type ? `<span class="sb-ref-meta-type"><code>${escapeHtml(prop.lua_type)}</code></span>` : "",
    sourceLink,
  ]);
  const tagsLine = renderTagChips(tags);

  const lines = [
    `<a id="${anchorId}"></a>`,
    '<div class="sb-ref-member">',
    `### ${prop.name}`,
  ];

  if (metaLine) {
    lines.push("", metaLine);
  }

  if (tagsLine) {
    lines.push("", tagsLine);
  }

  const signatureBlock = renderSignatureBlock(signature);
  if (signatureBlock) {
    lines.push("", signatureBlock);
  }

  if (prop.desc) {
    lines.push("", prop.desc);
  }

  lines.push("</div>");
  return lines.join("\n");
}

function renderParamCards(params, labels) {
  if (!Array.isArray(params) || params.length === 0) {
    return "";
  }

  const items = params
    .map((param) => {
      const name = escapeHtml(param.name || "-");
      const type = param.lua_type ? escapeHtml(param.lua_type) : "";
      const desc = param.desc ? escapeHtml(param.desc) : "";
      const defaultValue =
        param.default ||
        param.default_value ||
        param.defaultValue ||
        param.default_val;

      const metaLine = type
        ? `<div class="sb-ref-param-meta"><span>${labels.type}</span> <code>${type}</code></div>`
        : "";
      const defaultLine = defaultValue !== undefined
        ? `<div class="sb-ref-param-meta"><span>${escapeHtml(
            labels.defaultValue
          )}</span> <code>${escapeHtml(defaultValue)}</code></div>`
        : "";

      return [
        '<div class="sb-ref-param-card">',
        `<div class="sb-ref-param-name"><code>${name}</code>${
          type ? `<span class="sb-ref-param-type">${type}</span>` : ""
        }</div>`,
        desc ? `<div class="sb-ref-param-desc">${desc}</div>` : "",
        metaLine,
        defaultLine,
        "</div>",
      ].filter(Boolean).join("");
    })
    .join("");

  return `<div class="sb-ref-param-list">${items}</div>`;
}

function renderReturnCards(returns, labels) {
  if (!Array.isArray(returns) || returns.length === 0) {
    return "";
  }

  const items = returns
    .map((ret) => {
      const type = ret.lua_type ? escapeHtml(ret.lua_type) : "";
      const desc = ret.desc ? escapeHtml(ret.desc) : "";
      return [
        '<div class="sb-ref-param-card sb-ref-return-card">',
        type
          ? `<div class="sb-ref-param-name"><code>${type}</code></div>`
          : "",
        desc ? `<div class="sb-ref-param-desc">${desc}</div>` : "",
        "</div>",
      ].filter(Boolean).join("");
    })
    .join("");

  return `<div class="sb-ref-param-list">${items}</div>`;
}

function renderErrorCards(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "";
  }

  const items = errors
    .map((err) => {
      const type = err.lua_type ? escapeHtml(err.lua_type) : "";
      const desc = err.desc ? escapeHtml(err.desc) : "";
      return [
        '<div class="sb-ref-param-card sb-ref-error-card">',
        type
          ? `<div class="sb-ref-param-name"><code>${type}</code></div>`
          : "",
        desc ? `<div class="sb-ref-param-desc">${desc}</div>` : "",
        "</div>",
      ].filter(Boolean).join("");
    })
    .join("");

  return `<div class="sb-ref-param-list">${items}</div>`;
}

function renderFunctionItem(
  luaClassName,
  fn,
  anchorId,
  labels,
  sourceOptions,
  badgeLabel,
  badgeVariant = "function",
  signatureOptions = {}
) {
  const tags = collectTags(fn);
  const signature = buildFunctionSignature(luaClassName, fn, signatureOptions);
  const sourceLink = renderSourceLink(fn, sourceOptions, labels);
  const metaLine = renderMetaLine([
    badgeLabel ? renderBadge(badgeLabel, badgeVariant) : "",
    sourceLink,
  ]);
  const tagsLine = renderTagChips(tags);

  const lines = [
    `<a id="${anchorId}"></a>`,
    '<div class="sb-ref-member">',
    `### ${fn.name}`,
  ];

  if (metaLine) {
    lines.push("", metaLine);
  }

  if (tagsLine) {
    lines.push("", tagsLine);
  }

  const signatureBlock = renderSignatureBlock(signature);
  if (signatureBlock) {
    lines.push("", signatureBlock);
  }

  if (fn.desc) {
    lines.push("", fn.desc);
  }

  const paramsList = renderParamCards(fn.params, labels);
  if (paramsList) {
    lines.push("", renderSubhead(labels.parameters), "", paramsList);
  }

  const returnsList = renderReturnCards(fn.returns, labels);
  if (returnsList) {
    lines.push("", renderSubhead(labels.returns), "", returnsList);
  }

  const errorsList = renderErrorCards(fn.errors);
  if (errorsList) {
    lines.push("", renderSubhead(labels.errors), "", errorsList);
  }

  lines.push("</div>");
  return lines.join("\n");
}

function renderTypeItem(typeDef, anchorId, labels, sourceOptions) {
  const sourceLink = renderSourceLink(typeDef, sourceOptions, labels);
  const metaLine = renderMetaLine([
    renderBadge(labels.typeBadge, "type"),
    sourceLink,
  ]);

  const lines = [
    `<a id="${anchorId}"></a>`,
    `### ${typeDef.name}`,
  ];

  if (metaLine) {
    lines.push("", metaLine);
  }

  lines.push("", "```lua");
  lines.push(renderTypeDefinition(typeDef));
  lines.push("```");

  if (typeDef.desc) {
    lines.push("", typeDef.desc);
  }

  return lines.join("\n");
}

function renderSection(sectionId, title, items, renderItem, buildRow, labels, options) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  const anchors = buildAnchors(items, sectionId);
  const rows = items.map((item, index) => buildRow(item, anchors[index]));
  const lines = [`<a id="${sectionId}"></a>`, `## ${title}`];

  if (options.showSectionSummaries !== false) {
    const summary = renderSectionSummary(labels, rows);
    if (summary) {
      lines.push("", summary);
    }
  }

  items.forEach((item, index) => {
    lines.push("", renderItem(item, anchors[index]));
  });

  return lines.join("\n");
}

function renderSummaryCards(stats) {
  if (!stats.length) {
    return "";
  }

  const cards = stats
    .map(
      (stat) =>
        `<a class="sb-ref-summary-card" href="#${stat.anchor}"><div class="sb-ref-summary-label">${escapeHtml(
          stat.label
        )}</div><div class="sb-ref-summary-count">${escapeHtml(
          stat.count
        )}</div></a>`
    )
    .join("");

  return `<div class="sb-ref-summary">${cards}</div>`;
}

function buildClassDoc(luaClass, slug, options) {
  const labels = mergeLabels(options.labels);
  const summaryMode = options.summaryMode || "top";
  const showSectionSummaries =
    options.showSectionSummaries !== undefined
      ? options.showSectionSummaries
      : summaryMode === "section" || summaryMode === "both";
  const showSummaryCards = options.showSummaryCards === true;
  const title = luaClass.name || "Unknown";
  const desc = luaClass.desc || "";
  const types = (luaClass.types || []).filter((item) => !item.ignore);
  const properties = (luaClass.properties || []).filter((item) => !item.ignore);
  const functions = (luaClass.functions || []).filter((item) => !item.ignore);
  const { props, events: eventProps } = splitProperties(properties, options);
  const functionGroups = groupFunctions(functions);
  const events = [...eventProps, ...functionGroups.events];

  const lines = [
    "---",
    `title: ${title}`,
    `sidebar_label: ${title}`,
    `id: ${slug}`,
    "---",
    "",
    "<!-- Generated by @storybakery/docs-preset (moonwave-bridge) -->",
    "",
    '<div class="sb-ref-header">',
    labels.referenceType
      ? `<div class="sb-ref-kicker">${escapeHtml(labels.referenceType)}</div>`
      : "",
    `<div class="sb-ref-title"><span class="sb-ref-title-icon" aria-hidden="true"></span><h1>${escapeHtml(
      title
    )}</h1></div>`,
  ];

  const headerMeta = renderMetaLine([
    renderBadge(labels.classBadge, "class"),
    renderSourceLink(luaClass, options.source, labels),
  ]);
  if (headerMeta) {
    lines.push("", `<div class="sb-ref-hero-meta">${headerMeta}</div>`);
  }

  lines.push("</div>");

  if (desc) {
    lines.push("", desc);
  }

  const summaryStats = [
    { label: labels.properties, count: props.length, anchor: "properties" },
    { label: labels.events, count: events.length, anchor: "events" },
    { label: labels.constructors, count: functionGroups.constructors.length, anchor: "constructors" },
    { label: labels.methods, count: functionGroups.methods.length, anchor: "methods" },
    { label: labels.functions, count: functionGroups.functions.length, anchor: "functions" },
    { label: labels.callbacks, count: functionGroups.callbacks.length, anchor: "callbacks" },
    { label: labels.types, count: types.length, anchor: "types" },
  ].filter((item) => item.count > 0);

  if (showSummaryCards) {
    const summary = renderSummaryCards(summaryStats);
    if (summary) {
      lines.push("", summary);
    }
  }

  if (summaryMode === "top" || summaryMode === "both") {
    const summaryBlock = renderSummaryBlock(
      [
        {
          title: labels.properties,
          items: props,
          kind: "property",
          className: title,
          anchorPrefix: "properties",
        },
        {
          title: labels.events,
          items: events,
          kind: "event",
          className: title,
          anchorPrefix: "events",
        },
        {
          title: labels.constructors,
          items: functionGroups.constructors,
          kind: "constructor",
          className: title,
          anchorPrefix: "constructors",
        },
        {
          title: labels.methods,
          items: functionGroups.methods,
          kind: "method",
          className: title,
          anchorPrefix: "methods",
        },
        {
          title: labels.functions,
          items: functionGroups.functions,
          kind: "function",
          className: title,
          anchorPrefix: "functions",
        },
        {
          title: labels.callbacks,
          items: functionGroups.callbacks,
          kind: "callback",
          className: title,
          anchorPrefix: "callbacks",
        },
        {
          title: labels.types,
          items: types,
          kind: "type",
          className: title,
          anchorPrefix: "types",
        },
      ],
      labels
    );
    if (summaryBlock) {
      lines.push("", summaryBlock);
    }
  }

  const typeSection = renderSection(
    "types",
    labels.types,
    types,
    (typeDef, anchorId) => renderTypeItem(typeDef, anchorId, labels, options.source),
    (typeDef, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(typeDef.name)}</a>`,
      `<code>${escapeHtml(typeDef.lua_type || "type")}</code>`,
      escapeHtml(typeDef.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const propsSection = renderSection(
    "properties",
    labels.properties,
    props,
    (prop, anchorId) =>
      renderPropertyItem(title, prop, anchorId, labels, options.source, labels.propertyBadge, "property"),
    (prop, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(prop.name)}</a>`,
      prop.lua_type ? `<code>${escapeHtml(prop.lua_type)}</code>` : "-",
      escapeHtml(prop.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const eventsSection = renderSection(
    "events",
    labels.events,
    events,
    (eventItem, anchorId) => {
      if (eventItem.function_type) {
        return renderFunctionItem(
          title,
          eventItem,
          anchorId,
          labels,
          options.source,
          labels.eventBadge,
          "event",
          options
        );
      }
      return renderPropertyItem(title, eventItem, anchorId, labels, options.source, labels.eventBadge, "event");
    },
    (eventItem, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(eventItem.name)}</a>`,
      eventItem.lua_type ? `<code>${escapeHtml(eventItem.lua_type)}</code>` : escapeHtml(labels.eventBadge),
      escapeHtml(eventItem.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const constructorsSection = renderSection(
    "constructors",
    labels.constructors,
    functionGroups.constructors,
    (fn, anchorId) =>
      renderFunctionItem(title, fn, anchorId, labels, options.source, labels.constructorBadge, "function", options),
    (fn, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(fn.name)}</a>`,
      "<code>constructor</code>",
      escapeHtml(fn.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const methodsSection = renderSection(
    "methods",
    labels.methods,
    functionGroups.methods,
    (fn, anchorId) =>
      renderFunctionItem(title, fn, anchorId, labels, options.source, labels.methodBadge, "function", options),
    (fn, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(fn.name)}</a>`,
      "<code>method</code>",
      escapeHtml(fn.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const functionsSection = renderSection(
    "functions",
    labels.functions,
    functionGroups.functions,
    (fn, anchorId) =>
      renderFunctionItem(title, fn, anchorId, labels, options.source, labels.functionBadge, "function", options),
    (fn, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(fn.name)}</a>`,
      "<code>function</code>",
      escapeHtml(fn.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  const callbacksSection = renderSection(
    "callbacks",
    labels.callbacks,
    functionGroups.callbacks,
    (fn, anchorId) =>
      renderFunctionItem(title, fn, anchorId, labels, options.source, labels.callbackBadge, "function", options),
    (fn, anchorId) => [
      `<a href="#${anchorId}">${escapeHtml(fn.name)}</a>`,
      "<code>callback</code>",
      escapeHtml(fn.desc || ""),
    ],
    labels,
    { ...options, showSectionSummaries }
  );

  [
    propsSection,
    eventsSection,
    constructorsSection,
    methodsSection,
    functionsSection,
    callbacksSection,
    typeSection,
  ].forEach((section) => {
    if (section) {
      lines.push("", section);
    }
  });

  return lines.join("\n");
}

function buildIndexDoc(items, slugMap, labels) {
  const lines = [
    "---",
    `title: ${labels.referenceTitle}`,
    `sidebar_label: ${labels.referenceTitle}`,
    "---",
    "",
    "<!-- Generated by @storybakery/docs-preset (moonwave-bridge) -->",
    "",
    `# ${labels.referenceTitle}`,
    "",
    labels.referenceDescription,
  ];

  if (items.length > 0) {
    lines.push("", "## Classes", "");
    items.forEach((item) => {
      const slug = slugMap.get(item.name);
      if (!slug) {
        return;
      }
      lines.push(`- [${item.name}](./${slug})`);
    });
  }

  return lines.join("\n");
}

function convertMoonwaveJson(rawJson, options) {
  const outputDir = options.outputDir;
  const clean = options.clean !== false;

  if (clean && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  ensureDir(outputDir);

  const content = normalizeContent(rawJson)
    .filter((item) => item && !item.ignore)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const slugCounts = new Map();
  const slugMap = new Map();

  content.forEach((item) => {
    const baseSlug = slugify(item.name || "unknown");
    const count = slugCounts.get(baseSlug) || 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
    slugMap.set(item.name, slug);
  });

  content.forEach((luaClass) => {
    const slug = slugMap.get(luaClass.name) || slugify(luaClass.name);
    const filePath = path.join(outputDir, `${slug}.mdx`);
    writeFile(filePath, buildClassDoc(luaClass, slug, options));
  });

  const labels = mergeLabels(options.labels);
  const indexPath = path.join(outputDir, "index.mdx");
  writeFile(indexPath, buildIndexDoc(content, slugMap, labels));
}

module.exports = {
  convertMoonwaveJson,
};
