/**
 * Types for data-middleware.mjs.
 *
 * The pipeline and the endpoint are plain ESM so the Vercel function and the
 * CLI can share them without a build step, but vite.config.ts is type-checked
 * — so the one function it imports is declared here. Same arrangement as
 * scripts/graph-audit.d.mts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export declare function dataMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => Promise<void>;
