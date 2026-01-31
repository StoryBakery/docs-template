#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "luau_docgen.h"

#include <Luau/Ast.h>
#include <Luau/Config.h>
#include <Luau/Frontend.h>
#include <Luau/LuauConfig.h>
#include <Luau/Lexer.h>
#include <Luau/Location.h>
#include <Luau/ParseResult.h>
#include <Luau/Parser.h>
#include <Luau/Scope.h>
#include <Luau/ToString.h>
#include <Luau/Type.h>
#include <Luau/TypePack.h>

namespace fs = std::filesystem;

struct Diagnostic
{
    std::string level;
    std::string file;
    int line = 0;
    std::string message;
};

struct ParamInfo
{
    std::string name;
    std::string type;
    std::vector<std::string> description;
};

struct ReturnInfo
{
    std::string type;
    std::vector<std::string> description;
};

struct ErrorInfo
{
    std::string type;
    std::vector<std::string> description;
};

struct FieldInfo
{
    std::string name;
    std::string type;
    std::string description;
    int line = 0;
    int column = 1;
};

struct TypeTag
{
    std::string kind;
    std::string name;
    std::string type;
    bool isMethod = false;
};

struct DocState
{
    std::string within;
    bool yields = false;
    bool readonly = false;
    std::string visibility;
    std::string since;
    bool unreleased = false;
    bool event = false;
    std::vector<std::string> extends;    std::string indexName;
    std::string inheritDoc;
    std::vector<std::string> includes;
    std::vector<std::string> snippets;
    std::vector<std::string> aliases;
    std::vector<std::string> realms;
    std::vector<std::string> tags;
    std::vector<std::string> categories;
    std::string deprecatedVersion;
    std::string deprecatedDescription;
};

struct DocBlock
{
    int startLine = 0;
    int endLine = 0;
    std::vector<std::string> contentLines;
};

struct ParsedDoc
{
    std::vector<std::string> descriptionLines;
    std::vector<TypeTag> typeTags;
    std::vector<FieldInfo> fields;
    std::vector<ParamInfo> params;
    std::vector<ReturnInfo> returns;
    std::vector<ErrorInfo> errors;
    std::vector<std::pair<std::string, std::string>> externals;
    DocState state;
};

struct Binding
{
    std::string kind;
    std::string name;
    std::string within;
    bool isMethod = false;
    std::vector<ParamInfo> params;
    std::string returnType;
    int line = 0;
    std::vector<FieldInfo> typeFields;
    int typeTableStartLine = 0;
    int typeTableEndLine = 0;
};

struct SymbolTypes
{
    std::string display;
    std::vector<ParamInfo> params;
    std::vector<ReturnInfo> returns;
    std::vector<ErrorInfo> errors;
    bool yields = false;
    std::string propertyType;
    bool readonly = false;
    std::vector<FieldInfo> fields;
    std::string typeAlias;
    std::string indexName;
};

struct TagValue
{
    std::string name;
    std::string value;
    bool hasBool = false;
    bool boolValue = false;
    std::string description;
};

struct Symbol
{
    std::string kind;
    std::string name;
    std::string qualifiedName;
    std::string file;
    int line = 0;
    int column = 1;
    std::string summary;
    std::string descriptionMarkdown;
    std::vector<TagValue> tags;
    SymbolTypes types;
    std::string visibility;
};

struct Module
{
    std::string id;
    std::string path;
    std::string sourceHash;
    std::vector<Symbol> symbols;
};

struct Source
{
    std::string rawContent;
    std::string content;
    std::vector<std::string> lines;
    std::vector<size_t> lineOffsets;
};

struct GeneratorOptions
{
    fs::path rootDir;
    fs::path srcDir;
    fs::path typesDir;
    std::string generatorVersion;
};

static std::string normalizePath(const fs::path& path)
{
    return path.lexically_normal().generic_string();
}

static std::string trimLeft(const std::string& value)
{
    size_t start = 0;
    while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start])))
        start++;
    return value.substr(start);
}

static std::string trimRight(const std::string& value)
{
    if (value.empty())
        return value;

    size_t end = value.size();
    while (end > 0 && std::isspace(static_cast<unsigned char>(value[end - 1])))
        end--;
    return value.substr(0, end);
}

static std::string trim(const std::string& value)
{
    return trimRight(trimLeft(value));
}

static Source loadSource(const fs::path& filePath)
{
    std::ifstream file(filePath, std::ios::binary);
    std::ostringstream buffer;
    buffer << file.rdbuf();

    std::string rawContent = buffer.str();

    std::string normalized;
    normalized.reserve(rawContent.size());
    for (size_t i = 0; i < rawContent.size(); ++i)
    {
        char ch = rawContent[i];
        if (ch == '\r')
        {
            if (i + 1 < rawContent.size() && rawContent[i + 1] == '\n')
                continue;
            normalized.push_back('\n');
        }
        else
        {
            normalized.push_back(ch);
        }
    }

    Source source;
    source.rawContent = rawContent;
    source.content = normalized;

    size_t lineStart = 0;
    for (size_t i = 0; i < normalized.size(); ++i)
    {
        if (normalized[i] == '\n')
        {
            source.lineOffsets.push_back(lineStart);
            source.lines.push_back(normalized.substr(lineStart, i - lineStart));
            lineStart = i + 1;
        }
    }

    source.lineOffsets.push_back(lineStart);
    source.lines.push_back(normalized.substr(lineStart));

    return source;
}

static std::vector<std::string> dedentLines(const std::vector<std::string>& lines)
{
    size_t minIndent = std::string::npos;
    for (const std::string& line : lines)
    {
        if (trim(line).empty())
            continue;

        size_t indent = line.find_first_not_of(" \t");
        if (indent == std::string::npos)
            continue;

        minIndent = std::min(minIndent, indent);
    }

    if (minIndent == std::string::npos || minIndent == 0)
        return lines;

    std::vector<std::string> result;
    result.reserve(lines.size());
    for (const std::string& line : lines)
    {
        if (line.size() < minIndent)
            result.push_back("");
        else
            result.push_back(line.substr(minIndent));
    }

    return result;
}

static std::vector<DocBlock> extractDocBlocks(const std::vector<std::string>& lines)
{
    std::vector<DocBlock> blocks;
    size_t index = 0;

    while (index < lines.size())
    {
        const std::string& line = lines[index];
        std::string trimmed = trim(line);

        if (trimmed.rfind("---", 0) == 0)
        {
            DocBlock block;
            block.startLine = static_cast<int>(index) + 1;
            while (index < lines.size() && trim(lines[index]).rfind("---", 0) == 0)
            {
                std::string raw = lines[index];
                size_t pos = raw.find("---");
                std::string content = pos == std::string::npos ? "" : raw.substr(pos + 3);
                if (!content.empty() && content[0] == ' ')
                    content = content.substr(1);
                block.contentLines.push_back(content);
                index++;
            }
            block.endLine = static_cast<int>(index);
            blocks.push_back(block);
            continue;
        }

        if (trimmed.rfind("--[=[", 0) == 0)
        {
            DocBlock block;
            block.startLine = static_cast<int>(index) + 1;
            bool foundEnd = false;
            std::string current = lines[index];
            size_t startOffset = current.find("--[=[");
            if (startOffset != std::string::npos)
            {
                std::string afterStart = current.substr(startOffset + 5);
                if (!afterStart.empty())
                    block.contentLines.push_back(afterStart);
            }
            index++;

            while (index < lines.size())
            {
                std::string currentLine = lines[index];
                size_t endIndex = currentLine.find("]=]");
                if (endIndex != std::string::npos)
                {
                    std::string beforeEnd = currentLine.substr(0, endIndex);
                    if (!beforeEnd.empty())
                        block.contentLines.push_back(beforeEnd);
                    foundEnd = true;
                    break;
                }

                block.contentLines.push_back(currentLine);
                index++;
            }

            block.endLine = foundEnd ? static_cast<int>(index) + 1 : static_cast<int>(lines.size());
            blocks.push_back(block);
            index = foundEnd ? index + 1 : lines.size();
            continue;
        }

        index++;
    }

    return blocks;
}

static std::pair<std::string, std::string> splitTagValue(const std::string& value)
{
    std::istringstream stream(value);
    std::string name;
    stream >> name;
    std::string rest;
    std::getline(stream, rest);
    return {name, trim(rest)};
}

static std::pair<std::string, std::string> parseTypeAndDescription(const std::string& value)
{
    size_t separator = value.find("--");
    if (separator == std::string::npos)
        return {trim(value), ""};

    std::string typePart = trim(value.substr(0, separator));
    std::string description = trim(value.substr(separator + 2));
    return {typePart, description};
}

struct ParsedMemberName
{
    std::string within;
    std::string name;
    bool isMethod = false;
};

static ParsedMemberName parseMemberName(const std::string& raw)
{
    ParsedMemberName result;
    result.name = raw;

    if (raw.rfind("~:", 0) == 0)
    {
        result.within = "~";
        result.name = raw.substr(2);
        result.isMethod = true;
        return result;
    }

    if (raw.rfind("~.", 0) == 0)
    {
        result.within = "~";
        result.name = raw.substr(2);
        return result;
    }

    size_t colon = raw.rfind(:);
    size_t dot = raw.rfind(.);

    if (colon != std::string::npos && colon > dot)
    {
        result.within = raw.substr(0, colon);
        result.name = raw.substr(colon + 1);
        result.isMethod = true;
        return result;
    }

    if (dot != std::string::npos)
    {
        result.within = raw.substr(0, dot);
        result.name = raw.substr(dot + 1);
        return result;
    }

    return result;
}

static ParsedDoc parseDocBlock(const std::vector<std::string>& contentLines)
{
    ParsedDoc doc;
    std::vector<std::string> lines = dedentLines(contentLines);
    bool inFence = false;
    struct ContinuationState
    {
        std::vector<std::string>* description = nullptr;
        std::string* type = nullptr;
    };
    ContinuationState continuation;

    for (const std::string& line : lines)
    {
        std::string trimmed = trim(line);

        if (trimmed.rfind("```", 0) == 0)
            inFence = !inFence;

        size_t indentSize = line.find_first_not_of(" \t");
        if (indentSize == std::string::npos)
            indentSize = line.size();
        std::string afterIndent = line.substr(indentSize);
        std::string indent = line.substr(0, indentSize);
        bool isContinuation =
            continuation &&
            (!indent.empty() && (indent.find('\t') != std::string::npos || indent.size() >= 2)) &&
            !(trim(afterIndent).rfind("@", 0) == 0 || trim(afterIndent).rfind(".", 0) == 0);

        if (!inFence && isContinuation)
        {
            continuation->push_back(trimRight(afterIndent));
            continue;
        }

        continuation = nullptr;

        if (!inFence && trimmed.rfind("@", 0) == 0)
        {
            std::string tagLine = trimmed.substr(1);
            std::string tagName;
            std::string tagValue;
            size_t space = tagLine.find_first_of(" \t");
            if (space == std::string::npos)
            {
                tagName = tagLine;
                tagValue = "";
            }
            else
            {
                tagName = tagLine.substr(0, space);
                tagValue = trim(tagLine.substr(space + 1));
            }

            if (tagName == "class")
            {
                doc.typeTags.push_back({"class", tagValue, "", false});
            }
            else if (tagName == "prop")
            {
                auto [rawName, rest] = splitTagValue(tagValue);
                ParsedMemberName parsed = parseMemberName(rawName);
                if (!parsed.within.empty() && doc.state.within.empty())
                    doc.state.within = parsed.within;
                doc.typeTags.push_back({"property", parsed.name, rest, false});
                if (!rest.empty() && rest.find("--") == std::string::npos)
                    continuation.type = &doc.typeTags.back().type;
            }
            else if (tagName == "type")
            {
                auto [name, rest] = splitTagValue(tagValue);
                doc.typeTags.push_back({"type", name, rest, false});
                if (!rest.empty() && rest.find("--") == std::string::npos)
                    continuation.type = &doc.typeTags.back().type;
            }
            else if (tagName == "interface")
            {
                doc.typeTags.push_back({"interface", tagValue, "", false});
            }
            else if (tagName == "function")
            {
                ParsedMemberName parsed = parseMemberName(tagValue);
                if (!parsed.within.empty() && doc.state.within.empty())
                    doc.state.within = parsed.within;
                doc.typeTags.push_back({"function", parsed.name, "", parsed.isMethod});
            }
            else if (tagName == "method")
            {
                ParsedMemberName parsed = parseMemberName(tagValue);
                if (!parsed.within.empty() && doc.state.within.empty())
                    doc.state.within = parsed.within;
                doc.typeTags.push_back({"function", parsed.name, "", true});
            }
            else if (tagName == "constructor")
            {
                ParsedMemberName parsed = parseMemberName(tagValue);
                if (!parsed.within.empty() && doc.state.within.empty())
                    doc.state.within = parsed.within;
                doc.typeTags.push_back({"constructor", parsed.name, "", false});
            }
            else if (tagName == "within")
            {
                doc.state.within = tagValue;
            }
            else if (tagName == "field")
            {
                auto [name, rest] = splitTagValue(tagValue);
                bool hasSeparator = rest.find("--") != std::string::npos;
                auto [typePart, description] = parseTypeAndDescription(rest);
                doc.fields.push_back({name, typePart, description});
                if (hasSeparator)
                    continuation.description = &doc.fields.back().description;
                else if (!doc.fields.back().type.empty())
                    continuation.type = &doc.fields.back().type;
            }
            else if (tagName == "param")
            {
                auto [name, rest] = splitTagValue(tagValue);
                bool hasSeparator = rest.find("--") != std::string::npos;
                auto [typePart, description] = parseTypeAndDescription(rest);
                ParamInfo param;
                param.name = name;
                param.type = typePart;
                if (!description.empty())
                    param.description.push_back(description);
                doc.params.push_back(param);
                if (hasSeparator)
                    continuation.description = &doc.params.back().description;
                else if (!doc.params.back().type.empty())
                    continuation.type = &doc.params.back().type;
            }
            else if (tagName == "return")
            {
                bool hasSeparator = tagValue.find("--") != std::string::npos;
                auto [typePart, description] = parseTypeAndDescription(tagValue);
                ReturnInfo ret;
                ret.type = typePart;
                if (!description.empty())
                    ret.description.push_back(description);
                doc.returns.push_back(ret);
                if (hasSeparator)
                    continuation.description = &doc.returns.back().description;
                else if (!doc.returns.back().type.empty())
                    continuation.type = &doc.returns.back().type;
            }
            else if (tagName == "error")
            {
                bool hasSeparator = tagValue.find("--") != std::string::npos;
                auto [typePart, description] = parseTypeAndDescription(tagValue);
                ErrorInfo err;
                err.type = typePart;
                if (!description.empty())
                    err.description.push_back(description);
                doc.errors.push_back(err);
                if (hasSeparator)
                    continuation.description = &doc.errors.back().description;
                else if (!doc.errors.back().type.empty())
                    continuation.type = &doc.errors.back().type;
            }
            else if (tagName == "yields")
            {
                doc.state.yields = true;
            }
            else if (tagName == "tag")
            {
                if (!tagValue.empty())
                    doc.state.tags.push_back(tagValue);
            }
            else if (tagName == "category")
            {
                if (!tagValue.empty())
                    doc.state.categories.push_back(tagValue);
            }
            else if (tagName == "event")
            {
                doc.state.event = true;
            }
            else if (tagName == "extends")
            {
                if (!tagValue.empty())
                    doc.state.extends.push_back(tagValue);
            }            else if (tagName == "unreleased")
            {
                doc.state.unreleased = true;
            }
            else if (tagName == "since")
            {
                doc.state.since = tagValue;
            }
            else if (tagName == "deprecated")
            {
                auto [version, description] = parseTypeAndDescription(tagValue);
                doc.state.deprecatedVersion = version;
                doc.state.deprecatedDescription = description;
            }
            else if (tagName == "server" || tagName == "client" || tagName == "plugin")
            {
                doc.state.realms.push_back(tagName);
            }
            else if (tagName == "private")
            {
                doc.state.visibility = "private";
            }
            else if (tagName == "ignore")
            {
                doc.state.visibility = "ignored";
            }
            else if (tagName == "readonly")
            {
                doc.state.readonly = true;
            }
            else if (tagName == "__index")
            {
                doc.state.indexName = tagValue;
            }
            else if (tagName == "external")
            {
                auto [name, rest] = splitTagValue(tagValue);
                if (!name.empty() && !rest.empty())
                    doc.externals.push_back({name, rest});
            }
            else if (tagName == "inheritDoc")
            {
                doc.state.inheritDoc = tagValue;
            }
            else if (tagName == "include")
            {
                if (!tagValue.empty())
                    doc.state.includes.push_back(tagValue);
            }
            else if (tagName == "snippet")
            {
                if (!tagValue.empty())
                    doc.state.snippets.push_back(tagValue);
            }
            else if (tagName == "alias")
            {
                if (!tagValue.empty())
                    doc.state.aliases.push_back(tagValue);
            }
            continue;
        }

        if (!inFence && trimmed.rfind(".", 0) == 0)
        {
            std::string fieldLine = trim(trimmed.substr(1));
            auto [name, rest] = splitTagValue(fieldLine);
            auto [typePart, description] = parseTypeAndDescription(rest);
            doc.fields.push_back({name, typePart, description});
            continue;
        }

        doc.descriptionLines.push_back(trimRight(line));
    }

    return doc;

static std::vector<std::string> collectInlineDocLines(const Source& source, int startLine, int targetLine)
{
    std::vector<std::string> lines;
    if (targetLine <= 1)
        return lines;

    int index = targetLine - 2;
    int minIndex = std::max(0, startLine - 1);

    while (index >= minIndex && trim(source.lines[index]).empty())
        index--;

    if (index < minIndex)
        return lines;

    std::string trimmed = trim(source.lines[index]);

    if (trimmed.rfind("---", 0) == 0)
    {
        int end = index;
        while (index >= minIndex && trim(source.lines[index]).rfind("---", 0) == 0)
            index--;

        for (int lineIndex = index + 1; lineIndex <= end; ++lineIndex)
        {
            std::string raw = source.lines[lineIndex];
            size_t pos = raw.find("---");
            std::string content = pos == std::string::npos ? raw : raw.substr(pos + 3);
            if (!content.empty() && content.front() == ' ')
                content.erase(content.begin());
            lines.push_back(content);
        }
        return lines;
    }

    if (trimmed.find("]=]") != std::string::npos)
    {
        int end = index;
        while (index >= minIndex)
        {
            if (source.lines[index].find("--[=[") != std::string::npos)
                break;
            index--;
        }

        if (index < minIndex)
            return lines;

        size_t startPos = source.lines[index].find("--[=[");
        std::string first = startPos == std::string::npos ? source.lines[index] : source.lines[index].substr(startPos + 5);
        if (!first.empty())
            lines.push_back(first);

        for (int lineIndex = index + 1; lineIndex <= end; ++lineIndex)
        {
            std::string current = source.lines[lineIndex];
            size_t endPos = current.find("]=]");
            if (endPos != std::string::npos)
            {
                std::string beforeEnd = current.substr(0, endPos);
                if (!beforeEnd.empty())
                    lines.push_back(beforeEnd);
                break;
            }
            lines.push_back(current);
        }
    }

    return lines;
}

static std::string joinInlineDescription(const std::vector<std::string>& lines)
{
    std::vector<std::string> trimmed = lines;
    while (!trimmed.empty() && trim(trimmed.front()).empty())
        trimmed.erase(trimmed.begin());
    while (!trimmed.empty() && trim(trimmed.back()).empty())
        trimmed.pop_back();

    std::ostringstream out;
    for (size_t i = 0; i < trimmed.size(); ++i)
    {
        out << trimRight(trimmed[i]);
        if (i + 1 < trimmed.size())
            out << "\n";
    }

    return trimRight(out.str());
}

static std::vector<FieldInfo> collectTypeTableFields(const Source& source, const Luau::AstTypeTable* table)
{
    std::vector<FieldInfo> fields;
    if (!table)
        return fields;

    int startLine = static_cast<int>(table->location.begin.line) + 1;
    int endLine = static_cast<int>(table->location.end.line) + 1;

    for (const Luau::AstTableProp& prop : table->props)
    {
        FieldInfo field;
        field.name = prop.name.value;
        field.line = static_cast<int>(prop.location.begin.line) + 1;
        field.column = static_cast<int>(prop.location.begin.column) + 1;

        if (prop.type)
            field.type = extractLocationText(source, prop.type->location);

        std::vector<std::string> docLines = collectInlineDocLines(source, startLine, field.line);
        field.description = joinInlineDescription(docLines);

        if (field.line >= startLine && field.line <= endLine)
            fields.push_back(field);
    }

    return fields;
}
}

static std::string joinDescription(const std::vector<std::string>& lines, std::string& summaryOut)
{
    std::vector<std::string> trimmed = lines;
    while (!trimmed.empty() && trim(trimmed.front()).empty())
        trimmed.erase(trimmed.begin());

    std::ostringstream out;
    for (size_t i = 0; i < trimmed.size(); ++i)
    {
        out << trimmed[i];
        if (i + 1 < trimmed.size())
            out << "\n";
    }

    std::string text = trimRight(out.str());
    summaryOut.clear();
    std::istringstream stream(text);
    std::string line;
    while (std::getline(stream, line))
    {
        if (!trim(line).empty())
        {
            summaryOut = trim(line);
            break;
        }
    }

    return text;
}

static std::string extractLocationText(const Source& source, const Luau::Location& location)
{
    if (source.lineOffsets.empty())
        return "";

    unsigned int startLine = location.begin.line;
    unsigned int endLine = location.end.line;
    unsigned int startColumn = location.begin.column;
    unsigned int endColumn = location.end.column;

    if (startLine >= source.lineOffsets.size() || endLine >= source.lineOffsets.size())
        return "";

    size_t startIndex = source.lineOffsets[startLine] + startColumn;
    size_t endIndex = source.lineOffsets[endLine] + endColumn;

    if (startIndex > source.content.size() || endIndex > source.content.size() || startIndex >= endIndex)
        return "";

    std::string result = source.content.substr(startIndex, endIndex - startIndex);
    return trim(result);
}

static std::string exprToName(Luau::AstExpr* expr)
{
    if (auto global = expr->as<Luau::AstExprGlobal>())
        return global->name.value;
    if (auto local = expr->as<Luau::AstExprLocal>())
        return local->local->name.value;
    if (auto index = expr->as<Luau::AstExprIndexName>())
    {
        std::string base = exprToName(index->expr);
        if (base.empty())
            return "";
        return base + "." + index->index.value;
    }
    return "";
}

static Binding buildFunctionBinding(
    const std::string& within,
    const std::string& name,
    bool isMethod,
    Luau::AstExprFunction* func,
    const Source& source,
    int line
)
{
    Binding binding;
    binding.kind = "function";
    binding.within = within;
    binding.name = name;
    binding.isMethod = isMethod;
    binding.line = line;

    for (Luau::AstLocal* arg : func->args)
    {
        ParamInfo param;
        param.name = arg->name.value;
        if (arg->annotation)
            param.type = extractLocationText(source, arg->annotation->location);
        binding.params.push_back(param);
    }

    if (func->vararg)
    {
        ParamInfo param;
        param.name = "...";
        if (func->varargAnnotation)
            param.type = extractLocationText(source, func->varargAnnotation->location);
        binding.params.push_back(param);
    }

    if (!binding.isMethod && !binding.params.empty())
    {
        if (binding.params[0].name == "self")
            binding.isMethod = true;
    }

    if (func->returnAnnotation)
        binding.returnType = extractLocationText(source, func->returnAnnotation->location);

    return binding;
}

struct BindingCollector : Luau::AstVisitor
{
    const Source& source;
    std::vector<Binding>& bindings;

    BindingCollector(const Source& source, std::vector<Binding>& bindings)
        : source(source)
        , bindings(bindings)
    {
    }

    bool visit(Luau::AstStatFunction* node) override
    {
        Luau::AstExprIndexName* index = node->name->as<Luau::AstExprIndexName>();
        if (index)
        {
            std::string within = exprToName(index->expr);
            if (!within.empty())
            {
                std::string name = index->index.value;
                bool isMethod = index->op == ':';
                int line = static_cast<int>(node->location.begin.line) + 1;
                bindings.push_back(buildFunctionBinding(within, name, isMethod, node->func, source, line));
            }
            return false;
        }

        if (auto global = node->name->as<Luau::AstExprGlobal>())
        {
            int line = static_cast<int>(node->location.begin.line) + 1;
            bindings.push_back(buildFunctionBinding("", global->name.value, false, node->func, source, line));
            return false;
        }

        return false;
    }

    bool visit(Luau::AstStatLocalFunction* node) override
    {
        int line = static_cast<int>(node->location.begin.line) + 1;
        bindings.push_back(buildFunctionBinding("", node->name->name.value, false, node->func, source, line));
        return false;
    }

    bool visit(Luau::AstStatAssign* node) override
    {
        size_t valueCount = node->values.size;
        for (size_t i = 0; i < node->vars.size; ++i)
        {
            Luau::AstExpr* var = node->vars.data[i];
            Luau::AstExpr* value = i < valueCount ? node->values.data[i] : nullptr;
            int line = static_cast<int>(node->location.begin.line) + 1;

            if (auto index = var->as<Luau::AstExprIndexName>())
            {
                std::string within = exprToName(index->expr);
                if (within.empty())
                    continue;

                std::string name = index->index.value;
                if (value && value->is<Luau::AstExprFunction>())
                {
                    bindings.push_back(
                        buildFunctionBinding(within, name, false, value->as<Luau::AstExprFunction>(), source, line)
                    );
                }
                else
                {
                    Binding binding;
                    binding.kind = "property";
                    binding.within = within;
                    binding.name = name;
                    binding.line = line;
                    bindings.push_back(binding);
                }
                continue;
            }

            if (auto global = var->as<Luau::AstExprGlobal>())
            {
                std::string name = global->name.value;
                if (value && value->is<Luau::AstExprFunction>())
                {
                    bindings.push_back(
                        buildFunctionBinding("", name, false, value->as<Luau::AstExprFunction>(), source, line)
                    );
                }
                else
                {
                    Binding binding;
                    binding.kind = "property";
                    binding.name = name;
                    binding.line = line;
                    bindings.push_back(binding);
                }
                continue;
            }

            if (auto local = var->as<Luau::AstExprLocal>())
            {
                std::string name = local->local->name.value;
                if (value && value->is<Luau::AstExprFunction>())
                {
                    bindings.push_back(
                        buildFunctionBinding("", name, false, value->as<Luau::AstExprFunction>(), source, line)
                    );
                }
                else
                {
                    Binding binding;
                    binding.kind = "property";
                    binding.name = name;
                    binding.line = line;
                    bindings.push_back(binding);
                }
                continue;
            }
        }
        return false;
    }

    bool visit(Luau::AstStatLocal* node) override
    {
        for (size_t i = 0; i < node->vars.size; ++i)
        {
            Luau::AstLocal* var = node->vars.data[i];
            Luau::AstExpr* value = i < node->values.size ? node->values.data[i] : nullptr;
            if (!value || !value->is<Luau::AstExprTable>())
                continue;

            Binding binding;
            binding.kind = "class";
            binding.name = var->name.value;
            binding.line = static_cast<int>(node->location.begin.line) + 1;
            bindings.push_back(binding);
        }
        return false;
    }
    bool visit(Luau::AstStatTypeAlias* node) override
    {
        Binding binding;
        binding.kind = "type";
        binding.name = node->name.value;
        binding.line = static_cast<int>(node->location.begin.line) + 1;

        if (auto table = node->type ? node->type->as<Luau::AstTypeTable>() : nullptr)
        {
            binding.typeFields = collectTypeTableFields(source, table);
            binding.typeTableStartLine = static_cast<int>(table->location.begin.line) + 1;
            binding.typeTableEndLine = static_cast<int>(table->location.end.line) + 1;
        }

        bindings.push_back(binding);
        return false;
    }

};

static std::vector<Binding> collectBindings(const Source& source)
{
    Luau::Allocator allocator;
    Luau::AstNameTable names(allocator);
    Luau::ParseOptions options;
    Luau::ParseResult result = Luau::Parser::parse(
        source.content.c_str(),
        source.content.size(),
        names,
        allocator,
        options
    );

    std::vector<Binding> bindings;
    if (!result.root)
        return bindings;

    BindingCollector collector(source, bindings);
    result.root->visit(&collector);

    std::sort(bindings.begin(), bindings.end(), [](const Binding& a, const Binding& b) {
        return a.line < b.line;
    });

    return bindings;
}

static const Binding* findBindingAfterLine(const std::vector<Binding>& bindings, int line)
{
    for (const Binding& binding : bindings)
    {
        if (binding.line > line)
            return &binding;
    }
    return nullptr;
}

static std::string buildQualifiedName(const std::string& within, const std::string& name, bool isMethod)
{
    if (within.empty())
        return name;
    return isMethod ? within + ":" + name : within + "." + name;
}

static int findColumn(const std::vector<std::string>& lines, int lineNumber)
{
    if (lineNumber <= 0 || static_cast<size_t>(lineNumber) > lines.size())
        return 1;
    const std::string& line = lines[lineNumber - 1];
    size_t pos = line.find_first_not_of(" \t");
    return pos == std::string::npos ? 1 : static_cast<int>(pos) + 1;
}

struct ModuleContext
{
    fs::path filePath;
    fs::path baseDir;
    std::string moduleName;
    std::string rootRelativePath;
    std::string baseRelativePath;
    Source source;
    std::vector<DocBlock> blocks;
    std::vector<Binding> bindings;
};

struct ModuleAnalysis
{
    std::string moduleName;
    Luau::ModulePtr module;
    Luau::ScopePtr scope;
};

static bool pathStartsWith(const fs::path& path, const fs::path& prefix)
{
    if (prefix.empty())
        return false;

    std::string pathText = normalizePath(path);
    std::string prefixText = normalizePath(prefix);

    if (pathText == prefixText)
        return true;

    if (pathText.size() <= prefixText.size())
        return false;

    if (pathText.compare(0, prefixText.size(), prefixText) != 0)
        return false;

    return pathText[prefixText.size()] == '/';
}

static fs::path selectBaseDir(const fs::path& filePath, const GeneratorOptions& options)
{
    if (!options.srcDir.empty() && pathStartsWith(filePath, options.srcDir))
        return options.srcDir;

    if (!options.typesDir.empty() && pathStartsWith(filePath, options.typesDir))
        return options.typesDir;

    return options.rootDir;
}

static std::string stripExtension(const fs::path& path)
{
    fs::path withoutExt = path;
    withoutExt.replace_extension();
    return normalizePath(withoutExt);
}

static ModuleContext buildModuleContext(const fs::path& filePath, const GeneratorOptions& options)
{
    ModuleContext context;
    context.filePath = filePath;
    context.source = loadSource(filePath);
    context.blocks = extractDocBlocks(context.source.lines);
    context.bindings = collectBindings(context.source);

    context.baseDir = selectBaseDir(filePath, options);
    context.rootRelativePath = normalizePath(fs::relative(filePath, options.rootDir));
    context.baseRelativePath = normalizePath(fs::relative(filePath, context.baseDir));
    context.moduleName = stripExtension(fs::relative(filePath, context.baseDir));

    return context;
}

static std::optional<std::string> readFileText(const fs::path& filePath)
{
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open())
        return std::nullopt;

    std::ostringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

static std::string safeRelativePath(const fs::path& path, const fs::path& rootDir)
{
    try
    {
        return normalizePath(fs::relative(path, rootDir));
    }
    catch (...)
    {
        return normalizePath(path);
    }
}

struct DocgenConfigResolver : Luau::ConfigResolver
{
    Luau::Config defaultConfig;
    fs::path rootDir;

    std::unordered_map<std::string, fs::path> modulePaths;

    mutable std::unordered_map<std::string, Luau::Config> configCache;
    mutable std::vector<Diagnostic> diagnostics;

    DocgenConfigResolver(const fs::path& rootDir, const std::unordered_map<std::string, fs::path>& modulePaths)
        : rootDir(rootDir)
        , modulePaths(modulePaths)
    {
    }

    const Luau::Config& getConfig(const Luau::ModuleName& name, const Luau::TypeCheckLimits&) const override
    {
        auto it = modulePaths.find(name);
        if (it == modulePaths.end())
            return defaultConfig;

        fs::path dir = it->second.parent_path();
        return readConfigRecursive(dir);
    }

    const Luau::Config& readConfigRecursive(const fs::path& dir) const
    {
        std::string key = normalizePath(dir);
        auto cached = configCache.find(key);
        if (cached != configCache.end())
            return cached->second;

        Luau::Config result = defaultConfig;

        fs::path parent = dir.parent_path();
        if (!parent.empty() && parent != dir)
            result = readConfigRecursive(parent);

        fs::path luaurcPath = dir / Luau::kConfigName;
        fs::path luauConfigPath = dir / Luau::kLuauConfigName;

        bool hasLuaurc = fs::is_regular_file(luaurcPath);
        bool hasLuauConfig = fs::is_regular_file(luauConfigPath);

        if (hasLuaurc && hasLuauConfig)
        {
            diagnostics.push_back({
                "warning",
                safeRelativePath(luaurcPath, rootDir),
                1,
                "Both .luaurc and .config.luau exist; .luaurc is used.",
            });
        }

        if (hasLuaurc)
        {
            if (auto contents = readFileText(luaurcPath))
            {
                Luau::ConfigOptions::AliasOptions aliasOptions;
                aliasOptions.configLocation = luaurcPath.string();
                aliasOptions.overwriteAliases = true;

                Luau::ConfigOptions options;
                options.aliasOptions = aliasOptions;

                if (auto error = Luau::parseConfig(*contents, result, options))
                {
                    diagnostics.push_back({
                        "warning",
                        safeRelativePath(luaurcPath, rootDir),
                        1,
                        *error,
                    });
                }
            }
        }
        else if (hasLuauConfig)
        {
            if (auto contents = readFileText(luauConfigPath))
            {
                Luau::ConfigOptions::AliasOptions aliasOptions;
                aliasOptions.configLocation = luauConfigPath.string();
                aliasOptions.overwriteAliases = true;

                Luau::InterruptCallbacks callbacks;
                if (auto error = Luau::extractLuauConfig(*contents, result, aliasOptions, std::move(callbacks)))
                {
                    diagnostics.push_back({
                        "warning",
                        safeRelativePath(luauConfigPath, rootDir),
                        1,
                        *error,
                    });
                }
            }
        }

        auto inserted = configCache.emplace(key, std::move(result));
        return inserted.first->second;
    }

    std::vector<Diagnostic> consumeDiagnostics() const
    {
        std::vector<Diagnostic> result = diagnostics;
        diagnostics.clear();
        return result;
    }
};

static std::string normalizeRequirePath(std::string value)
{
    std::replace(value.begin(), value.end(), '\\', '/');

    bool hasSlash = value.find('/') != std::string::npos;
    bool hasLeadingDot = !value.empty() && value[0] == '.';

    if (!hasSlash && !hasLeadingDot && value.find('.') != std::string::npos)
        std::replace(value.begin(), value.end(), '.', '/');

    return value;
}

static std::string stripRequireExtension(const std::string& value)
{
    if (value.size() > 5 && value.rfind(".luau") == value.size() - 5)
        return value.substr(0, value.size() - 5);

    if (value.size() > 4 && value.rfind(".lua") == value.size() - 4)
        return value.substr(0, value.size() - 4);

    return value;
}

struct DocgenFileResolver : Luau::FileResolver
{
    std::unordered_map<std::string, const ModuleContext*> modulesByName;

    explicit DocgenFileResolver(const std::vector<ModuleContext>& contexts)
    {
        for (const ModuleContext& context : contexts)
            modulesByName.emplace(context.moduleName, &context);
    }

    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override
    {
        auto it = modulesByName.find(name);
        if (it == modulesByName.end())
            return std::nullopt;

        Luau::SourceCode code;
        code.source = it->second->source.content;
        code.type = Luau::SourceCode::Module;
        return code;
    }

    std::optional<Luau::ModuleInfo> resolveModule(
        const Luau::ModuleInfo* context,
        Luau::AstExpr* expr,
        const Luau::TypeCheckLimits&
    ) override
    {
        if (!context || !expr)
            return std::nullopt;

        auto str = expr->as<Luau::AstExprConstantString>();
        if (!str)
            return std::nullopt;

        std::string requirePath(str->value.data, str->value.size);
        requirePath = normalizeRequirePath(requirePath);
        requirePath = stripRequireExtension(requirePath);

        auto ctxIt = modulesByName.find(context->name);
        if (ctxIt == modulesByName.end())
            return std::nullopt;

        fs::path currentDir = fs::path(ctxIt->second->moduleName).parent_path();

        auto tryResolve = [&](const fs::path& candidate) -> std::optional<Luau::ModuleInfo> {
            std::string moduleName = normalizePath(candidate.lexically_normal());
            if (modulesByName.find(moduleName) != modulesByName.end())
                return Luau::ModuleInfo{moduleName, false};

            std::string initName = moduleName + "/init";
            if (modulesByName.find(initName) != modulesByName.end())
                return Luau::ModuleInfo{initName, false};

            return std::nullopt;
        };

        if (!requirePath.empty())
        {
            if (auto resolved = tryResolve(currentDir / requirePath))
                return resolved;

            if (auto resolved = tryResolve(fs::path(requirePath)))
                return resolved;
        }

        return std::nullopt;
    }
};

static std::unordered_map<std::string, ModuleAnalysis> runFrontendAnalysis(
    Luau::Frontend& frontend,
    const std::vector<ModuleContext>& contexts
)
{
    std::unordered_map<std::string, ModuleAnalysis> analyses;
    analyses.reserve(contexts.size());

    for (const ModuleContext& context : contexts)
    {
        frontend.check(context.moduleName);

        Luau::ModulePtr module = frontend.moduleResolver.getModule(context.moduleName);
        if (!module || !module->hasModuleScope())
            continue;

        analyses.emplace(context.moduleName, ModuleAnalysis{
            context.moduleName,
            module,
            module->getModuleScope(),
        });
    }

    return analyses;
}

static std::vector<std::string> splitDotPath(const std::string& value)
{
    std::vector<std::string> parts;
    std::stringstream stream(value);
    std::string part;
    while (std::getline(stream, part, '.'))
    {
        if (!part.empty())
            parts.push_back(part);
    }
    return parts;
}

static std::optional<Luau::TypeId> lookupBindingType(const Luau::ScopePtr& scope, const std::string& name)
{
    if (!scope)
        return std::nullopt;

    std::optional<Luau::Binding> binding = scope->linearSearchForBinding(name, true);
    if (!binding)
        return std::nullopt;

    return binding->typeId;
}

static std::optional<Luau::TypeId> resolveMemberTypeRecursive(
    Luau::TypeId typeId,
    const std::string& memberName,
    std::unordered_set<const void*>& visited
)
{
    if (!typeId)
        return std::nullopt;

    typeId = Luau::follow(typeId);
    const void* key = static_cast<const void*>(typeId);
    if (visited.find(key) != visited.end())
        return std::nullopt;
    visited.insert(key);

    if (const Luau::TableType* tableType = Luau::get<Luau::TableType>(typeId))
    {
        auto it = tableType->props.find(memberName);
        if (it != tableType->props.end())
        {
            if (it->second.readTy)
                return Luau::follow(*it->second.readTy);
            if (it->second.writeTy)
                return Luau::follow(*it->second.writeTy);
        }
    }

    if (const Luau::MetatableType* metatableType = Luau::get<Luau::MetatableType>(typeId))
    {
        if (auto resolved = resolveMemberTypeRecursive(metatableType->table, memberName, visited))
            return resolved;
        if (auto resolved = resolveMemberTypeRecursive(metatableType->metatable, memberName, visited))
            return resolved;
    }

    if (const Luau::ExternType* externType = Luau::get<Luau::ExternType>(typeId))
    {
        auto it = externType->props.find(memberName);
        if (it != externType->props.end())
        {
            if (it->second.readTy)
                return Luau::follow(*it->second.readTy);
            if (it->second.writeTy)
                return Luau::follow(*it->second.writeTy);
        }

        if (externType->parent)
        {
            if (auto resolved = resolveMemberTypeRecursive(*externType->parent, memberName, visited))
                return resolved;
        }
    }

    if (const Luau::UnionType* unionType = Luau::get<Luau::UnionType>(typeId))
    {
        for (Luau::TypeId option : unionType->options)
        {
            if (auto resolved = resolveMemberTypeRecursive(option, memberName, visited))
                return resolved;
        }
    }

    if (const Luau::IntersectionType* intersectionType = Luau::get<Luau::IntersectionType>(typeId))
    {
        for (Luau::TypeId part : intersectionType->parts)
        {
            if (auto resolved = resolveMemberTypeRecursive(part, memberName, visited))
                return resolved;
        }
    }

    return std::nullopt;
}

static std::optional<Luau::TypeId> resolveMemberType(Luau::TypeId typeId, const std::string& memberName)
{
    std::unordered_set<const void*> visited;
    return resolveMemberTypeRecursive(typeId, memberName, visited);
}

static std::optional<Luau::TypeId> resolveWithinType(const Luau::ScopePtr& scope, const std::string& within)
{
    std::vector<std::string> parts = splitDotPath(within);
    if (parts.empty())
        return std::nullopt;

    std::optional<Luau::TypeId> current = lookupBindingType(scope, parts.front());
    if (!current)
        return std::nullopt;

    for (size_t i = 1; i < parts.size(); ++i)
    {
        current = resolveMemberType(*current, parts[i]);
        if (!current)
            return std::nullopt;
    }

    return current;
}

static std::optional<Luau::TypeId> resolveSymbolType(const ModuleAnalysis* analysis, const std::string& within, const std::string& name)
{
    if (!analysis || !analysis->scope)
        return std::nullopt;

    if (within.empty())
        return lookupBindingType(analysis->scope, name);

    std::optional<Luau::TypeId> withinType = resolveWithinType(analysis->scope, within);
    if (!withinType)
        return std::nullopt;

    return resolveMemberType(*withinType, name);
}

static std::string toDisplayString(Luau::TypeId typeId, bool hideSelf)
{
    if (!typeId)
        return "";

    Luau::ToStringOptions options;
    options.hideFunctionSelfArgument = hideSelf;
    return Luau::toString(Luau::follow(typeId), options);
}

struct FunctionAnalysis
{
    std::string display;
    std::vector<std::string> paramTypes;
    std::vector<std::string> paramNames;
    std::unordered_map<std::string, std::string> paramTypesByName;
    std::vector<std::string> returnTypes;
};

static void collectFunctionTypes(
    Luau::TypeId typeId,
    std::unordered_set<const void*>& visited,
    std::vector<Luau::TypeId>& outTypes
)
{
    if (!typeId)
        return;

    typeId = Luau::follow(typeId);
    const void* key = static_cast<const void*>(typeId);
    if (visited.find(key) != visited.end())
        return;
    visited.insert(key);

    if (Luau::get<Luau::FunctionType>(typeId))
    {
        outTypes.push_back(typeId);
        return;
    }

    if (const Luau::UnionType* unionType = Luau::get<Luau::UnionType>(typeId))
    {
        for (Luau::TypeId option : unionType->options)
            collectFunctionTypes(option, visited, outTypes);
        return;
    }

    if (const Luau::IntersectionType* intersectionType = Luau::get<Luau::IntersectionType>(typeId))
    {
        for (Luau::TypeId part : intersectionType->parts)
            collectFunctionTypes(part, visited, outTypes);
    }
}

static FunctionAnalysis analyzeFunctionType(Luau::TypeId typeId, bool isMethod)
{
    FunctionAnalysis result;

    if (!typeId)
        return result;

    std::vector<Luau::TypeId> functionTypes;
    std::unordered_set<const void*> visited;
    collectFunctionTypes(typeId, visited, functionTypes);

    if (functionTypes.empty())
    {
        result.display = toDisplayString(typeId, isMethod);
        return result;
    }

    Luau::TypeId primaryType = functionTypes.front();
    const Luau::FunctionType* functionType = Luau::get<Luau::FunctionType>(primaryType);
    if (!functionType)
        return result;

    auto [argTypes, argTail] = Luau::flatten(functionType->argTypes);
    auto [retTypes, retTail] = Luau::flatten(functionType->retTypes);
    (void)argTail;
    (void)retTail;

    size_t argOffset = 0;
    if (isMethod && functionType->hasSelf && !argTypes.empty())
        argOffset = 1;

    std::vector<std::string> argNames;
    argNames.reserve(functionType->argNames.size());
    for (const std::optional<Luau::FunctionArgument>& arg : functionType->argNames)
    {
        if (arg)
            argNames.push_back(arg->name);
        else
            argNames.push_back("");
    }

    for (size_t i = argOffset; i < argTypes.size(); ++i)
    {
        std::string typeText = toDisplayString(argTypes[i], false);
        result.paramTypes.push_back(typeText);

        size_t nameIndex = i;
        std::string paramName = nameIndex < argNames.size() ? argNames[nameIndex] : "";
        result.paramNames.push_back(paramName);

        if (!paramName.empty())
            result.paramTypesByName[paramName] = typeText;
    }

    for (Luau::TypeId retType : retTypes)
        result.returnTypes.push_back(toDisplayString(retType, false));

    result.display = toDisplayString(primaryType, isMethod);
    return result;
}

static void mergeParamTypesFromAnalysis(std::vector<ParamInfo>& params, const FunctionAnalysis& analysis)
{
    for (size_t i = 0; i < params.size(); ++i)
    {
        if (!params[i].type.empty())
            continue;

        auto byName = analysis.paramTypesByName.find(params[i].name);
        if (byName != analysis.paramTypesByName.end())
        {
            params[i].type = byName->second;
            continue;
        }

        if (i < analysis.paramTypes.size() && !analysis.paramTypes[i].empty())
            params[i].type = analysis.paramTypes[i];
    }
}

static std::vector<ParamInfo> mergeBindingParamsWithAnalysis(const Binding& binding, const FunctionAnalysis& analysis)
{
    std::vector<ParamInfo> params = binding.params;
    mergeParamTypesFromAnalysis(params, analysis);
    return params;
}

static void mergeReturnTypesFromAnalysis(std::vector<ReturnInfo>& returns, const FunctionAnalysis& analysis)
{
    for (size_t i = 0; i < returns.size() && i < analysis.returnTypes.size(); ++i)
    {
        if (returns[i].type.empty())
            returns[i].type = analysis.returnTypes[i];
    }
}

static std::vector<ReturnInfo> buildReturnsFromAnalysis(const FunctionAnalysis& analysis)
{
    std::vector<ReturnInfo> returns;
    for (const std::string& typeText : analysis.returnTypes)
        returns.push_back({typeText, {}});
    return returns;
}

static void finalizeFunctionDisplay(SymbolTypes& types)
{
    std::ostringstream display;
    display << "(";
    for (size_t i = 0; i < types.params.size(); ++i)
    {
        const ParamInfo& param = types.params[i];
        if (i > 0)
            display << ", ";
        if (!param.type.empty())
            display << param.name << ": " << param.type;
        else
            display << param.name;
    }
    display << ")";

    if (!types.returns.empty())
    {
        display << " -> ";
        for (size_t i = 0; i < types.returns.size(); ++i)
        {
            if (i > 0)
                display << ", ";
            display << (types.returns[i].type.empty() ? "any" : types.returns[i].type);
        }
    }

    types.display = display.str();
}

static Symbol buildSymbol(
    const ParsedDoc& doc,
    const DocBlock& block,
    const Binding* binding,
    const Source& source,
    const std::string& relativePath,
    const ModuleAnalysis* analysis,
    std::vector<Diagnostic>& diagnostics
)
{
    Symbol symbol;
    const TypeTag* typeTag = doc.typeTags.empty() ? nullptr : &doc.typeTags.front();
    std::string within = doc.state.within;
    bool isMethod = false;

    if (typeTag)
    {
        symbol.kind = typeTag->kind;
        symbol.name = typeTag->name;
        isMethod = typeTag->isMethod;
    }
    else if (binding)
    {
        symbol.kind = binding->kind;
        symbol.name = binding->name;
        isMethod = binding->isMethod;
    }

    if (symbol.name.empty() && binding)
        symbol.name = binding->name;

    if (within.empty() && binding)
    {
        if (!typeTag || binding->kind == symbol.kind)
            within = binding->within;
    }

    if (symbol.kind == "function" && symbol.name == "new" && !isMethod && !within.empty())
        symbol.kind = "constructor";

    if (symbol.kind.empty() || symbol.name.empty())
        return symbol;

    if (doc.state.readonly && symbol.kind != "property")
    {
        diagnostics.push_back({
            "warning",
            relativePath,
            block.startLine,
            "@readonly used on non-property symbol.",
        });
    }

    int locationLine = binding ? binding->line : block.startLine;
    symbol.file = relativePath;
    symbol.line = locationLine;
    symbol.column = findColumn(source.lines, locationLine);

    symbol.qualifiedName = buildQualifiedName(within, symbol.name, isMethod);
    symbol.visibility = doc.state.visibility.empty() ? "public" : doc.state.visibility;

    symbol.descriptionMarkdown = joinDescription(doc.descriptionLines, symbol.summary);

    for (const std::string& tag : doc.state.tags)
        symbol.tags.push_back({"tag", tag, false, false, ""});

    if (!doc.state.since.empty())
        symbol.tags.push_back({"since", doc.state.since, false, false, ""});

    if (doc.state.unreleased)
        symbol.tags.push_back({"unreleased", "", true, true, ""});

    if (doc.state.event)
        symbol.tags.push_back({"event", "", true, true, ""});

    for (const std::string& value : doc.state.extends)
        symbol.tags.push_back({"extends", value, false, false, ""});

    if (!doc.state.deprecatedVersion.empty())
    {
        symbol.tags.push_back({
            "deprecated",
            doc.state.deprecatedVersion,
            false,
            false,
            doc.state.deprecatedDescription,
        });
    }

    for (const std::string& realm : doc.state.realms)
        symbol.tags.push_back({realm, "", true, true, ""});

    for (const auto& external : doc.externals)
        symbol.tags.push_back({"external", external.first + " " + external.second, false, false, ""});

    for (const std::string& alias : doc.state.aliases)
        symbol.tags.push_back({"alias", alias, false, false, ""});

    for (const std::string& include : doc.state.includes)
        symbol.tags.push_back({"include", include, false, false, ""});

    for (const std::string& snippet : doc.state.snippets)
        symbol.tags.push_back({"snippet", snippet, false, false, ""});

    if (!doc.state.inheritDoc.empty())
        symbol.tags.push_back({"inheritDoc", doc.state.inheritDoc, false, false, ""});

    std::optional<Luau::TypeId> officialType = resolveSymbolType(analysis, within, symbol.name);

    if (symbol.kind == "function" || symbol.kind == "constructor")
    {
        FunctionAnalysis functionAnalysis;
        if (officialType)
            functionAnalysis = analyzeFunctionType(*officialType, isMethod);

        symbol.types.yields = doc.state.yields;

        if (!doc.params.empty())
        {
            for (const ParamInfo& param : doc.params)
            {
                ParamInfo merged = param;
                if (merged.type.empty() && binding)
                {
                    auto it = std::find_if(binding->params.begin(), binding->params.end(), [&](const ParamInfo& item) {
                        return item.name == param.name;
                    });
                    if (it != binding->params.end())
                        merged.type = it->type;
                }
                symbol.types.params.push_back(merged);
            }
            mergeParamTypesFromAnalysis(symbol.types.params, functionAnalysis);
        }
        else if (binding)
        {
            symbol.types.params = mergeBindingParamsWithAnalysis(*binding, functionAnalysis);
        }
        else if (officialType && !functionAnalysis.paramTypes.empty())
        {
            for (size_t i = 0; i < functionAnalysis.paramTypes.size(); ++i)
            {
                if (i >= functionAnalysis.paramNames.size())
                    break;

                const std::string& paramName = functionAnalysis.paramNames[i];
                if (paramName.empty())
                    continue;

                ParamInfo param;
                param.name = paramName;
                param.type = functionAnalysis.paramTypes[i];
                symbol.types.params.push_back(param);
            }
        }

        if (!doc.returns.empty())
        {
            symbol.types.returns = doc.returns;
            mergeReturnTypesFromAnalysis(symbol.types.returns, functionAnalysis);
        }
        else if (officialType && !functionAnalysis.returnTypes.empty())
        {
            symbol.types.returns = buildReturnsFromAnalysis(functionAnalysis);
        }
        else if (binding && !binding->returnType.empty())
        {
            symbol.types.returns.push_back({binding->returnType, {}});
        }

        symbol.types.errors = doc.errors;

        if (!functionAnalysis.display.empty())
            symbol.types.display = functionAnalysis.display;
        else
            finalizeFunctionDisplay(symbol.types);
    }
    else if (symbol.kind == "property")
    {
        std::string resolvedType = typeTag && !typeTag->type.empty() ? typeTag->type : "";

        if (resolvedType.empty() && officialType)
            resolvedType = toDisplayString(*officialType, false);

        symbol.types.propertyType = resolvedType;
        symbol.types.readonly = doc.state.readonly;
        symbol.types.display = resolvedType;
    }
    else if (symbol.kind == "interface")
    {
        symbol.types.fields = doc.fields;
    }
    else if (symbol.kind == "type")
    {
        if (typeTag && !typeTag->type.empty())
            symbol.types.typeAlias = typeTag->type;
        else if (officialType)
            symbol.types.typeAlias = toDisplayString(*officialType, false);

        symbol.types.display = symbol.types.typeAlias;
    }
    else if (symbol.kind == "class")
    {
        symbol.types.indexName = doc.state.indexName;
    }

    return symbol;
}

static std::vector<Symbol> buildSymbols(
    const ModuleContext& context,
    const ModuleAnalysis* analysis,
    std::vector<Diagnostic>& diagnostics
)
{
    std::vector<Symbol> symbols;
    std::vector<ParsedDoc> docs;
    docs.reserve(context.blocks.size());

    std::vector<std::string> classNames;
    std::string currentClassName;

    for (const DocBlock& block : context.blocks)
    {
        ParsedDoc doc = parseDocBlock(block.contentLines);
        docs.push_back(doc);

        for (const TypeTag& tag : doc.typeTags)
        {
            if (tag.kind == "class" && !tag.name.empty())
            {
                if (std::find(classNames.begin(), classNames.end(), tag.name) == classNames.end())
                    classNames.push_back(tag.name);
            }
        }
    }

    for (size_t index = 0; index < context.blocks.size(); ++index)
    {
        const DocBlock& block = context.blocks[index];

        bool insideTypeTable = false;
        for (const Binding& binding : context.bindings)
        {
            if (binding.typeTableStartLine > 0 && block.startLine >= binding.typeTableStartLine && block.startLine <= binding.typeTableEndLine)
            {
                insideTypeTable = true;
                break;
            }
        }

        if (insideTypeTable)
            continue;

        ParsedDoc doc = docs[index];

        for (const TypeTag& tag : doc.typeTags)
        {
            if (tag.kind == "class" && !tag.name.empty())
                currentClassName = tag.name;
        }

        if (doc.state.within == "~" && !currentClassName.empty())
            doc.state.within = currentClassName;

        const Binding* binding = findBindingAfterLine(context.bindings, block.endLine);

        const TypeTag* typeTag = doc.typeTags.empty() ? nullptr : &doc.typeTags.front();
        std::string inferredKind;
        if (typeTag)
            inferredKind = typeTag->kind;
        else if (binding)
            inferredKind = binding->kind;

        const bool needsWithin = inferredKind == "function" || inferredKind == "property" || inferredKind == "constructor";

        if (doc.state.within.empty() && binding && !binding->within.empty())
            doc.state.within = binding->within;

        if (doc.state.within.empty() && needsWithin && classNames.size() == 1)
            doc.state.within = classNames.front();

        if (doc.state.within.empty() && needsWithin)
        {
            diagnostics.push_back({
                classNames.empty() ? "error" : "warning",
                context.rootRelativePath,
                block.startLine,
                classNames.empty() ? "@class missing for this file." : "@within missing for ambiguous class ownership.",
            });
        }

        Symbol symbol = buildSymbol(doc, block, binding, context.source, context.rootRelativePath, analysis, diagnostics);
        if (symbol.kind.empty())
            continue;

        symbols.push_back(symbol);

        if (symbol.kind == "interface")
        {
            for (const FieldInfo& field : doc.fields)
            {
                if (field.name.empty())
                    continue;

                Symbol fieldSymbol;
                fieldSymbol.kind = "field";
                fieldSymbol.name = field.name;
                fieldSymbol.qualifiedName = symbol.name + "." + field.name;
                fieldSymbol.file = context.rootRelativePath;
                fieldSymbol.line = block.startLine;
                fieldSymbol.column = findColumn(context.source.lines, block.startLine);
                fieldSymbol.summary = field.description;
                fieldSymbol.descriptionMarkdown = field.description;
                fieldSymbol.visibility = symbol.visibility;
                fieldSymbol.types.display = field.type;
                fieldSymbol.types.propertyType = field.type;
                symbols.push_back(fieldSymbol);
            }
        }

        if (symbol.kind == "type" && binding && !binding->typeFields.empty())
        {
            for (const FieldInfo& field : binding->typeFields)
            {
                if (field.name.empty())
                    continue;

                Symbol fieldSymbol;
                fieldSymbol.kind = "field";
                fieldSymbol.name = field.name;
                fieldSymbol.qualifiedName = symbol.name + "." + field.name;
                fieldSymbol.file = context.rootRelativePath;
                fieldSymbol.line = field.line > 0 ? field.line : block.startLine;
                fieldSymbol.column = field.column > 0 ? field.column : findColumn(context.source.lines, block.startLine);
                fieldSymbol.summary = field.description;
                fieldSymbol.descriptionMarkdown = field.description;
                fieldSymbol.visibility = symbol.visibility;
                fieldSymbol.types.display = field.type;
                fieldSymbol.types.propertyType = field.type;
                symbols.push_back(fieldSymbol);
            }
        }

        if (binding && (symbol.kind == "function" || symbol.kind == "constructor") && !doc.params.empty())
        {
            bool hasExplicitParamType = false;
            for (const ParamInfo& param : doc.params)
            {
                if (!param.type.empty() && param.type != "any")
                {
                    hasExplicitParamType = true;
                    break;
                }
            }

            if (hasExplicitParamType)
            {
                std::vector<std::string> docParamNames;
                for (const ParamInfo& param : doc.params)
                    docParamNames.push_back(param.name);

                std::vector<std::string> bindingParamNames;
                for (const ParamInfo& param : binding->params)
                    bindingParamNames.push_back(param.name);

                auto missing = std::vector<std::string>();
                for (const std::string& name : bindingParamNames)
                {
                    if (std::find(docParamNames.begin(), docParamNames.end(), name) == docParamNames.end())
                        missing.push_back(name);
                }

                auto extra = std::vector<std::string>();
                for (const std::string& name : docParamNames)
                {
                    if (std::find(bindingParamNames.begin(), bindingParamNames.end(), name) == bindingParamNames.end())
                        extra.push_back(name);
                }

                if (!missing.empty() || !extra.empty())
                {
                    diagnostics.push_back({
                        "warning",
                        context.rootRelativePath,
                        block.startLine,
                        "@param does not match function parameters.",
                    });
                }
            }
        }
    }

    return symbols;
}


static void applyInheritDocs(std::vector<Symbol>& symbols)
{
    std::unordered_map<std::string, size_t> byQualified;
    for (size_t i = 0; i < symbols.size(); ++i)
        byQualified[symbols[i].qualifiedName] = i;

    for (Symbol& symbol : symbols)
    {
        auto it = std::find_if(symbol.tags.begin(), symbol.tags.end(), [](const TagValue& tag) {
            return tag.name == "inheritDoc" && !tag.value.empty();
        });

        if (it == symbol.tags.end())
            continue;

        auto targetIt = byQualified.find(it->value);
        if (targetIt == byQualified.end())
            continue;

        const Symbol& target = symbols[targetIt->second];

        if (symbol.descriptionMarkdown.empty() && !target.descriptionMarkdown.empty())
        {
            symbol.descriptionMarkdown = target.descriptionMarkdown;
            symbol.summary = target.summary;
        }

        bool onlyInheritTag = symbol.tags.size() == 1 && symbol.tags.front().name == "inheritDoc";
        if ((symbol.tags.empty() || onlyInheritTag) && !target.tags.empty())
            symbol.tags = target.tags;

        if (symbol.types.display.empty() && !target.types.display.empty())
            symbol.types = target.types;
    }
}

static std::unordered_map<std::string, std::string> loadModuleOverrides(const fs::path& rootDir)
{
    fs::path configPath = rootDir / "docs.config.json";
    if (!fs::exists(configPath))
        return {};

    Source source = loadSource(configPath);
    std::string content = source.content;
    size_t pos = content.find("\"moduleIdOverrides\"");
    if (pos == std::string::npos)
        return {};

    size_t brace = content.find("{", pos);
    if (brace == std::string::npos)
        return {};

    size_t depth = 0;
    size_t end = brace;
    for (; end < content.size(); ++end)
    {
        if (content[end] == '{')
            depth++;
        else if (content[end] == '}')
        {
            depth--;
            if (depth == 0)
                break;
        }
    }

    if (end >= content.size())
        return {};

    std::string objectText = content.substr(brace + 1, end - brace - 1);
    std::unordered_map<std::string, std::string> overrides;
    size_t cursor = 0;
    while (cursor < objectText.size())
    {
        size_t keyStart = objectText.find('"', cursor);
        if (keyStart == std::string::npos)
            break;
        size_t keyEnd = objectText.find('"', keyStart + 1);
        if (keyEnd == std::string::npos)
            break;
        std::string key = objectText.substr(keyStart + 1, keyEnd - keyStart - 1);

        size_t valueStart = objectText.find('"', keyEnd + 1);
        if (valueStart == std::string::npos)
            break;
        size_t valueEnd = objectText.find('"', valueStart + 1);
        if (valueEnd == std::string::npos)
            break;
        std::string value = objectText.substr(valueStart + 1, valueEnd - valueStart - 1);

        std::replace(key.begin(), key.end(), '\\', '/');
        overrides[key] = value;
        cursor = valueEnd + 1;
    }

    return overrides;
}

static std::vector<fs::path> collectFiles(const fs::path& rootDir)
{
    std::vector<fs::path> files;
    if (!fs::exists(rootDir))
        return files;

    for (auto& entry : fs::directory_iterator(rootDir))
    {
        fs::path entryPath = entry.path();
        std::string name = entryPath.filename().string();
        if (!name.empty() && name[0] == '.')
            continue;

        if (entry.is_directory())
        {
            if (name == "node_modules")
                continue;
            std::vector<fs::path> nested = collectFiles(entryPath);
            files.insert(files.end(), nested.begin(), nested.end());
            continue;
        }

        std::string ext = entryPath.extension().string();
        if (ext == ".luau" || ext == ".lua")
            files.push_back(entryPath);
    }

    return files;
}

static std::string sha1(const std::string& input)
{
    uint32_t h0 = 0x67452301;
    uint32_t h1 = 0xEFCDAB89;
    uint32_t h2 = 0x98BADCFE;
    uint32_t h3 = 0x10325476;
    uint32_t h4 = 0xC3D2E1F0;

    std::vector<uint8_t> data(input.begin(), input.end());
    uint64_t bitLen = static_cast<uint64_t>(data.size()) * 8;

    data.push_back(0x80);
    while ((data.size() * 8) % 512 != 448)
        data.push_back(0x00);

    for (int i = 7; i >= 0; --i)
        data.push_back(static_cast<uint8_t>((bitLen >> (i * 8)) & 0xff));

    for (size_t chunk = 0; chunk < data.size(); chunk += 64)
    {
        uint32_t w[80] = {0};
        for (int i = 0; i < 16; ++i)
        {
            w[i] = (data[chunk + i * 4 + 0] << 24) |
                   (data[chunk + i * 4 + 1] << 16) |
                   (data[chunk + i * 4 + 2] << 8) |
                   (data[chunk + i * 4 + 3]);
        }
        for (int i = 16; i < 80; ++i)
        {
            uint32_t value = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (value << 1) | (value >> 31);
        }

        uint32_t a = h0;
        uint32_t b = h1;
        uint32_t c = h2;
        uint32_t d = h3;
        uint32_t e = h4;

        for (int i = 0; i < 80; ++i)
        {
            uint32_t f;
            uint32_t k;
            if (i < 20)
            {
                f = (b & c) | ((~b) & d);
                k = 0x5A827999;
            }
            else if (i < 40)
            {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            }
            else if (i < 60)
            {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            }
            else
            {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }

            uint32_t temp = ((a << 5) | (a >> 27)) + f + e + k + w[i];
            e = d;
            d = c;
            c = (b << 30) | (b >> 2);
            b = a;
            a = temp;
        }

        h0 += a;
        h1 += b;
        h2 += c;
        h3 += d;
        h4 += e;
    }

    std::ostringstream out;
    out << std::hex << std::nouppercase;
    out << std::setw(8) << std::setfill('0') << h0;
    out << std::setw(8) << std::setfill('0') << h1;
    out << std::setw(8) << std::setfill('0') << h2;
    out << std::setw(8) << std::setfill('0') << h3;
    out << std::setw(8) << std::setfill('0') << h4;
    return out.str();
}

class JsonWriter
{
public:
    explicit JsonWriter(std::ostream& out)
        : out(out)
    {
    }

    void beginObject()
    {
        writeCommaIfNeeded();
        out << "{";
        pushContext(true);
    }

    void endObject()
    {
        if (contextStack.empty())
            return;
        Context ctx = contextStack.back();
        popContext();
        if (ctx.first)
        {
            out << "}";
            return;
        }
        out << "\n";
        writeIndent();
        out << "}";
    }

    void beginArray()
    {
        writeCommaIfNeeded();
        out << "[";
        pushContext(false);
    }

    void endArray()
    {
        if (contextStack.empty())
            return;
        Context ctx = contextStack.back();
        popContext();
        if (ctx.first)
        {
            out << "]";
            return;
        }
        out << "\n";
        writeIndent();
        out << "]";
    }

    void key(const std::string& name)
    {
        if (!contextStack.empty())
        {
            Context& ctx = contextStack.back();
            if (!ctx.first)
                out << ",";
            ctx.first = false;
        }
        out << "\n";
        writeIndent();
        writeString(name);
        out << ": ";
    }

    void valueString(const std::string& value)
    {
        writeCommaIfNeeded();
        writeString(value);
    }

    void valueNumber(int value)
    {
        writeCommaIfNeeded();
        out << value;
    }

    void valueBool(bool value)
    {
        writeCommaIfNeeded();
        out << (value ? "true" : "false");
    }

    void valueNull()
    {
        writeCommaIfNeeded();
        out << "null";
    }

private:
    struct Context
    {
        bool isObject;
        bool first = true;
    };

    std::ostream& out;
    std::vector<Context> contextStack;

    void pushContext(bool isObject)
    {
        contextStack.push_back({isObject, true});
    }

    void popContext()
    {
        if (!contextStack.empty())
            contextStack.pop_back();
    }

    void writeIndent(int extra = 0)
    {
        size_t total = contextStack.size() + extra;
        for (size_t i = 0; i < total; ++i)
            out << "  ";
    }

    void writeCommaIfNeeded()
    {
        if (contextStack.empty())
            return;
        Context& ctx = contextStack.back();
        if (ctx.isObject)
            return;
        if (!ctx.first)
            out << ",";
        out << "\n";
        writeIndent();
        ctx.first = false;
    }

    void writeString(const std::string& value)
    {
        out << "\"";
        for (char ch : value)
        {
            switch (ch)
            {
            case '\\':
                out << "\\\\";
                break;
            case '"':
                out << "\\\"";
                break;
            case '\n':
                out << "\\n";
                break;
            case '\r':
                out << "\\r";
                break;
            case '\t':
                out << "\\t";
                break;
            default:
                out << ch;
                break;
            }
        }
        out << "\"";
    }
};

static void writeTagArray(JsonWriter& writer, const std::vector<TagValue>& tags)
{
    writer.beginArray();
    for (const TagValue& tag : tags)
    {
        writer.beginObject();
        writer.key("name");
        writer.valueString(tag.name);
        writer.key("value");
        if (tag.hasBool)
            writer.valueBool(tag.boolValue);
        else
            writer.valueString(tag.value);
        if (!tag.description.empty())
        {
            writer.key("description");
            writer.valueString(tag.description);
        }
        writer.endObject();
    }
    writer.endArray();
}

static void writeParams(JsonWriter& writer, const std::vector<ParamInfo>& params)
{
    writer.beginArray();
    for (const ParamInfo& param : params)
    {
        writer.beginObject();
        writer.key("name");
        writer.valueString(param.name);
        writer.key("type");
        if (param.type.empty())
            writer.valueNull();
        else
            writer.valueString(param.type);
        writer.key("description");
        std::string desc;
        if (!param.description.empty())
        {
            for (size_t i = 0; i < param.description.size(); ++i)
            {
                if (i > 0)
                    desc += "\n";
                desc += trim(param.description[i]);
            }
            desc = trim(desc);
        }
        if (desc.empty())
            writer.valueNull();
        else
            writer.valueString(desc);
        writer.endObject();
    }
    writer.endArray();
}

static void writeReturns(JsonWriter& writer, const std::vector<ReturnInfo>& returns)
{
    writer.beginArray();
    for (const ReturnInfo& ret : returns)
    {
        writer.beginObject();
        writer.key("type");
        if (ret.type.empty())
            writer.valueNull();
        else
            writer.valueString(ret.type);
        writer.key("description");
        std::string desc;
        if (!ret.description.empty())
        {
            for (size_t i = 0; i < ret.description.size(); ++i)
            {
                if (i > 0)
                    desc += "\n";
                desc += trim(ret.description[i]);
            }
            desc = trim(desc);
        }
        if (desc.empty())
            writer.valueNull();
        else
            writer.valueString(desc);
        writer.endObject();
    }
    writer.endArray();
}

static void writeErrors(JsonWriter& writer, const std::vector<ErrorInfo>& errors)
{
    writer.beginArray();
    for (const ErrorInfo& err : errors)
    {
        writer.beginObject();
        writer.key("type");
        if (err.type.empty())
            writer.valueNull();
        else
            writer.valueString(err.type);
        writer.key("description");
        std::string desc;
        if (!err.description.empty())
        {
            for (size_t i = 0; i < err.description.size(); ++i)
            {
                if (i > 0)
                    desc += "\n";
                desc += trim(err.description[i]);
            }
            desc = trim(desc);
        }
        if (desc.empty())
            writer.valueNull();
        else
            writer.valueString(desc);
        writer.endObject();
    }
    writer.endArray();
}

static void writeFields(JsonWriter& writer, const std::vector<FieldInfo>& fields)
{
    writer.beginArray();
    for (const FieldInfo& field : fields)
    {
        writer.beginObject();
        writer.key("name");
        writer.valueString(field.name);
        writer.key("type");
        if (field.type.empty())
            writer.valueNull();
        else
            writer.valueString(field.type);
        writer.key("description");
        if (field.description.empty())
            writer.valueNull();
        else
            writer.valueString(field.description);
        writer.endObject();
    }
    writer.endArray();
}

static void writeSymbol(JsonWriter& writer, const Symbol& symbol)
{
    writer.beginObject();
    writer.key("kind");
    writer.valueString(symbol.kind);
    writer.key("name");
    writer.valueString(symbol.name);
    writer.key("qualifiedName");
    writer.valueString(symbol.qualifiedName);
    writer.key("location");
    writer.beginObject();
    writer.key("file");
    writer.valueString(symbol.file);
    writer.key("line");
    writer.valueNumber(symbol.line);
    writer.key("column");
    writer.valueNumber(symbol.column);
    writer.endObject();

    writer.key("docs");
    writer.beginObject();
    writer.key("summary");
    writer.valueString(symbol.summary);
    writer.key("descriptionMarkdown");
    writer.valueString(symbol.descriptionMarkdown);
    writer.key("tags");
    writeTagArray(writer, symbol.tags);
    writer.key("examples");
    writer.beginArray();
    writer.endArray();
    writer.endObject();

    writer.key("types");
    writer.beginObject();
    writer.key("display");
    writer.valueString(symbol.types.display);
    writer.key("structured");
    writer.beginObject();
    if (symbol.kind == "function" || symbol.kind == "constructor")
    {
        writer.key("params");
        writeParams(writer, symbol.types.params);
        writer.key("returns");
        writeReturns(writer, symbol.types.returns);
        writer.key("errors");
        writeErrors(writer, symbol.types.errors);
        writer.key("yields");
        writer.valueBool(symbol.types.yields);
    }
    else if (symbol.kind == "property")
    {
        writer.key("type");
        if (symbol.types.propertyType.empty())
            writer.valueNull();
        else
            writer.valueString(symbol.types.propertyType);
        writer.key("readonly");
        writer.valueBool(symbol.types.readonly);
    }
    else if (symbol.kind == "interface")
    {
        writer.key("fields");
        writeFields(writer, symbol.types.fields);
    }
    else if (symbol.kind == "type")
    {
        writer.key("type");
        if (symbol.types.typeAlias.empty())
            writer.valueNull();
        else
            writer.valueString(symbol.types.typeAlias);
    }
    else if (symbol.kind == "class")
    {
        writer.key("indexName");
        if (symbol.types.indexName.empty())
            writer.valueNull();
        else
            writer.valueString(symbol.types.indexName);
    }
    else if (symbol.kind == "field")
    {
        writer.key("type");
        if (symbol.types.propertyType.empty())
            writer.valueNull();
        else
            writer.valueString(symbol.types.propertyType);
    }
    writer.endObject();
    writer.endObject();

    writer.key("visibility");
    writer.valueString(symbol.visibility);

    writer.endObject();
}

static void writeJsonOutput(
    const std::vector<Module>& modules,
    const std::string& generatorVersion,
    std::ostream& out
)
{
    JsonWriter writer(out);
    writer.beginObject();
    writer.key("schemaVersion");
    writer.valueNumber(1);
    writer.key("generatorVersion");
    writer.valueString(generatorVersion);
    writer.key("luauVersion");
    writer.valueNull();
    writer.key("modules");
    writer.beginArray();
    for (const Module& module : modules)
    {
        writer.beginObject();
        writer.key("id");
        writer.valueString(module.id);
        writer.key("path");
        writer.valueString(module.path);
        writer.key("sourceHash");
        writer.valueString(module.sourceHash);
        writer.key("symbols");
        writer.beginArray();
        for (const Symbol& symbol : module.symbols)
            writeSymbol(writer, symbol);
        writer.endArray();
        writer.endObject();
    }
    writer.endArray();
    writer.endObject();
    out << "\n";
}

static Module generateModule(
    const ModuleContext& context,
    const GeneratorOptions& options,
    const std::unordered_map<std::string, std::string>& moduleOverrides,
    const ModuleAnalysis* analysis,
    std::vector<Diagnostic>& diagnostics
)
{
    (void)options;

    std::vector<Symbol> symbols = buildSymbols(context, analysis, diagnostics);
    applyInheritDocs(symbols);

    std::string moduleId = context.moduleName;
    auto overrideIt = moduleOverrides.find(context.rootRelativePath);
    if (overrideIt != moduleOverrides.end())
        moduleId = overrideIt->second;

    Module module;
    module.id = moduleId;
    module.path = context.rootRelativePath;
    module.sourceHash = sha1(context.source.rawContent);
    module.symbols = std::move(symbols);
    return module;
}

static void printDiagnostics(const std::vector<Diagnostic>& diagnostics)
{
    for (const Diagnostic& diagnostic : diagnostics)
    {
        std::string level = diagnostic.level;
        std::transform(level.begin(), level.end(), level.begin(), [](unsigned char ch) {
            return std::toupper(ch);
        });
        std::cerr << "[luau-docgen] " << level << " " << diagnostic.file << ":" << diagnostic.line << " "
                  << diagnostic.message << "\n";
    }
}

static int runDocgen(const GeneratorOptions& options, const fs::path& outPath, bool failOnWarning)
{
    std::unordered_map<std::string, std::string> overrides = loadModuleOverrides(options.rootDir);

    std::vector<fs::path> files = collectFiles(options.srcDir);
    if (!options.typesDir.empty())
    {
        std::vector<fs::path> typeFiles = collectFiles(options.typesDir);
        files.insert(files.end(), typeFiles.begin(), typeFiles.end());
    }

    std::vector<Diagnostic> diagnostics;
    std::vector<ModuleContext> contexts;
    contexts.reserve(files.size());

    for (const fs::path& filePath : files)
        contexts.push_back(buildModuleContext(filePath, options));

    std::unordered_map<std::string, fs::path> modulePaths;
    modulePaths.reserve(contexts.size());

    for (const ModuleContext& context : contexts)
    {
        auto inserted = modulePaths.emplace(context.moduleName, context.filePath);
        if (!inserted.second)
        {
            diagnostics.push_back({
                "warning",
                context.rootRelativePath,
                1,
                "Duplicate module name detected; official type analysis may be incomplete.",
            });
        }
    }

    DocgenFileResolver fileResolver(contexts);
    DocgenConfigResolver configResolver(options.rootDir, modulePaths);

    Luau::FrontendOptions frontendOptions;
    frontendOptions.retainFullTypeGraphs = true;

    Luau::Frontend frontend(&fileResolver, &configResolver, frontendOptions);
    std::unordered_map<std::string, ModuleAnalysis> analyses = runFrontendAnalysis(frontend, contexts);

    std::vector<Diagnostic> configDiagnostics = configResolver.consumeDiagnostics();
    diagnostics.insert(diagnostics.end(), configDiagnostics.begin(), configDiagnostics.end());

    std::vector<Module> modules;
    modules.reserve(contexts.size());

    for (const ModuleContext& context : contexts)
    {
        const ModuleAnalysis* analysis = nullptr;
        auto it = analyses.find(context.moduleName);
        if (it != analyses.end())
            analysis = &it->second;

        modules.push_back(generateModule(context, options, overrides, analysis, diagnostics));
    }

    fs::create_directories(outPath.parent_path());
    std::ofstream outFile(outPath, std::ios::binary);
    writeJsonOutput(modules, options.generatorVersion, outFile);

    if (!diagnostics.empty())
        printDiagnostics(diagnostics);

    if (failOnWarning && !diagnostics.empty())
        return 1;

    return 0;
}

extern "C" int luau_docgen_run(const LuauDocgenOptions* options)
{
    if (!options)
        return 1;

    GeneratorOptions resolved;
    fs::path rootDir = fs::current_path();

    if (options->root_dir && std::strlen(options->root_dir) > 0)
        rootDir = fs::path(options->root_dir);

    resolved.rootDir = rootDir;
    resolved.generatorVersion = "0.0.0";

    if (options->generator_version && std::strlen(options->generator_version) > 0)
        resolved.generatorVersion = options->generator_version;

    if (options->src_dir && std::strlen(options->src_dir) > 0)
    {
        fs::path srcDir = fs::path(options->src_dir);
        resolved.srcDir = srcDir.is_absolute() ? srcDir : rootDir / srcDir;
    }
    else
    {
        resolved.srcDir = rootDir / "src";
    }

    if (options->types_dir && std::strlen(options->types_dir) > 0)
    {
        fs::path typesDir = fs::path(options->types_dir);
        resolved.typesDir = typesDir.is_absolute() ? typesDir : rootDir / typesDir;
    }

    fs::path outPath = rootDir / "reference.json";
    if (options->out_path && std::strlen(options->out_path) > 0)
    {
        fs::path output = fs::path(options->out_path);
        outPath = output.is_absolute() ? output : rootDir / output;
    }

    bool failOnWarning = options->fail_on_warning != 0;

    return runDocgen(resolved, outPath, failOnWarning);
}
