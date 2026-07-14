import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const siteExtension = process.env.MEMEX_SITE_EXTENSION
  ? path.resolve(process.env.MEMEX_SITE_EXTENSION)
  : path.resolve(__dirname, "./src/default-site-extension.ts");
const siteTitle = process.env.MEMEX_SITE_TITLE || "Memex";
const siteDescription = process.env.MEMEX_SITE_DESCRIPTION || "A local-first knowledge base for people and agents.";
const siteThemeColor = process.env.MEMEX_SITE_THEME_COLOR || "#f8f8f5";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "memex-site-metadata",
      transformIndexHtml(html) {
        return html
          .replace("<title>Memex</title>", `<title>${siteTitle}</title>`)
          .replace("</head>", `    <meta name="description" content="${siteDescription}" />\n    <meta name="theme-color" content="${siteThemeColor}" />\n    <meta property="og:title" content="${siteTitle}" />\n    <meta property="og:description" content="${siteDescription}" />\n    <meta property="og:type" content="website" />\n  </head>`);
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@memex/site": path.resolve(__dirname, "./src/site-api.ts"),
      "@memex/site-extension": siteExtension
    },
    dedupe: ["react", "react-dom"]
  },
  server: {
    fs: {
      allow: [__dirname, path.dirname(siteExtension)]
    }
  },
  build: {
    outDir: process.env.MEMEX_WEB_OUT_DIR || "../internal/web/dist",
    emptyOutDir: true
  }
});
