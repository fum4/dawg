module.exports = {
  patterns: [
    // Watch compiled electron files
    "dist/electron/**/*.js",
    // Watch compiled backend (for when it changes server behavior)
    "dist/*.js",
    "dist/cli/**/*.js",
  ],
  ignore: [
    // Don't watch UI files - they have their own HMR
    "dist/ui/**",
    "dist/shell/**",
    // Don't watch source files - we watch compiled output
    "src/**",
    "electron/**/*.ts",
    // Don't watch node_modules
    "node_modules/**",
  ],
};
