import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/ui"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
  },
  server: {
    port: 6969,
    proxy: {
      "/api": {
        target: "http://localhost:6969",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
