import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // Bind IPv4 and IPv6. Vite's default is localhost, which on some macOS
  // setups is IPv6-only — curl 127.0.0.1 and Playwright then miss the server.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
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
