const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const expectedFiles = [
  path.join(rootDir, "docs", "reference", "index.mdx"),
  path.join(rootDir, "docs", "reference", "example.mdx"),
];

let hasError = false;

expectedFiles.forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    console.error(`[test] missing generated file: ${filePath}`);
    hasError = true;
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("# Reference") && filePath.endsWith("index.mdx")) {
    console.error(`[test] reference index missing title: ${filePath}`);
    hasError = true;
  }
  if (
    !content.includes("# Example") &&
    !content.includes(">Example</h1>") &&
    filePath.endsWith("example.mdx")
  ) {
    console.error(`[test] example doc missing title: ${filePath}`);
    hasError = true;
  }
  if (filePath.endsWith("example.mdx")) {
    if (!content.includes("## Events")) {
      console.error(`[test] example doc missing Events section: ${filePath}`);
      hasError = true;
    }
    if (!content.includes("View Source")) {
      console.error(`[test] example doc missing source links: ${filePath}`);
      hasError = true;
    }
  }
});

if (hasError) {
  process.exit(1);
}

console.log("[test] generated reference docs verified.");
