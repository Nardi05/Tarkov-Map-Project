import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["leaflet", "react", "react-dom", "zustand"],
  },
  build: {
    target: "es2020",
    cssMinify: "lightningcss",
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ["leaflet"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
