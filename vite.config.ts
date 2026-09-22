import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dataMiddleware } from "./scripts/lib/data-middleware.mjs";

/**
 * Serve the live data endpoint locally.
 *
 * In production `/api/data/…` is a Vercel function. Without this plugin it
 * simply does not exist under `vite dev` or `vite preview`, so the browser
 * 404s and quietly falls back to the static snapshot — leaving the code path
 * the deployed site actually takes as the one path never exercised before a
 * deploy. Mounting the same handler in both servers fixes that, and takes the
 * 404 out of the console while it is at it.
 */
function liveData(): PluginOption {
  return {
    name: "tarkov-live-data",
    configureServer(server) {
      server.middlewares.use(dataMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(dataMiddleware());
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), liveData()],
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
