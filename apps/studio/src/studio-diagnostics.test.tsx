import type { CompileWarning } from "@strata/dom-runtime";
import { ProjectOperationError } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import {
  appendSessionDiagnostic,
  compileWarningsToDiagnostics,
  createStudioDiagnostic,
  mergeDiagnostics,
  OPERATION_FAILED_CODE,
  operationErrorToDiagnostic,
  type StudioDiagnostic,
} from "./studio-diagnostics";

function diagnostic(overrides: Partial<StudioDiagnostic> = {}): StudioDiagnostic {
  return {
    id: "diagnostic",
    severity: "info",
    source: "structure",
    code: "STRUCTURE_INFO",
    message: "Structure information",
    documentId: "document",
    occurrences: 1,
    ...overrides,
  };
}

describe("studio diagnostics", () => {
  it("creates stable records for Studio-owned structure diagnostics", () => {
    const input = {
      severity: "warning",
      source: "structure",
      code: "STAGE_TARGET_IN_SUBTREE",
      message: "A node cannot move into its own subtree.",
      documentId: "home",
      nodeId: "hero",
    } as const;
    expect(createStudioDiagnostic(input)).toEqual(createStudioDiagnostic(input));
    expect(createStudioDiagnostic(input)).toMatchObject({ ...input, occurrences: 1 });
  });

  it("converts runtime compile warnings with deterministic IDs and locations", () => {
    const warnings: CompileWarning[] = [
      {
        code: "INVALID_ATTRIBUTE",
        message: "The attribute is invalid",
        nodeId: "hero",
        property: "href",
      },
    ];

    const first = compileWarningsToDiagnostics("home", warnings);
    const second = compileWarningsToDiagnostics("home", warnings);

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      severity: "warning",
      source: "runtime",
      code: "INVALID_ATTRIBUTE",
      message: "The attribute is invalid",
      documentId: "home",
      nodeId: "hero",
      property: "href",
      occurrences: 1,
    });
  });

  it("uses a stable fallback code and never exposes an unknown error stack", () => {
    const error = new Error("Could not update the selected node");
    error.stack = "sensitive stack trace";

    const result = operationErrorToDiagnostic(error, {
      documentId: "home",
      operationType: "SetStyle",
      operationIndex: 4,
    });

    expect(result).toMatchObject({
      severity: "error",
      source: "operation",
      code: OPERATION_FAILED_CODE,
      message: "Could not update the selected node",
      documentId: "home",
      operationType: "SetStyle",
      operationIndex: 4,
    });
    expect(result.message).not.toContain("sensitive stack trace");
  });

  it("preserves structured project operation errors and their operation location", () => {
    const error = new ProjectOperationError("UNKNOWN_NODE", "The selected node no longer exists", {
      documentId: "home",
      nodeId: "hero",
      operationType: "SetStyle",
      operationIndex: 0,
    });

    expect(
      operationErrorToDiagnostic(error, {
        documentId: "fallback-document",
        nodeId: "fallback-node",
        operationType: "MoveNode",
        operationIndex: 2,
      }),
    ).toMatchObject({
      severity: "error",
      source: "operation",
      code: "UNKNOWN_NODE",
      message: "The selected node no longer exists",
      documentId: "home",
      nodeId: "hero",
      operationType: "SetStyle",
      operationIndex: 0,
    });
  });

  it("deduplicates groups by stable ID and sorts severity, location, then code", () => {
    const duplicate = diagnostic({ id: "same", code: "DUPLICATE", documentId: "home" });
    const diagnostics = mergeDiagnostics(
      [diagnostic({ id: "warning-b", severity: "warning", code: "B", documentId: "home" })],
      [
        diagnostic({ id: "error-z", severity: "error", code: "Z", documentId: "z" }),
        diagnostic({ id: "error-a", severity: "error", code: "A", documentId: "a" }),
        diagnostic({ id: "warning-a", severity: "warning", code: "A", documentId: "home" }),
        duplicate,
      ],
      [duplicate],
    );

    expect(diagnostics.map((item) => item.id)).toEqual([
      "error-a",
      "error-z",
      "warning-a",
      "warning-b",
      "same",
    ]);
  });

  it("increments repeated session errors and caps distinct diagnostics", () => {
    const first = diagnostic({ id: "repeat", severity: "error", occurrences: 1 });
    const repeated = diagnostic({ id: "repeat", severity: "error", occurrences: 2 });
    const second = diagnostic({ id: "second", severity: "warning" });

    const appended = appendSessionDiagnostic([first], repeated, 2);
    const capped = appendSessionDiagnostic(appended, second, 1);

    expect(appended).toEqual([expect.objectContaining({ id: "repeat", occurrences: 3 })]);
    expect(capped).toEqual([expect.objectContaining({ id: "repeat", occurrences: 3 })]);
  });
});
