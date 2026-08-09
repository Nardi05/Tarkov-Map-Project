import { next } from "@vercel/functions";

// Avoids pulling the full @types/node package into the project just for this
// one file — @types/node's ambient globals would otherwise shadow the DOM
// lib types (fetch, Request, Headers, ...) the rest of the app relies on.
declare const process: { env: Record<string, string | undefined> };

/**
 * Vercel Routing Middleware (https://vercel.com/docs/routing-middleware) runs
 * ahead of every request to this project — including the built static
 * assets — which makes it the one free mechanism that can gate a whole
 * deployment rather than just its HTML shell. Vercel's own Password
 * Protection does the same job but is an Enterprise/paid-add-on feature; this
 * is the equivalent built by hand for a personal project's free tier.
 *
 * No `matcher` export: it deliberately runs on every path, so nothing —
 * not `/data/*.json`, not the JS bundle — is reachable without the password.
 *
 * To go public later: set SITE_PRIVATE=false in the Vercel dashboard and
 * redeploy. No code change needed.
 */

const COOKIE = "tk_auth";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function loginPage(error?: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Tarkov Maps — private preview</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0a0d11; color: #e6edf3;
    font: 15px/1.4 -apple-system, system-ui, "Segoe UI", sans-serif;
  }
  form {
    width: min(20rem, calc(100vw - 2.5rem)); padding: 1.5rem;
    background: #10151b; border: 1px solid #232e3a; border-radius: 12px;
  }
  h1 { margin: 0 0 0.35rem; font-size: 1rem; font-weight: 600; }
  p { margin: 0 0 1rem; color: #96a3b2; font-size: 0.8125rem; }
  input {
    width: 100%; padding: 0.55rem 0.7rem; margin-bottom: 0.8rem;
    background: #161e26; border: 1px solid #232e3a; border-radius: 9px;
    color: inherit; font-size: 0.875rem;
  }
  input:focus { outline: 2px solid #c9b287; outline-offset: 1px; }
  button {
    width: 100%; padding: 0.6rem; border: none; border-radius: 9px;
    background: #c9b287; color: #14100a; font-weight: 600; cursor: pointer;
  }
  .error { color: #f87171; font-size: 0.8125rem; margin: -0.4rem 0 0.8rem; }
</style>
</head>
<body>
  <form method="POST">
    <h1>Tarkov Maps</h1>
    <p>This preview is private. Enter the password to continue.</p>
    ${error ? `<p class="error">${error}</p>` : ""}
    <input type="password" name="password" autofocus autocomplete="current-password" />
    <button type="submit">Enter</button>
  </form>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export default async function middleware(request: Request): Promise<Response> {
  // Flip SITE_PRIVATE=false in the Vercel dashboard to open the site up —
  // no redeploy of code required, just a redeploy to pick up the env change.
  if (process.env.SITE_PRIVATE === "false") return next();

  const password = process.env.SITE_PASSWORD;
  // No password configured yet: fail closed rather than accidentally public.
  if (!password) {
    return new Response("Site is private and no password is configured yet.", { status: 503 });
  }

  const expected = await sha256Hex(password);

  if (readCookie(request, COOKIE) === expected) return next();

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const attempt = form?.get("password");
    if (typeof attempt === "string" && attempt === password) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          // Session cookie (no Max-Age) — closing the browser re-locks it,
          // which suits a private dev preview better than staying open forever.
          "Set-Cookie": `${COOKIE}=${expected}; Path=/; HttpOnly; Secure; SameSite=Strict`,
        },
      });
    }
    return loginPage("Wrong password.");
  }

  return loginPage();
}
