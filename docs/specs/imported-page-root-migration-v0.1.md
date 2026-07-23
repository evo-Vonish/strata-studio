# Imported Page-root Migration v0.1

Last updated: 2026-07-23

Status: implemented M1.2 structural boundary

## Objective

Studio structural authoring needs one protected Box page root at
`document.rootNodeIds[0]`. The generic Project Model deliberately permits an ordered set of
parentless roots, so imported documents can be valid Project Model data while lacking the Studio
page-root contract.

This specification defines a preservation-first Studio migration. It is a Studio policy layered on
top of the headless Project Model; it neither changes the generic schema nor makes a Box root a
universal import/export invariant.

## Assessment and diagnostics

Studio derives a page-root assessment from each active, successfully parsed document. It does not
mutate local storage, an imported payload, or a rendered document merely because an assessment
fails.

A valid page root is the first root and satisfies all of the following:

- it resolves to an existing node with `parentId: null`;
- its `kind` is `"element"` and its `type` is `"Box"`;
- its effective rendered tag is one of the Property Registry Box tags. The effective tag is
  `tag`, then `passthrough.originalTag`, then the DOM Runtime fallback `div`, compared using
  ASCII-lowercase semantics.

`Box` with an incompatible tag is not silently retagged. Likewise, `component` and `unknown`
nodes are not upgraded into ordinary Box nodes simply because they carry a Box-like type string.

An invalid assessment produces the model-derived, persistent structure diagnostic
`PAGE_ROOT_MIGRATION_REQUIRED`. It identifies the first root when one exists, records the reason
(`kind`, `type`, or `tag`), and remains visible until the Project Model becomes valid. Unlike a
session operation failure, it does not disappear after an unrelated successful edit. Locate selects
the imported source root; it never substitutes a newly invented page root.

The Stage may continue to show the original, inert projection and the Inspector may inspect it,
but Add Element, structural hierarchy commands, and Stage reorder require a valid page-root
assessment. Their blocked state must direct the user to Repair rather than pretending that the
first imported node is a safe container.

## Legacy root suffixes

If the first root is already a valid Box, the document is valid for this slice. Additional roots
are a supported legacy suffix and are left exactly as imported: their order, IDs, parents, and
subtrees are not normalized merely to make the document look newer. Studio's existing legacy-root
command boundaries remain in force.

Keeping an already valid suffix avoids an unnecessary nesting change and the CSS/fidelity risk it
would create. A future migration may offer an explicit suffix-normalization tool, but it is not
part of v0.1.

## Explicit Repair command

Problems exposes **Repair imported page structure** for a repairable invalid assessment
(`kind`, `type`, or `tag`). Repair is explicit user intent, not a background or load-time
auto-mutation. Before applying it, Studio states that the operation preserves authored nodes and
values but adds a DOM nesting level that can affect external CSS selectors and rendering fidelity.

Repair creates one neutral, Studio-owned page container:

```ts
{
  kind: "element",
  type: "Box",
  tag: "div",
  parentId: null,
  children: [],
  styleRules: [{ scope: {}, properties: { display: { kind: "literal", value: "contents" } } }],
  editor: { name: "Imported page container" }
}
```

The `display: contents` default minimizes normal layout participation; it is not a promise of
pixel-perfect or selector-perfect fidelity. In particular, imported selectors that depend on a
root's former parent/child relationship can still match differently. The migration never claims to
repair arbitrary imported CSS, JavaScript, or opaque browser behavior.

The wrapper receives a fresh, collision-free migration ID. The candidate is chosen once from the
existing document ID set, stored in the forward operation snapshot, and never allocated again by
Redo. Existing node IDs are never recycled, renamed, or remapped.

The command emits one atomic, document-scoped transaction with `source: "import"`:

1. `InsertNode` the wrapper with an initially empty `children` list at root index zero;
2. `MoveNode` every former root into the wrapper at its original root-array index, in original
   order.

The object above is the actual `InsertNode` snapshot. Its children are populated only by the typed
`MoveNode` operations, keeping the insert subtree snapshot valid. The final wrapper children equal
`formerRootNodeIds` in their original order.

The migration deliberately does not use the normal new-primitive containment validator: imported
`unknown` and `component` roots must be preserved, not rejected or coerced. It keeps every former
root's `id`, `kind`, `type`, `tag`, `content`, properties, styles, accessibility, interactions,
passthrough fields, lock metadata, descendants, and typed/DOM references unchanged; only each
former root's `parentId` and the document root list change. Locked roots remain locked. Opaque and
component roots can therefore be normalized structurally without being misrepresented as fully
editable primitives.

After application, the wrapper is the sole root and becomes the protected Studio sentinel. Undo
applies the captured inverse to restore the exact pre-repair Project Model, including root order.
Redo replays the original wrapper snapshot, IDs, and root order exactly.

## Problems and interaction contract

`PAGE_ROOT_MIGRATION_REQUIRED` is a model-derived `source: "structure"` diagnostic. Its row has
Locate when the imported root still exists and exposes Repair only when the assessment has a safe
command plan. Repair is a normal history entry named **Repair imported page
structure**. Its success clears the derived diagnostic because the model has changed, not because a
session list was cleared.

The command must surface ordinary operation failures through Problems without partial project,
selection, or history changes. A failed or cancelled Repair does not silently fall back to a starter
project and does not create a history entry.

## Verification

Tests cover:

- valid Box roots, including the effective `div` fallback, with no migration operations;
- valid first roots with legacy suffixes that remain bit-for-bit unchanged;
- non-Box, incompatible-Box-tag, `unknown`, `component`, and locked first roots;
- multiple roots, preserved root order, and preservation of all original node fields and
  references;
- collision-free wrapper IDs and forward snapshot reuse by Redo;
- exact transaction inverse back to the imported Project Model;
- model-derived Problems lifetime, Locate on the original source root, Repair, and structural UI
  gating before/after repair.

## Deferred scope

- normalizing a valid legacy root suffix into the page container;
- cross-document navigation and property-specific Inspector focus from diagnostics;
- automatic fidelity comparison for the wrapper-induced DOM/CSS change;
- migration of malformed data that fails generic Project Model parsing before Studio receives a
  document.
