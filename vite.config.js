import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  // Ensures public folder is included correctly
  publicDir: "public",

  // Output settings for production
  build: {
    outDir: "dist", // Output folder for production build
    rollupOptions: {
      // Specify manual chunks if you need more control over file splitting
    },
  },

  // Resolve alias for easier imports in your src folder
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // Allows importing files with @ shortcut from src folder
    },
  },

  // Use environment variables, excluding .env in production
  envPrefix: "VITE_", // Only .env variables starting with VITE_ will be exposed to your code
});
