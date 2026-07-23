import type { CompileWarning } from "@strata/dom-runtime";
import { isProjectOperationError, type ProjectOperationError } from "@strata/project-model";

export const DIAGNOSTIC_SEVERITIES = ["error", "warning", "info"] as const;
export type StudioDiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_SOURCES = ["runtime", "operation", "structure"] as const;
export type StudioDiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

/** A UI-ready problem record. Its ID identifies the underlying problem, not an individual report. */
export interface StudioDiagnostic {
  id: string;
  severity: StudioDiagnosticSeverity;
  source: StudioDiagnosticSource;
  code: string;
  message: string;
  documentId: string;
  nodeId?: string;
  property?: string;
  operationType?: string;
  operationIndex?: number;
  occurrences: number;
}

export interface OperationDiagnosticContext {
  documentId: string;
  nodeId?: string;
  operationType?: string;
  operationIndex?: number;
}

export const OPERATION_FAILED_CODE = "OPERATION_FAILED";
export const DEFAULT_SESSION_DIAGNOSTIC_LIMIT = 100;

const severityOrder: Record<StudioDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function idPart(value: string | number | undefined): string {
  if (value === undefined) return "u";
  const text = String(value);
  return `s${text.length}:${text}`;
}

function createDiagnosticId(diagnostic: Omit<StudioDiagnostic, "id" | "occurrences">): string {
  return [
    diagnostic.source,
    diagnostic.documentId,
    diagnostic.nodeId,
    diagnostic.property,
    diagnostic.operationType,
    diagnostic.operationIndex,
    diagnostic.code,
  ]
    .map(idPart)
    .join("|");
}

function withId(diagnostic: Omit<StudioDiagnostic, "id" | "occurrences">): StudioDiagnostic {
  return { ...diagnostic, id: createDiagnosticId(diagnostic), occurrences: 1 };
}

/** Creates a deterministic problem record for Studio-owned validators and gesture boundaries. */
export function createStudioDiagnostic(
  diagnostic: Omit<StudioDiagnostic, "id" | "occurrences">,
): StudioDiagnostic {
  return withId(diagnostic);
}

/** Converts deterministic compiler warnings into Problems records for one document. */
export function compileWarningsToDiagnostics(
  documentId: string,
  warnings: readonly CompileWarning[],
): StudioDiagnostic[] {
  return warnings.map((warning) =>
    withId({
      severity: "warning",
      source: "runtime",
      code: warning.code,
      message: warning.message,
      documentId,
      ...(warning.nodeId === undefined ? {} : { nodeId: warning.nodeId }),
      ...(warning.property === undefined ? {} : { property: warning.property }),
    }),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The operation could not be completed.";
}

function errorContext(
  error: ProjectOperationError,
  fallback: OperationDiagnosticContext,
): OperationDiagnosticContext {
  return {
    documentId: error.documentId ?? fallback.documentId,
    ...((error.nodeId ?? fallback.nodeId) ? { nodeId: error.nodeId ?? fallback.nodeId } : {}),
    ...((error.operationType ?? fallback.operationType)
      ? { operationType: error.operationType ?? fallback.operationType }
      : {}),
    ...((error.operationIndex ?? fallback.operationIndex) !== undefined
      ? { operationIndex: error.operationIndex ?? fallback.operationIndex }
      : {}),
  };
}

/**
 * Makes an operation failure safe to display. Unknown errors deliberately expose no stack trace.
 */
export function operationErrorToDiagnostic(
  error: unknown,
  fallback: OperationDiagnosticContext,
): StudioDiagnostic {
  if (isProjectOperationError(error)) {
    const context = errorContext(error, fallback);
    return withId({
      severity: "error",
      source: "operation",
      code: error.code,
      message: error.message,
      ...context,
    });
  }

  return withId({
    severity: "error",
    source: "operation",
    code: OPERATION_FAILED_CODE,
    message: errorMessage(error),
    ...fallback,
  });
}

function compareOptionalString(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

function compareOptionalNumber(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

/** Orders diagnostics by severity, location, code, and stable tie-breakers. */
export function compareDiagnostics(a: StudioDiagnostic, b: StudioDiagnostic): number {
  const severity = severityOrder[a.severity] - severityOrder[b.severity];
  if (severity !== 0) return severity;

  const documentId = compareOptionalString(a.documentId, b.documentId);
  if (documentId !== 0) return documentId;
  const nodeId = compareOptionalString(a.nodeId, b.nodeId);
  if (nodeId !== 0) return nodeId;
  const property = compareOptionalString(a.property, b.property);
  if (property !== 0) return property;
  const operationIndex = compareOptionalNumber(a.operationIndex, b.operationIndex);
  if (operationIndex !== 0) return operationIndex;
  const operationType = compareOptionalString(a.operationType, b.operationType);
  if (operationType !== 0) return operationType;
  const code = compareOptionalString(a.code, b.code);
  if (code !== 0) return code;
  const message = compareOptionalString(a.message, b.message);
  if (message !== 0) return message;
  return compareOptionalString(a.id, b.id);
}

export function sortDiagnostics(diagnostics: readonly StudioDiagnostic[]): StudioDiagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}

/** Merges diagnostic groups, retaining the first record for each stable problem ID. */
export function mergeDiagnostics(
  ...groups: ReadonlyArray<readonly StudioDiagnostic[]>
): StudioDiagnostic[] {
  const byId = new Map<string, StudioDiagnostic>();
  for (const group of groups)
    for (const diagnostic of group)
      if (!byId.has(diagnostic.id)) byId.set(diagnostic.id, diagnostic);
  return sortDiagnostics([...byId.values()]);
}

function normalizedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_SESSION_DIAGNOSTIC_LIMIT;
  return Math.max(0, Math.floor(limit));
}

/**
 * Adds one problem to a session list. Repeated reports increment occurrences without growing the
 * list; distinct problems are capped after deterministic sorting.
 */
export function appendSessionDiagnostic(
  diagnostics: readonly StudioDiagnostic[],
  diagnostic: StudioDiagnostic,
  limit = DEFAULT_SESSION_DIAGNOSTIC_LIMIT,
): StudioDiagnostic[] {
  const existing = diagnostics.find((candidate) => candidate.id === diagnostic.id);
  const next = existing
    ? diagnostics.map((candidate) =>
        candidate.id === diagnostic.id
          ? { ...candidate, occurrences: candidate.occurrences + diagnostic.occurrences }
          : candidate,
      )
    : [...diagnostics, diagnostic];
  return sortDiagnostics(next).slice(0, normalizedLimit(limit));
}
