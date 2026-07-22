# Operation Protocol v0.1

Status: M1.1 implementation contract

## Objective

Every durable edit to a Strata project is expressed as an operation. The Stage, Inspector,
Blueprint, importer, code transformation, and Agent may create operations, but only the project
reducer applies them.

This boundary provides deterministic history, reviewable Agent changes, serialization, testing,
and a future collaboration path.

## Reducer operation shape

```ts
interface OperationMeta {
  source?: "human" | "stage" | "inspector" | "blueprint" | "agent" | "import";
  documentId?: string;
  transactionId?: string;
}

type StrataOperation = OperationMeta & OperationSpecificFields;
```

Operation-specific fields are flat in v0.1 so producers and tests can construct operations without
an adapter. A missing `documentId` resolves to the active document when applied. The generated
inverse always stores the resolved document ID, so changing the active page before Undo cannot
redirect history to another document.

Persistent history and Agent proposals will wrap reducer operations with operation IDs, timestamps,
labels, and project identity at the application layer. Those envelope fields do not affect reducer
semantics.

## Node operations

### InsertNode

Payload includes the complete new node, target parent or root placement, and index. Application
rejects duplicate IDs, nonexistent parents, incompatible parent/child relationships known to the
core, and out-of-range indices.

Its inverse is `RemoveNode` with the exact inserted subtree snapshot.

### RemoveNode

M1.1 removes the selected node and its subtree. The reducer captures the full normalized subtree,
original parent/root location, and index for exact inversion.

Its inverse restores every node and original order. No external references are silently rewritten;
reference validation may report them separately.

### MoveNode

Payload identifies the node, new parent or document root, and index. The reducer rejects movement
inside the node's own subtree. Its inverse stores the exact old parent/root and index.

Indices are defined against the destination list after the node has been detached, eliminating
same-parent off-by-one ambiguity.

## Value operations

### SetContent

Sets or clears the node's authored content value. The inverse restores whether the field was absent
and, if present, its exact previous `StrataValue`.

### SetAttribute and RemoveAttribute

Set writes one typed attribute. Remove deletes the map entry rather than replacing it with `unset`.
Inversion preserves the prior absence/value distinction.

### SetStyle

Sets or removes one property under one exact `StyleScope`. Removing the final property may remove
the empty rule. Inversion restores prior rule existence, property value, and rule ordering when
ordering is observable in serialized output.

### SetAccessibility

Updates role or one authored ARIA field without replacing unrelated accessibility data.

### BindInteraction

Adds, replaces, or removes the single binding for an event. Every binding also has a stable ID, and
both binding IDs and event names are unique per node. Inversion restores the prior value.

## Transactions

The headless M1.1 API is
`applyTransaction(project, operations) -> { project, inverseOperations }`. The editor-level history
record will later add transaction ID, label, source, and timestamps around this result.

A transaction is the user-visible undo boundary. Examples include a drag gesture producing several
style changes or an Agent plan inserting and configuring several nodes.

Application rules:

1. operations execute in order against immutable intermediate projects;
2. the input project is never mutated;
3. failure stops the transaction and returns no partially committed project;
4. inverses are recorded from actual pre-operation state;
5. undo applies inverses in reverse order;
6. redo reapplies original operations to the current compatible state;
7. transaction results are schema-valid and satisfy tree invariants.

The first in-memory implementation does not need distributed conflict resolution. It must keep the
protocol serializable enough for later collaboration metadata.

## Agent review contract

An Agent returns a proposed transaction rather than a replacement HTML document. The editor may:

```text
validate -> summarize -> preview -> apply -> undo
```

Preview applies the transaction to an isolated project snapshot. Rejecting a proposal leaves the
live project unchanged.

## Error model

M1.1 rejects malformed operations with Zod validation errors or actionable reducer errors. Missing
targets, duplicate IDs, invalid indices, cycles, and invariant violations never produce a partial
result. Stable error codes and the failing transaction index are required before the Problems panel
or remote Agent bridge consumes this API.

Do not use silent no-ops for malformed operations. An explicitly idempotent future operation may
declare that behavior in its contract.

## Required tests

- every operation leaves its input object unchanged;
- apply then inverse restores deep equality;
- subtree deletion restores order and content exactly;
- same-parent and cross-parent moves have unambiguous indices;
- invalid cycles and duplicate IDs fail without partial mutation;
- absent, unset, and authored values remain distinct through undo;
- scoped styles do not leak between breakpoints or states;
- multi-operation transactions undo in reverse order;
- failure in the middle of a transaction does not expose partial state;
- equivalent Inspector and Agent operations produce equivalent projects.
