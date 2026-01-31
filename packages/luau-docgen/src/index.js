const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SUPPORTED_EXTS = new Set([".luau", ".lua"]);
const DEFAULT_SCHEMA_VERSION = 1;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }

      results.push(...collectFiles(entryPath));
      continue;
    }

    const ext = path.extname(entry.name);
    if (SUPPORTED_EXTS.has(ext)) {
      results.push(entryPath);
    }
  }

  return results;
}

function sha1(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function dedentLines(lines) {
  let minIndent = null;

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(/^[ \t]*/);
    if (!match) {
      continue;
    }

    const indent = match[0].length;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
    }
  }

  if (!minIndent) {
    return lines.slice();
  }

  return lines.map((line) => line.slice(minIndent));
}

function extractDocBlocks(lines) {
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("---")) {
      const contentLines = [];
      let start = index;

      while (index < lines.length && lines[index].trim().startsWith("---")) {
        const raw = lines[index].replace(/^\s*---\s?/, "");
        contentLines.push(raw);
        index += 1;
      }

      const end = index - 1;
      blocks.push({
        startLine: start + 1,
        endLine: end + 1,
        contentLines,
      });
      continue;
    }

    if (trimmed.startsWith("--[=[")) {
      const contentLines = [];
      const start = index;
      let foundEnd = false;
      let current = line;
      const startOffset = current.indexOf("--[=[") + 5;
      const afterStart = current.slice(startOffset);
      if (afterStart.length > 0) {
        contentLines.push(afterStart);
      }
      index += 1;

      while (index < lines.length) {
        const currentLine = lines[index];
        const endIndex = currentLine.indexOf("]=]");

        if (endIndex !== -1) {
          const beforeEnd = currentLine.slice(0, endIndex);
          if (beforeEnd.length > 0) {
            contentLines.push(beforeEnd);
          }
          foundEnd = true;
          break;
        }

        contentLines.push(currentLine);
        index += 1;
      }

      const end = foundEnd ? index : lines.length - 1;
      blocks.push({
        startLine: start + 1,
        endLine: end + 1,
        contentLines,
      });

      index = foundEnd ? index + 1 : lines.length;
      continue;
    }

    index += 1;
  }

  return blocks;
}

function parseParamList(paramText) {
  const trimmed = paramText.trim();
  if (!trimmed) {
    return [];
  }

  const parts = trimmed.split(",");
  const params = [];

  for (const part of parts) {
    const token = part.trim();
    if (!token) {
      continue;
    }

    if (token === "...") {
      params.push({ name: "...", type: null });
      continue;
    }

    const nameMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    const name = nameMatch ? nameMatch[1] : token;
    let type = null;

    const typeIndex = token.indexOf(":");
    if (typeIndex !== -1) {
      type = token.slice(typeIndex + 1).trim();
      const assignIndex = type.indexOf("=");
      if (assignIndex !== -1) {
        type = type.slice(0, assignIndex).trim();
      }
      if (type.length === 0) {
        type = null;
      }
    }

    params.push({ name, type });
  }

  return params;
}

function parseFunctionBinding(line) {
  const trimmed = line.trim();
  const declMatch = trimmed.match(
    /^function\s+([A-Za-z0-9_\.:]+)(<[^>]+>)?\s*\(([^)]*)\)\s*(?::\s*(.+))?$/
  );

  if (declMatch) {
    const nameRaw = declMatch[1];
    const paramsRaw = declMatch[3] || "";
    const returnType = declMatch[4] ? declMatch[4].trim() : null;
    return buildFunctionInfo(nameRaw, paramsRaw, returnType);
  }

  const assignMatch = trimmed.match(
    /^([A-Za-z0-9_\.]+)\s*=\s*function(?:<[^>]+>)?\s*\(([^)]*)\)\s*(?::\s*(.+))?$/
  );

  if (assignMatch) {
    const nameRaw = assignMatch[1];
    const paramsRaw = assignMatch[2] || "";
    const returnType = assignMatch[3] ? assignMatch[3].trim() : null;
    return buildFunctionInfo(nameRaw, paramsRaw, returnType);
  }

  return null;
}

function buildFunctionInfo(nameRaw, paramsRaw, returnType) {
  const params = parseParamList(paramsRaw);
  let within = null;
  let name = nameRaw;
  let isMethod = false;

  const colonIndex = nameRaw.lastIndexOf(":");
  const dotIndex = nameRaw.lastIndexOf(".");

  if (colonIndex !== -1 && colonIndex > dotIndex) {
    within = nameRaw.slice(0, colonIndex);
    name = nameRaw.slice(colonIndex + 1);
    isMethod = true;
  } else if (dotIndex !== -1) {
    within = nameRaw.slice(0, dotIndex);
    name = nameRaw.slice(dotIndex + 1);
  }

  if (!isMethod && within && params.length > 0) {
    if (params[0].name === "self") {
      isMethod = true;
    }
  }

  return {
    kind: "function",
    name,
    within,
    isMethod,
    params,
    returnType,
  };
}

function parseBindingAt(lines, index) {
  const line = lines[index];
  const cleanLine = line.split("--")[0];
  const functionInfo = parseFunctionBinding(cleanLine);
  if (functionInfo) {
    return functionInfo;
  }

  const typeMatch = cleanLine.match(/^\s*(export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/);
  if (typeMatch) {
    const result = extractTypeTableFields(lines, index);
    return {
      kind: "type",
      name: typeMatch[2],
      within: null,
      typeFields: result.fields,
      typeTableRange: { startLine: index + 1, endLine: result.endIndex + 1 },
    };
  }

  const assignMatch = cleanLine.match(/^([A-Za-z0-9_\.]+)\s*=/);
  if (assignMatch) {
    const nameRaw = assignMatch[1];
    const dotIndex = nameRaw.lastIndexOf(".");
    if (dotIndex !== -1) {
      return {
        kind: "property",
        name: nameRaw.slice(dotIndex + 1),
        within: nameRaw.slice(0, dotIndex),
      };
    }
  }

  const classMatch = cleanLine.match(/^local\s+([A-Za-z0-9_]+)\s*=\s*\{/);
  if (classMatch) {
    return {
      kind: "class",
      name: classMatch[1],
      within: null,
    };
  }

  return null;
}

function parseTagLine(tagLine) {
  const match = tagLine.match(/^@([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    value: match[2] ? match[2].trim() : "",
  };
}

function splitTagValue(value) {
  const parts = value.split(/\s+/);
  const name = parts.shift() || "";
  const rest = parts.join(" ").trim();
  return { name, rest };
}

function parseTypeAndDescription(value) {
  const parts = value.split("--");
  const typePart = parts[0] ? parts[0].trim() : "";
  const description = parts.length > 1 ? parts.slice(1).join("--").trim() : "";
  return { typePart, description };
}

function parseMemberName(value) {
  const trimmed = value ? value.trim() : "";
  if (!trimmed) {
    return { within: null, name: "", isMethod: false };
  }

  if (trimmed.startsWith("~:")) {
    return { within: "~", name: trimmed.slice(2), isMethod: true };
  }

  if (trimmed.startsWith("~.")) {
    return { within: "~", name: trimmed.slice(2), isMethod: false };
  }

  const colonIndex = trimmed.lastIndexOf(":");
  const dotIndex = trimmed.lastIndexOf(".");

  if (colonIndex !== -1 && colonIndex > dotIndex) {
    return {
      within: trimmed.slice(0, colonIndex),
      name: trimmed.slice(colonIndex + 1),
      isMethod: true,
    };
  }

  if (dotIndex !== -1) {
    return {
      within: trimmed.slice(0, dotIndex),
      name: trimmed.slice(dotIndex + 1),
      isMethod: false,
    };
  }

  return { within: null, name: trimmed, isMethod: false };
}

function countChar(value, char) {
  let count = 0;
  for (const current of value) {
    if (current === char) {
      count += 1;
    }
  }
  return count;
}

function joinInlineDescription(lines) {
  if (!lines || lines.length === 0) {
    return "";
  }
  const trimmed = lines.slice();
  while (trimmed.length > 0 && trimmed[0].trim().length === 0) {
    trimmed.shift();
  }
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim().length === 0) {
    trimmed.pop();
  }
  return trimmed.join("\n").trimEnd();
}

function extractTypeTableFields(lines, startIndex) {
  const fields = [];
  let depth = 0;
  let started = false;
  let index = startIndex;
  let endIndex = startIndex;
  let pendingDoc = null;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!started) {
      const braceIndex = line.indexOf("{");
      if (braceIndex !== -1) {
        started = true;
        depth = 1;
      }
    } else {
      depth += countChar(line, "{");
      depth -= countChar(line, "}");
    }

    if (!started) {
      continue;
    }

    if (trimmed.startsWith("---")) {
      const contentLines = [];
      let cursor = index;
      while (cursor < lines.length && lines[cursor].trim().startsWith("---")) {
        contentLines.push(lines[cursor].replace(/^\s*---\s?/, ""));
        cursor += 1;
      }
      pendingDoc = contentLines;
      index = cursor - 1;
      continue;
    }

    if (trimmed.startsWith("--[=[")) {
      const contentLines = [];
      let cursor = index;
      const startOffset = lines[cursor].indexOf("--[=[") + 5;
      const afterStart = lines[cursor].slice(startOffset);
      if (afterStart.length > 0) {
        contentLines.push(afterStart);
      }
      cursor += 1;
      while (cursor < lines.length) {
        const current = lines[cursor];
        const endIndex = current.indexOf("]=]");
        if (endIndex !== -1) {
          const beforeEnd = current.slice(0, endIndex);
          if (beforeEnd.length > 0) {
            contentLines.push(beforeEnd);
          }
          break;
        }
        contentLines.push(current);
        cursor += 1;
      }
      pendingDoc = contentLines;
      index = cursor;
      continue;
    }

    const fieldMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (fieldMatch) {
      const name = fieldMatch[1];
      let typeText = fieldMatch[2] || "";
      let continueIndex = index;

      while (typeText.trim().length > 0 && !typeText.trim().endsWith(",") && !typeText.includes("}") && continueIndex + 1 < lines.length) {
        if (lines[continueIndex].includes("}") || lines[continueIndex].includes(",")) {
          break;
        }
        continueIndex += 1;
        typeText += "\n" + lines[continueIndex].trim();
        if (lines[continueIndex].includes("}") || lines[continueIndex].includes(",")) {
          break;
        }
      }

      typeText = typeText.replace(/[,}].*$/, "").trim();
      const description = joinInlineDescription(pendingDoc);
      pendingDoc = null;

      fields.push({
        name,
        type: typeText || null,
        description: description || null,
        line: index + 1,
      });
    }

    if (depth <= 0) {
      endIndex = index;
      break;
    }
  }

  return { fields, endIndex };
}

function findTypeTableRanges(lines) {
  const ranges = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(export\s+)?type\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/.test(line)) {
      const result = extractTypeTableFields(lines, i);
      ranges.push({ startLine: i + 1, endLine: result.endIndex + 1 });
      i = result.endIndex;
    }
  }
  return ranges;
}

function parseDocBlock(contentLines) {
  const lines = dedentLines(contentLines);
  const descriptionLines = [];
  const fields = [];
  const params = [];
  const returns = [];
  const errors = [];
  const tags = [];
  const realms = [];
  const externals = [];

  const typeTags = [];
  const state = {
    within: null,
    yields: false,
    readonly: false,
    visibility: null,
    since: null,
    unreleased: false,
    deprecated: null,
    indexName: null,
    inheritDoc: null,
    includes: [],
    snippets: [],
    aliases: [],
    event: false,
    extends: [],
    categories: [],
  };

  let inFence = false;
  let continuation = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
    }

    const indentMatch = line.match(/^[ \t]+/);
    const indent = indentMatch ? indentMatch[0] : "";
    const afterIndent = line.slice(indent.length);
    const isContinuation =
      continuation &&
      (indent.includes("\t") || indent.length >= 2) &&
      afterIndent.trim().length >= 0 &&
      !(afterIndent.trim().startsWith("@") || afterIndent.trim().startsWith("."));

    if (isContinuation && !inFence) {
      continuation.description.push(afterIndent.trimEnd());
      continue;
    }

    continuation = null;

    if (!inFence && trimmed.startsWith("@")) {
      const tag = parseTagLine(trimmed);
      if (!tag) {
        continue;
      }

      switch (tag.name) {
        case "class":
          typeTags.push({ kind: "class", name: tag.value });
          break;
        case "prop": {
          const { name: rawName, rest } = splitTagValue(tag.value);
          const parsed = parseMemberName(rawName);
          if (parsed.within && !state.within) {
            state.within = parsed.within;
          }
          typeTags.push({ kind: "property", name: parsed.name, type: rest || null });
          break;
        }
        case "type": {
          const { name, rest } = splitTagValue(tag.value);
          typeTags.push({ kind: "type", name, type: rest || null });
          break;
        }
        case "interface":
          typeTags.push({ kind: "interface", name: tag.value });
          break;
        case "function": {
          const parsed = parseMemberName(tag.value);
          if (parsed.within && !state.within) {
            state.within = parsed.within;
          }
          typeTags.push({ kind: "function", name: parsed.name, isMethod: parsed.isMethod });
          break;
        }
        case "method": {
          const parsed = parseMemberName(tag.value);
          if (parsed.within && !state.within) {
            state.within = parsed.within;
          }
          typeTags.push({ kind: "function", name: parsed.name, isMethod: true });
          break;
        }
        case "constructor": {
          const parsed = parseMemberName(tag.value);
          if (parsed.within && !state.within) {
            state.within = parsed.within;
          }
          typeTags.push({ kind: "constructor", name: parsed.name, isMethod: false });
          break;
        }
        case "within":
          state.within = tag.value;
          break;
        case "field": {
          const { name, rest } = splitTagValue(tag.value);
          const { typePart, description } = parseTypeAndDescription(rest);
          fields.push({ name, type: typePart || null, description: description || null });
          break;
        }
        case "param": {
          const { name, rest } = splitTagValue(tag.value);
          const { typePart, description } = parseTypeAndDescription(rest);
          const param = {
            name,
            type: typePart || null,
            description: description ? [description] : [],
          };
          params.push(param);
          continuation = { description: param.description };
          break;
        }
        case "return": {
          const { typePart, description } = parseTypeAndDescription(tag.value);
          const ret = {
            type: typePart || null,
            description: description ? [description] : [],
          };
          returns.push(ret);
          continuation = { description: ret.description };
          break;
        }
        case "error": {
          const { typePart, description } = parseTypeAndDescription(tag.value);
          const err = {
            type: typePart || null,
            description: description ? [description] : [],
          };
          errors.push(err);
          continuation = { description: err.description };
          break;
        }
        case "yields":
          state.yields = true;
          break;
        case "tag":
          if (tag.value) {
            tags.push(tag.value);
          }
          break;
        case "category":
          if (tag.value) {
            state.categories.push(tag.value);
          }
          break;
        case "event":
          state.event = true;
          break;
        case "extends":
          if (tag.value) {
            state.extends.push(tag.value);
          }
          break;        case "unreleased":
          state.unreleased = true;
          break;
        case "since":
          state.since = tag.value || null;
          break;
        case "deprecated": {
          const { typePart, description } = parseTypeAndDescription(tag.value);
          state.deprecated = {
            version: typePart || null,
            description: description || null,
          };
          break;
        }
        case "server":
        case "client":
        case "plugin":
          realms.push(tag.name);
          break;
        case "private":
          state.visibility = "private";
          break;
        case "ignore":
          state.visibility = "ignored";
          break;
        case "readonly":
          state.readonly = true;
          break;
        case "__index":
          state.indexName = tag.value || null;
          break;
        case "external": {
          const { name, rest } = splitTagValue(tag.value);
          if (name && rest) {
            externals.push({ name, url: rest });
          }
          break;
        }
        case "inheritDoc":
          state.inheritDoc = tag.value || null;
          break;
        case "include":
          if (tag.value) {
            state.includes.push(tag.value);
          }
          break;
        case "snippet":
          if (tag.value) {
            state.snippets.push(tag.value);
          }
          break;
        case "alias":
          if (tag.value) {
            state.aliases.push(tag.value);
          }
          break;
        default:
          break;
      }

      continue;
    }

    if (!inFence && trimmed.startsWith(".")) {
      const fieldLine = trimmed.slice(1).trim();
      const { name, rest } = splitTagValue(fieldLine);
      const { typePart, description } = parseTypeAndDescription(rest);
      fields.push({ name, type: typePart || null, description: description || null });
      continue;
    }

    descriptionLines.push(line.trimEnd());
  }

  return {
    descriptionLines,
    typeTags,
    fields,
    params,
    returns,
    errors,
    tags,
    realms,
    externals,
    state,
  };
}

function joinDescription(lines) {
  const trimmedLines = lines.slice();
  while (trimmedLines.length > 0 && trimmedLines[0].trim().length === 0) {
    trimmedLines.shift();
  }

  const text = trimmedLines.join("\n").trimEnd();
  if (!text) {
    return { summary: "", descriptionMarkdown: "" };
  }

  const summaryLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return {
    summary: summaryLine || "",
    descriptionMarkdown: text,
  };
}

function buildQualifiedName(within, name, isMethod) {
  if (!within) {
    return name;
  }

  return isMethod ? `${within}:${name}` : `${within}.${name}`;
}

function buildLocation(relativePath, lineNumber, lineContent) {
  const column = lineContent ? lineContent.search(/\S/) + 1 : 1;
  return {
    file: normalizePath(relativePath),
    line: lineNumber,
    column: column > 0 ? column : 1,
  };
}

function buildFunctionTypes(doc, binding) {
  const structured = {
    params: [],
    returns: [],
    errors: [],
    yields: doc.state.yields,
  };

  const bindingParams = binding ? binding.params : [];
  const docParams = doc.params;

  if (docParams.length > 0) {
    for (const param of docParams) {
      const matched = bindingParams.find((item) => item.name === param.name);
      structured.params.push({
        name: param.name,
        type: param.type || (matched ? matched.type : null),
        description: param.description.join("\n").trim() || null,
      });
    }
  } else {
    for (const param of bindingParams) {
      structured.params.push({
        name: param.name,
        type: param.type,
        description: null,
      });
    }
  }

  if (doc.returns.length > 0) {
    for (const ret of doc.returns) {
      structured.returns.push({
        type: ret.type || null,
        description: ret.description.join("\n").trim() || null,
      });
    }
  } else if (binding && binding.returnType) {
    structured.returns.push({ type: binding.returnType, description: null });
  }

  for (const err of doc.errors) {
    structured.errors.push({
      type: err.type || null,
      description: err.description.join("\n").trim() || null,
    });
  }

  const displayParams = structured.params
    .map((param) => (param.type ? `${param.name}: ${param.type}` : param.name))
    .join(", ");
  const displayReturns = structured.returns
    .map((ret) => ret.type || "any")
    .join(", ");

  const display = displayReturns
    ? `(${displayParams}) -> ${displayReturns}`
    : `(${displayParams})`;

  return { display, structured };
}

function buildPropertyTypes(doc, fallbackType) {
  const type = doc.typeTags.find((tag) => tag.kind === "property");
  const resolvedType = type && type.type ? type.type : fallbackType || null;
  return {
    display: resolvedType || "",
    structured: {
      type: resolvedType,
      readonly: doc.state.readonly,
    },
  };
}

function buildInterfaceTypes(doc) {
  const fields = doc.fields.map((field) => ({
    name: field.name,
    type: field.type,
    description: field.description,
  }));
  return {
    display: "",
    structured: { fields },
  };
}

function buildTypeTypes(doc) {
  const typeTag = doc.typeTags.find((tag) => tag.kind === "type");
  const typeValue = typeTag ? typeTag.type : null;
  return {
    display: typeValue || "",
    structured: { type: typeValue },
  };
}

function buildClassTypes(doc) {
  return {
    display: "",
    structured: { indexName: doc.state.indexName },
  };
}

function buildDocs(doc) {
  const { summary, descriptionMarkdown } = joinDescription(doc.descriptionLines);
  const tags = [];

  for (const label of doc.tags) {
    tags.push({ name: "tag", value: label });
  }

  for (const category of doc.state.categories) {
    tags.push({ name: "category", value: category });
  }


  if (doc.state.since) {
    tags.push({ name: "since", value: doc.state.since });
  }

  if (doc.state.deprecated) {
    tags.push({
      name: "deprecated",
      value: doc.state.deprecated.version,
      description: doc.state.deprecated.description || null,
    });
  }

  if (doc.state.unreleased) {
    tags.push({ name: "unreleased", value: true });
  }

  if (doc.state.event) {
    tags.push({ name: "event", value: true });
  }

  for (const value of doc.state.extends) {
    tags.push({ name: "extends", value });
  }

  for (const realm of doc.realms) {
    tags.push({ name: realm, value: true });
  }

  for (const external of doc.externals) {
    tags.push({ name: "external", value: `${external.name} ${external.url}` });
  }

  for (const alias of doc.state.aliases) {
    tags.push({ name: "alias", value: alias });
  }

  for (const include of doc.state.includes) {
    tags.push({ name: "include", value: include });
  }

  for (const snippet of doc.state.snippets) {
    tags.push({ name: "snippet", value: snippet });
  }

  if (doc.state.inheritDoc) {
    tags.push({ name: "inheritDoc", value: doc.state.inheritDoc });
  }

  return {
    summary,
    descriptionMarkdown,
    tags,
    examples: [],
  };
}

function resolveTypeTag(doc) {
  if (doc.typeTags.length === 0) {
    return null;
  }

  return doc.typeTags[0];
}

function findNextBindingLine(lines, startIndex, blockByStart) {
  let index = startIndex;

  while (index < lines.length) {
    if (blockByStart.has(index)) {
      const block = blockByStart.get(index);
      index = block.endLine;
      continue;
    }

    const line = lines[index];
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("--")) {
      index += 1;
      continue;
    }

    return { line, lineNumber: index + 1 };
  }

  return null;
}

function buildSymbolsForBlock(doc, block, binding, filePath, relativePath, diagnostics, classNames) {
  const symbols = [];
  const typeTag = resolveTypeTag(doc);
  let kind = null;
  let name = null;
  let within = doc.state.within || null;
  let isMethod = false;

  if (typeTag) {
    kind = typeTag.kind;
    name = typeTag.name || null;
    if (kind === "property") {
      kind = "property";
    }
    if (typeTag.kind === "function") {
      kind = "function";
      isMethod = Boolean(typeTag.isMethod);
    }
    if (typeTag.kind === "constructor") {
      kind = "constructor";
      isMethod = false;
    }
    if (!name && binding) {
      name = binding.name || null;
      within = within || binding.within || null;
      if (binding.isMethod !== undefined) {
        isMethod = Boolean(binding.isMethod) || isMethod;
      }
    }
  } else if (binding) {
    kind = binding.kind;
    name = binding.name || null;
    within = within || binding.within || null;
    isMethod = Boolean(binding.isMethod);
  }

  const inferredKind = kind || (binding ? binding.kind : null);
  const needsWithin = inferredKind === "function" || inferredKind === "property" || inferredKind === "constructor";

  if (!within && binding && binding.within) {
    within = binding.within;
  }

  if (!within && needsWithin && classNames && classNames.length === 1) {
    within = classNames[0];
  }

  if (kind === "function" && name === "new" && within && !isMethod) {
    kind = "constructor";
  }

  if (!within && needsWithin && classNames) {
    diagnostics.push({
      level: classNames.length === 0 ? "error" : "warning",
      file: relativePath,
      line: block.startLine,
      message: classNames.length === 0
        ? "@class missing for this file."
        : "@within missing for ambiguous class ownership.",
    });
  }

  if (!kind || !name) {
    return symbols;
  }

  if (doc.state.readonly && kind !== "property") {
    diagnostics.push({
      level: "warning",
      file: relativePath,
      line: block.startLine,
      message: "@readonly used on non-property symbol.",
    });
  }

  const locationLine = binding ? binding.lineNumber : block.startLine;
  const locationLineContent = binding ? binding.line : linesAt(filePath, locationLine);
  const location = buildLocation(relativePath, locationLine, locationLineContent);

  const docs = buildDocs(doc);
  const visibility = doc.state.visibility || "public";
  const qualifiedName = buildQualifiedName(within, name, isMethod);

  let types = { display: "", structured: null };

  if (kind === "function" || kind === "constructor") {
    types = buildFunctionTypes(doc, binding);
  } else if (kind === "property") {
    types = buildPropertyTypes(doc, typeTag ? typeTag.type : null);
  } else if (kind === "interface") {
    types = buildInterfaceTypes(doc);
  } else if (kind === "type") {
    types = buildTypeTypes(doc);
  } else if (kind === "class") {
    types = buildClassTypes(doc);
  }

  symbols.push({
    kind,
    name,
    qualifiedName,
    location,
    docs,
    types,
    visibility,
  });

  if (kind === "type" && binding && binding.typeFields) {
    for (const field of binding.typeFields) {
      if (!field.name) {
        continue;
      }

      const fieldLocation = field.line
        ? buildLocation(relativePath, field.line, linesAt(filePath, field.line))
        : location;
      const fieldQualified = `${name}.${field.name}`;

      symbols.push({
        kind: "field",
        name: field.name,
        qualifiedName: fieldQualified,
        location: fieldLocation,
        docs: {
          summary: field.description || "",
          descriptionMarkdown: field.description || "",
          tags: [],
          examples: [],
        },
        types: {
          display: field.type || "",
          structured: { type: field.type || null },
        },
        visibility,
      });
    }
  }

  if (kind === "interface") {
    for (const field of doc.fields) {
      if (!field.name) {
        continue;
      }

      const fieldName = field.name;
      const fieldQualified = `${name}.${fieldName}`;
      symbols.push({
        kind: "field",
        name: fieldName,
        qualifiedName: fieldQualified,
        location,
        docs: {
          summary: field.description || "",
          descriptionMarkdown: field.description || "",
          tags: [],
          examples: [],
        },
        types: {
          display: field.type || "",
          structured: { type: field.type || null },
        },
        visibility,
      });
    }
  }

  return symbols;
}

function linesAt(filePath, lineNumber) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    return lines[lineNumber - 1] || "";
  } catch (error) {
    return "";
  }
}

function applyInheritDocs(symbols) {
  const map = new Map();
  for (const symbol of symbols) {
    map.set(symbol.qualifiedName, symbol);
  }

  for (const symbol of symbols) {
    const inheritTag = symbol.docs.tags.find((tag) => tag.name === "inheritDoc");
    if (!inheritTag || !inheritTag.value) {
      continue;
    }

    const target = map.get(inheritTag.value);
    if (!target) {
      continue;
    }

    if (!symbol.docs.descriptionMarkdown && target.docs.descriptionMarkdown) {
      symbol.docs.descriptionMarkdown = target.docs.descriptionMarkdown;
      symbol.docs.summary = target.docs.summary;
    }

    if (!symbol.docs.tags.length && target.docs.tags.length) {
      symbol.docs.tags = target.docs.tags.slice();
    }

    if (!symbol.types.structured && target.types.structured) {
      symbol.types.structured = target.types.structured;
      symbol.types.display = target.types.display;
    }
  }
}

function generateModule(filePath, rootDir, srcDir, typesDir, moduleIdOverrides, diagnostics) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const blocks = extractDocBlocks(lines);

  const blockByStart = new Map();
  for (const block of blocks) {
    blockByStart.set(block.startLine - 1, block);
  }

  const moduleSymbols = [];
  const classNames = [];
  const typeTableRanges = findTypeTableRanges(lines);
  let currentClassName = null;



  for (const block of blocks) {
    const isInsideTypeTable = typeTableRanges.some((range) => block.startLine >= range.startLine && block.startLine <= range.endLine);
    if (isInsideTypeTable) {
      continue;
    }

    const doc = parseDocBlock(block.contentLines);
    for (const tag of doc.typeTags) {
      if (tag.kind === "class" && tag.name) {
        if (!classNames.includes(tag.name)) {
          classNames.push(tag.name);
        }
        currentClassName = tag.name;
      }
    }

    if (doc.state.within === "~" && currentClassName) {
      doc.state.within = currentClassName;
    }

    const typeTag = resolveTypeTag(doc);
    let binding = null;

    if (!typeTag || typeTag.kind === "function") {
      const next = findNextBindingLine(lines, block.endLine, blockByStart);
      if (next) {
        binding = parseBindingAt(lines, next.lineNumber - 1);
        if (binding) {
          binding.line = next.line;
          binding.lineNumber = next.lineNumber;
        }
      }
    }

    const relativePath = normalizePath(path.relative(rootDir, filePath));
    const symbols = buildSymbolsForBlock(doc, block, binding, filePath, relativePath, diagnostics, classNames);
    moduleSymbols.push(...symbols);

    if (binding && (binding.kind === "function" || binding.kind === "constructor")) {
      const docParamNames = doc.params.map((param) => param.name);
      const bindingParamNames = binding.params.map((param) => param.name);
      const hasExplicitParamType = doc.params.some((param) => {
        if (!param.type) {
          return false;
        }
        const normalized = param.type.trim();
        return normalized.length > 0 && normalized !== "any";
      });

      if (hasExplicitParamType && docParamNames.length > 0) {
        const missing = bindingParamNames.filter((name) => !docParamNames.includes(name));
        const extra = docParamNames.filter((name) => !bindingParamNames.includes(name));

        if (missing.length > 0 || extra.length > 0) {
          diagnostics.push({
            level: "warning",
            file: normalizePath(path.relative(rootDir, filePath)),
            line: block.startLine,
            message: "@param does not match function parameters.",
          });
        }
      }
    }

    if (doc.returns.length > 0 && binding && binding.returnType) {
      if (doc.returns.length === 0) {
        diagnostics.push({
          level: "warning",
          file: normalizePath(path.relative(rootDir, filePath)),
          line: block.startLine,
          message: "@return must describe all return values when used.",
        });
      }
    }
  }

  applyInheritDocs(moduleSymbols);

  const rootRelativePath = normalizePath(path.relative(rootDir, filePath));
  const idOverride = moduleIdOverrides && moduleIdOverrides[rootRelativePath];
  let baseDir = rootDir;
  if (srcDir && normalizePath(filePath).startsWith(normalizePath(srcDir))) {
    baseDir = srcDir;
  } else if (typesDir && normalizePath(filePath).startsWith(normalizePath(typesDir))) {
    baseDir = typesDir;
  }

  const baseRelativePath = normalizePath(path.relative(baseDir, filePath));
  const moduleId = idOverride || baseRelativePath.replace(/\.[^/.]+$/, "");

  return {
    id: moduleId,
    path: rootRelativePath,
    sourceHash: sha1(content),
    symbols: moduleSymbols,
  };
}

function loadModuleOverrides(rootDir) {
  const configPath = path.join(rootDir, "docs.config.json");
  const config = readJsonIfExists(configPath);
  if (!config) {
    return null;
  }

  if (config.moduleIdOverrides && typeof config.moduleIdOverrides === "object") {
    return config.moduleIdOverrides;
  }

  return null;
}

function generate(options) {
  const rootDir = options.rootDir;
  const srcDir = options.srcDir;
  const typesDir = options.typesDir;
  const diagnostics = [];

  const moduleIdOverrides = loadModuleOverrides(rootDir);
  const files = new Set(collectFiles(srcDir));
  if (typesDir) {
    for (const file of collectFiles(typesDir)) {
      if (!files.has(file)) {
        files.add(file);
      }
    }
  }

  const modules = Array.from(files).map((filePath) =>
    generateModule(filePath, rootDir, srcDir, typesDir, moduleIdOverrides, diagnostics)
  );

  return {
    data: {
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      generatorVersion: options.generatorVersion || "0.0.0",
      luauVersion: null,
      modules,
    },
    diagnostics,
  };
}

module.exports = {
  generate,
};
