import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    outDir: process.env.MEMEX_WEB_OUT_DIR || "../internal/web/dist",
    emptyOutDir: true
  }
});
