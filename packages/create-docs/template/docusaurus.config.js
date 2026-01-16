const path = require("path");

module.exports = {
  title: "Project Docs",
  url: "https://example.invalid",
  baseUrl: "/",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  presets: [
    [
      "@storybakery/docs-preset",
      {
        docs: {
          path: "docs",
          routeBasePath: "/",
          sidebarPath: path.resolve(__dirname, "sidebars.js"),
        },
        theme: {
          customCss: path.resolve(__dirname, "src/css/custom.css"),
        },
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Project Docs",
      items: [
        { type: "docSidebar", sidebarId: "manual", label: "Manual" },
        { type: "docSidebar", sidebarId: "reference", label: "Reference" },
      ],
    },
  },
};
