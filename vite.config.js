import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
    assetsDir: "assets",
    assetsInclude: ["README.md"],
    assetsInclude: ["**/*.ttf"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  envPrefix: "VITE_",
});
