import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/*
 * Whether this build is going to Vercel, which is the only host where the
 * analytics beacon has an endpoint to talk to.
 *
 * Vercel sets VERCEL=1 in the build environment. Vite only forwards variables
 * it is told about, so it is read here and compiled in — without it,
 * `inject()` requests /_vercel/insights/script.js everywhere, which is a 404
 * and a console error under `npm run preview` and on any static host.
 */
const onVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

export default defineConfig({
  base: "./",
  define: {
    __ANALYTICS__: JSON.stringify(onVercel),
  },
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
