# Stage Structure Authoring v0.1

Status: first insertion slice implemented

This specification defines how the Studio creates and places the five initial primitive elements
without making the rendered DOM authoritative.

## Implemented user loop

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
| no or stale selection | document root | append to `rootNodeIds` |
| Before | selected node's current parent | selected sibling index |
| After | selected node's current parent | selected sibling index + 1 |
| Inside | selected node | append to `children` |

Every forward insertion includes an explicit `documentId`, even when it equals the active document.
This keeps redo pinned to the authored document if the active page later changes.

### Conservative HTML content model

In v0.1, only Box can contain an arbitrary primitive. Text, Button, Image, and Input are treated as
leaves by the insertion UI even though the Registry currently marks Text and Button as capable of
some children. This prevents invalid paragraph nesting, nested interactive controls, and model
children that disappear under void elements.

Future inline elements and component slots require a tag-aware validator that checks both the
parent's `allowedChildren` and the child's `allowedParents` before this rule can expand.

## Error boundary

Placement and reducer failures are caught at the Add Element command boundary. Failure keeps the
panel, query, project, history, and selection intact and displays an actionable message. Selection
and panel closure occur only after the transaction succeeds.

The Project Model reducer remains responsible for structural invariants and atomic application. The
Studio placement validator adds current product/HTML semantics that are not yet encoded by the core
schema.

## Command accessibility

- Add Element search receives focus when its context panel opens.
- The Command Palette supports Arrow Up, Arrow Down, Enter, and Escape.
- ordinary single-letter editor shortcuts do not fire while an input, textarea, select, or editable
  text region owns keyboard focus.
- insertion placement and primitive actions use explicit accessible labels.

## Verification

Tests cover all five primitive presets, schema parsing, independent object creation, root/inside/
before/after target resolution, rejection of non-Box parents, opaque ID collision handling, exact
operation inversion, Project Store persistence, Stage and hierarchy projection, selection, and
Undo/Redo restoration with the same node ID.

## Remaining structural work

- define the empty-document experience or adopt a permanent page-root sentinel;
- drag or keyboard reordering and reparenting through `MoveNode`;
- selection-aware delete and duplicate commands;
- insertion-between-siblings and parent-preview feedback on the Stage;
- route structured operation/runtime diagnostics into Problems;
- move semantic parent/child validation into a shared headless policy;
- replace the starter Image placeholder through the asset workflow.
