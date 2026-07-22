# Stage Structure Authoring v0.1

Status: insertion and hierarchy-command slices implemented

This specification defines how the Studio creates, places, reorders, reparents, duplicates, and
deletes the five initial primitive elements without making the rendered DOM authoritative.

## Implemented insertion loop

1. Open **Add element** from the Navigator header or Command Palette.
2. Search the Property Registry-backed list of Box, Text, Button, Image, and Input primitives.
3. Choose Before, Inside, or After relative to the current model selection.
4. Create one schema-valid node and submit one explicit `InsertNode` operation.
5. Re-render the hierarchy and sandboxed Stage from the resulting Project Model.
6. Select the inserted node and edit it through the schema Inspector.
7. Undo or redo the transaction with the same node ID, defaults, parent, and sibling index.

The editor never inserts directly into the iframe DOM.

## Primitive creation contract

The Studio element factory layers visible starter presets on the Property Registry:

- the Registry remains authoritative for element type and default semantic tag;
- the factory supplies schema-valid editor names, content, attributes, and base styles;
- Button always starts with `type="button"` and visible text;
- Input starts as a text field;
- Image uses an inert inline placeholder until the user chooses an asset or URL;
- Box has a visible minimum height so an empty container can be selected;
- every result passes `strataNodeSchema` before it reaches an operation.

The factory is the current canonical Studio primitive creator. Importers and future component
factories may provide different presets, but they must output the same Project Model node contract.

## Stable identity

New nodes receive a type-prefixed opaque UUID with a final collision check against the active
document. IDs are generated once when the forward transaction is created. Redo reuses that original
node snapshot and ID.

Do not allocate the smallest available numeric suffix. Reusing an ID released by `RemoveNode` can
make a later Undo conflict with the older subtree that originally owned the ID.

## Placement rules

The insertion target is recomputed from the latest Project Model when the user commits, rather than
when the panel first opens.

| Placement | Parent | Index |
| --- | --- | --- |
| no or stale selection | protected page root | append to its `children` |
| Before | selected node's current parent | selected sibling index |
| After | selected node's current parent | selected sibling index + 1 |
| Inside | selected node | append to `children` |

Every forward insertion includes an explicit `documentId`, even when it equals the active document.
This keeps redo pinned to the authored document if the active page later changes.

Before and After are unavailable for every page-level root. Studio-authored insertion never adds a
new entry to `rootNodeIds`; it creates content inside the page container. An invalid or non-Box
first root fails explicitly rather than receiving a silent wrapper that could change imported DOM
or CSS fidelity.

## Page-root policy

The Studio treats `document.rootNodeIds[0]` as the protected page-root sentinel:

- a Studio-created document starts with one Box root, even when the visible page is otherwise empty;
- the sentinel remains at index zero and cannot be moved, deleted, duplicated, indented, outdented,
  or given a sibling through Add Element;
- the sentinel's properties and styles remain editable; it is not represented by `editor.locked`;
- direct children cannot outdent, because that would create another page-level root;
- additional roots loaded from an older project are a legacy normalization suffix. They may move
  within that suffix, be deleted, or indent into a compatible preceding Box, but may not cross or
  duplicate the sentinel.

This is currently a Studio structure policy, not a generic Project Model invariant. The core model
continues to support a non-empty ordered root array for import/export and future renderer needs.
Import migration for a first root that is not a compatible Box remains explicit future work.

### Conservative HTML content model

In v0.1, only Box can contain an arbitrary primitive. Text, Button, Image, and Input are treated as
leaves by the insertion UI even though the Registry currently marks Text and Button as capable of
some children. This prevents invalid paragraph nesting, nested interactive controls, and model
children that disappear under void elements.

Future inline elements and component slots require a tag-aware validator that checks both the
parent's `allowedChildren` and the child's `allowedParents` before this rule can expand.

The same pure parent policy now serves Add Element and hierarchy reparenting. Up/down movement does
not change the parent; indent and outdent validate the actual destination against the latest
canonical project before creating a `MoveNode`.

## Hierarchy structure commands

When a model node is selected, the hierarchy exposes a compact contextual toolbar:

| Command | Operation contract | Selection after success |
| --- | --- | --- |
| Move up | same parent, detached-list index `i - 1` | moved node |
| Move down | same parent, detached-list index `i + 1` | moved node |
| Indent | append inside the preceding compatible Box | moved node |
| Outdent | insert immediately after the current parent in its parent | moved node |
| Duplicate | one deep-subtree `InsertNode` immediately after the source | copied root |
| Delete | one subtree `RemoveNode` | next sibling, previous sibling, then parent |

Capabilities and command creation use canonical sibling arrays, never the rendered DOM or a
filtered/flattened hierarchy list. Boundary actions do not create history entries. Every successful
forward operation carries explicit `source: "human"` and `documentId` metadata.

### Deep duplicate

Duplicate walks the complete subtree, allocates a fresh type-prefixed UUID for each node, and emits
one `InsertNode` whose `descendants` contain the remaining clones. It deep-copies node data and
rewrites node identity, parent links, child links, and internal `StrataValue.reference` targets.
References outside the copied subtree remain external. The operation snapshot and IDs are created
once, so Redo restores the same copied subtree rather than allocating a different identity.

Authored DOM `id` values and raw IDREF strings are not yet remapped. Duplicate is therefore proven
for Studio primitives and typed Strata node references, not arbitrary imported markup with `id`,
`for`, `href="#…"`, or opaque passthrough references. That case requires a diagnostic or a DOM-ID
mapping pass before the command becomes a general importer guarantee.

### Delete and surviving references

Delete removes the selected node and every descendant. Its fallback selection is computed before
application as next sibling, previous sibling, parent, then page root. The Project Model inverse
captures the entire subtree and exact index.

The reducer deliberately does not rewrite references in surviving nodes. A future Problems-backed
reference scan must block or warn when an outside node points into the deleted subtree. Until then,
delete is structurally reversible but does not claim automatic repair of arbitrary imported
cross-subtree references.

## Selection-aware history

Project operations remain independent of editor UI state. The Studio history envelope may also
store `selectionBefore` and `selectionAfter`. Undo applies the exact inverse and restores the former
selection; Redo replays the original forward snapshot and restores the latter. This prevents
duplicate Undo from falling back to the page root and lets delete Undo reselect the restored node.

## Error boundary

Placement and reducer failures are caught at the relevant Add Element or hierarchy command
boundary. An Add failure keeps the panel and query open; every command failure keeps project,
history, and selection intact, displays the existing editor error surface, and records a system
operation entry. Selection and panel closure occur only after a transaction succeeds.

The Project Model reducer remains responsible for structural invariants and atomic application. The
Studio placement validator adds current product/HTML semantics that are not yet encoded by the core
schema.

## Command accessibility

- Add Element search receives focus when its context panel opens.
- The Command Palette supports Arrow Up, Arrow Down, Enter, and Escape.
- ordinary single-letter editor shortcuts do not fire while an input, textarea, select, or editable
  text region owns keyboard focus.
- insertion placement and primitive actions use explicit accessible labels.
- hierarchy actions expose accessible labels and disabled states from the same capability helper
  used by execution;
- structure shortcuts are scoped to focus within the hierarchy tree or its contextual toolbar:
  Alt+Arrow Up/Down moves, Alt+Arrow Right indents, Alt+Arrow Left outdents, Mod+D duplicates, and
  Delete or Backspace deletes;
- structure shortcuts ignore text editing, composition, open palette/Add contexts, and repeated
  destructive key events. Project Undo/Redo also yields to native text-input Undo.

## Verification

Tests cover all five primitive presets, schema parsing, independent object creation, protected-root/
inside/before/after target resolution, rejection of non-Box parents, opaque ID collision handling,
exact operation inversion, canonical move indices, legacy-root normalization, deep copy and internal
reference remapping, delete fallback, Project Store persistence, Stage and hierarchy projection,
shortcut scoping, and selection-aware Undo/Redo with stable node IDs.

## Remaining structural work

- Stage drag gestures, insertion-between-siblings, target-parent highlighting, and layout preview;
- structured operation/runtime failures in Problems;
- external-reference diagnostics before subtree delete;
- DOM ID/IDREF remapping or an explicit block before duplicating imported markup;
- imported-document migration when the first root is not a compatible Box sentinel;
- richer tag-aware parent/child validation beyond the conservative Box-only policy;
- replace the starter Image placeholder through the asset workflow.
