import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { inject } from "@vercel/analytics";
import App from "./App";
import "./styles.css";

/*
 * Analytics only where the endpoint it posts to exists.
 *
 * `inject()` unconditionally requests /_vercel/insights/script.js, which is a
 * 404 and a console error everywhere the site is not served by Vercel —
 * `npm run preview`, a static host, a fork someone cloned. The build is a
 * plain directory of files meant to run anywhere, so the decision is made at
 * build time from Vercel's own environment variable rather than guessed from
 * the hostname, which would be wrong on a custom domain. See vite.config.ts.
 */
declare const __ANALYTICS__: boolean;
if (__ANALYTICS__) inject();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
