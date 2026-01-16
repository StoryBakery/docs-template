const path = require("path");

module.exports = {
  title: "StoryBakery Docs Template Test",
  url: "https://example.invalid",
  baseUrl: "/",
  organizationName: "storybakery",
  projectName: "docs-template",
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
        moonwave: {
          source: true,
          labels: {
            referenceType: "Engine Class",
          },
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
      title: "Docs Template Test",
      items: [
        { type: "docSidebar", sidebarId: "manual", label: "Manual" },
        { type: "docSidebar", sidebarId: "reference", label: "Reference" },
      ],
    },
  },
};
