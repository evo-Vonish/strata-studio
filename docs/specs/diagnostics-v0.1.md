# Studio Diagnostics v0.1

Last updated: 2026-07-23

Status: implemented M1.2 diagnostics and Reference Integrity Problems slices

## Objective

Problems is the Studio's current, actionable view of rendering and edit failures. It is a
projection of the canonical Project Model and the current editor session; it is not persisted
project data, a second validation store, or an undoable operation.

This slice surfaces deterministic DOM Runtime warnings and failures at operation and structure
boundaries. Reference Integrity v0.1 adds the required blocked-command behavior: external typed
node references, invalid authored DOM IDs, and ambiguous authored DOM IDs must become actionable
Problems records. Imported-root migration, cross-document navigation, and property-level Inspector
focus remain outside this slice.

## `StudioDiagnostic` contract

The Studio normalizes all displayed records to this UI-facing shape:

```ts
type StudioDiagnosticSeverity = "error" | "warning" | "info";
type StudioDiagnosticSource = "runtime" | "operation" | "structure";

interface StudioDiagnostic {
  id: string;
  severity: StudioDiagnosticSeverity;
  source: StudioDiagnosticSource;
  code: string;
  message: string;
  documentId: string;
  nodeId?: string;
  relatedNodeId?: string;
  property?: string;
  operationType?: string;
  operationIndex?: number;
  occurrences: number;
}
```

`id` identifies the underlying problem rather than an individual report. It is deterministic from
the source, primary and related location, operation context, and code. Equal session reports are grouped and increment
`occurrences`; distinct session diagnostics are capped at 100 records. The merged list is stable:
errors, then warnings, then informational records; ties sort by document, node, related node, property,
operation position/type, code, message, and ID.

Runtime compiler warnings are normalized with `source: "runtime"` and `severity: "warning"` while
preserving the DOM Runtime warning code, message, `nodeId`, and `property`. Reducer failures use
`source: "operation"` and `severity: "error"`; Studio-owned placement and structure rejections use
`source: "structure"` and the appropriate warning or error severity. Unknown thrown values are
displayed as `OPERATION_FAILED` without a stack trace.

## Project operation errors

`@strata/project-model` exposes `ProjectOperationError`, with stable machine-readable codes:

```text
INVALID_PROJECT       INVALID_OPERATION      UNKNOWN_DOCUMENT
UNKNOWN_NODE          INVALID_INDEX          DUPLICATE_ID
INVALID_SUBTREE       LAST_ROOT              CYCLE
INVALID_TAG_TARGET    BINDING_MISMATCH       EXTERNAL_NODE_REFERENCE
INVARIANT_FAILURE
```

The error may carry `operationType`, resolved `documentId`, `nodeId`, and `operationIndex`.
`applyTransaction` reports the first failing operation with a zero-based `operationIndex`; it does
not expose a partially committed project or history entry. The Studio retains this context in the
corresponding `StudioDiagnostic` so an error can be understood and located without parsing a prose
message.

## Lifetimes and recovery

There are two diagnostic lifetimes:

1. **Runtime-derived diagnostics** are recalculated from the active document's compilation on every
   Project Model change, including Undo and Redo. When the model no longer produces a warning, its
   Problems record and count disappear automatically.
2. **Session diagnostics** are created for failed operations and Studio structure/placement
   boundaries. They are in-memory only: they are not stored in the project, local storage, inverse
   history, or exports. A successful model transaction clears the session list, while a failed
   transaction leaves project, history, and selection unchanged. The Problems clear action can also
   clear only session diagnostics; it cannot dismiss an active runtime warning.

An invalid/no-op drop never creates history. A rejected placement can be reported as a structure
warning; a reducer failure becomes an operation error. Repeated equal failures group rather than
flooding the list.

## Problems user experience and accessibility

The bottom panel exposes Operations, Console, and Problems as tabs. The Problems badge and the
status-bar Problems control use the merged diagnostic count; errors receive error styling, warnings
receive warning styling, and zero uses the ready/check state. Selecting the status-bar control
opens the bottom panel and selects Problems. New warnings do not steal focus or automatically open
the panel.

The tab controls use `tablist` / `tab` / `tabpanel` semantics with `aria-selected` and
`aria-controls`. The list exposes its count to assistive technology. Each row presents, in order:

1. severity icon and concise message;
2. stable code plus source and location (`node name · #nodeId`, document, and optional property),
   followed by operation type and a one-based human-readable transaction step when available;
3. an explicitly labelled Locate control.

Locate is available only when the diagnostic node still exists in the active document. It selects
the canonical node, switches to Stage, and refreshes the projected selection/overlay and Details
when the iframe projection is available. It leaves Problems open. If the node has been removed, or
belongs to another document, Locate is disabled and the row says that the location is unavailable;
the Studio never silently substitutes the page root. Property-level focus and cross-document
navigation are deferred.

The zero state says that the active project has no current runtime warnings or session failures. It
does not claim to prove every future validation domain.

### Reference Integrity command failures

When a delete or duplicate is blocked by [Reference Integrity v0.1](reference-integrity-v0.1.md),
Problems identifies every **source** node and property/path. Locate selects that surviving source,
not the deletion target or a substituted page root; `relatedNodeId` labels the target separately.
`EXTERNAL_NODE_REFERENCE`, `EXTERNAL_DOM_ID_REFERENCE`, `INVALID_AUTHORED_DOM_ID`, and
`DUPLICATE_AUTHORED_DOM_ID` are session-only error records: no project or history entry exists for
the rejected command. A force-delete control is intentionally absent.

## Compile once, then build the inert Stage shell

`compileDocument(project, documentId)` yields HTML, CSS, and warnings once per active project
render. Studio passes that same `CompiledDocument` to
`buildStageDocumentFromCompiled(compiled, { title })` for the iframe `srcDoc`; it also derives
runtime diagnostics from `compiled.warnings`. This avoids compiling the document twice while
retaining the existing `buildStageDocument(project, documentId, options)` compatibility API.

`buildStageDocumentFromCompiled` only wraps a deterministic compilation produced by this runtime.
It preserves the Stage shell's restrictive CSP (including `script-src 'none'`, `connect-src 'none'`,
blocked frames, objects, form actions, and base changes) and the Studio iframe remains
`sandbox="allow-same-origin"` without script permission. Compiler sanitization remains the source
of the HTML/CSS passed to the shell; Problems must not weaken the preview boundary.

## Deferred scope

- explicit migration or diagnostics for imported documents without a valid Box page root;
- cross-document diagnostic navigation and property-specific Inspector focus;
- persistent/dismissible diagnostics, Console aggregation, and diagnostic export;
- compiler exception recovery/error-boundary UX beyond model-valid runtime warnings;
- keyboard Stage drop-target picking, Flex/Grid-axis placement, auto-scroll, and drag ghosts.
