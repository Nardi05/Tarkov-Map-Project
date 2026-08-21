/**
 * Types for the audit, which is written as plain ESM so `npm run audit-graph`
 * needs no build step. The test imports it, and a report full of `any` would
 * make the assertions in there worth very little.
 */
export interface GraphTaskRef {
  id: string;
  name: string;
}

export interface GraphAuditReport {
  tasks: number;
  edges: number;
  wikiEdges: number;
  withPrereq: number;
  ungated: number;
  dangling: { id: string; name: string; missing: string }[];
  selfReferences: GraphTaskRef[];
  unsatisfiable: { id: string; name: string; status: string[] }[];
  cycles: string[][];
  /** Reachable, but only by declaring a failure the graph branches on. */
  behindAFailure: GraphTaskRef[];
  /** Reachable by nobody, however they play. */
  stranded: GraphTaskRef[];
  chainDepth: number;
  waveSizes: number[];
  levelInversions: {
    id: string;
    name: string;
    level: number;
    after: string;
    afterLevel: number;
  }[];
  openers: number;
  openersByTrader: Record<string, string[]>;
  noTrader: string[];
  duplicates: { mode: string; name: string; ids: string[] }[];
  kappa: number;
  kappaStranded: GraphTaskRef[];
  degraded: boolean;
  generated: string | null;
}

export function auditGraph(graph: unknown): GraphAuditReport;
export function formatReport(report: GraphAuditReport): string;
export function displayName(name: string): string;
export function zoneOf(name: string): "pvp" | "pve" | "season" | null;
export function satisfiable(
  requirement: { status: string[] },
  options?: { allowFailures?: boolean },
): boolean;
export function reachable(
  tasks: Record<string, unknown>,
  options?: { allowFailures?: boolean },
): { done: Set<string>; waves: string[][]; stranded: string[] };
export function findCycles(tasks: Record<string, unknown>): string[][];
