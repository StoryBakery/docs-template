const path = require('path');

module.exports = function storybakeryDocsTheme() {
  return {
    name: 'storybakery-docs-theme',
    getThemePath() {
      return path.resolve(__dirname, 'theme');
    },
    getClientModules() {
      return [path.resolve(__dirname, 'css/theme.css')];
    },
  };
};
