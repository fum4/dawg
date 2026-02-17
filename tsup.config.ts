import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts", "src/electron-entry.ts"],
  format: "esm",
  external: ["node-pty", "electron"],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      ".md": "text",
    };
  },
});
