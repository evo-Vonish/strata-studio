# Reference Integrity v0.1

Last updated: 2026-07-23

Status: implemented M1.2 Reference Integrity slice

## Objective

Reference Integrity protects the canonical Project Model when a structural command removes or
duplicates a subtree. It is deliberately narrower than a general HTML parser: v0.1 protects
typed Strata node references and a defined, string-valued subset of authored DOM identity
references without treating the rendered Stage as source of truth.

The contract has two independent namespaces:

- **Strata node IDs** identify Project Model nodes. A `StrataValue.reference` points to one of
  these IDs and is handled by the reducer.
- **Authored DOM IDs** are user-visible `id` attributes. They may be held in typed attributes or
  passthrough attributes; they are not Strata node IDs and are handled while planning a Studio
  duplicate.

The distinction is intentional. The DOM Runtime always emits `data-strata-node-id` for Studio
selection, but that generated attribute neither replaces nor participates in authored DOM IDREFs.

## Standards basis

An authored HTML `id` is valid for this contract only when it is non-empty, contains no ASCII
whitespace, and is unique within its document. This matches the HTML Standard's authoring
requirements for the [`id` attribute](https://html.spec.whatwg.org/multipage/dom.html#the-id-attribute).
The supported HTML label/control references use the applicable HTML definitions, including
[`label[for]`](https://html.spec.whatwg.org/multipage/forms.html#attr-label-for). ARIA references
follow their WAI-ARIA attribute definitions, for example
[`aria-labelledby`](https://www.w3.org/TR/wai-aria-1.2/#aria-labelledby). A fragment is rewritten only
when it is the exact local `#id` form defined by the HTML
[link and fragment model](https://html.spec.whatwg.org/multipage/links.html#links).

## Typed node-reference delete boundary

Before a `RemoveNode` completes, the reducer must scan the same document for typed
`StrataValue.reference` values in surviving nodes that target the selected subtree. The scan covers
content, attributes, every style scope, and accessibility ARIA values. References wholly inside
the subtree disappear with the subtree and do not block the operation.

If one or more surviving references remain, `RemoveNode` fails with
`EXTERNAL_NODE_REFERENCE`. The error carries a stable, sorted list of source node, target node,
field/path, and (for style) exact scope. This is the reducer's final safety boundary: human UI,
Stage, importer, and Agent operations cannot bypass it.

Failure is atomic. A failed `RemoveNode`, including one in the middle of a transaction, commits no
intermediate project, produces no inverse/history entry, and leaves the editor selection unchanged.
The user must repair or remove the surviving reference and retry; v0.1 provides no force-delete
and does not silently clear, redirect, or stringify a reference.

The hierarchy command preflight also resolves the supported authored DOM IDREF strings listed
below. A surviving string reference into the removed subtree blocks with
`EXTERNAL_DOM_ID_REFERENCE` and is reported alongside typed findings. This Web-specific layer is
deliberately not placed in the generic Project Model reducer; typed `StrataValue.reference`
scanning remains the reducer's universal final boundary.

## Authored DOM identity on duplicate

Duplicate first creates its normal deep-clone `InsertNode` snapshot. Before that snapshot becomes
history, it validates authored DOM IDs in the copied source subtree against the whole document.

The DOM Runtime and Studio share one canonical attribute resolver. HTML attribute names are
ASCII-case-insensitive, and source precedence is passthrough attributes, typed attributes,
accessibility ARIA, then the explicit role. Same-source case variants are diagnosed by the runtime;
multiple case variants of authored `id` in one source are invalid for duplicate. ID and IDREF
rewrites update only the effective entry selected by this resolver, so editor analysis and Stage
output cannot disagree about a shadowed attribute. Even when an ID conflict exists outside the
copied subtree, the deterministic effective ID still participates in deletion analysis and the
occupied-ID set; this prevents a dangling reference or newly allocated collision. A conflict on a
copied source itself remains a blocking error.

1. An authored DOM ID must be a literal string (or passthrough string), non-empty, and contain no
   ASCII whitespace.
2. Each valid authored DOM ID must have exactly one owner in the document. A duplicate owner makes
   every reference target ambiguous.
3. Invalid IDs block with `INVALID_AUTHORED_DOM_ID`; non-unique IDs block with
   `DUPLICATE_AUTHORED_DOM_ID`. These failures create no `InsertNode`, no history entry, and no
   selection change.
4. For every valid copied ID, allocate a document-unique value beginning with `<old>--copy`.
   When necessary, append a deterministic numeric suffix (`--copy-2`, `--copy-3`, …) rather than
   colliding with existing authored IDs or another copied ID.
5. Rewrite the copied subtree's supported internal IDREFs only when their target appears in that
   old-to-new map. References outside the copied subtree remain unchanged.

The resulting `InsertNode` holds the final clone and mapping effects. Undo removes that exact
snapshot; Redo replays it without allocating another DOM ID or changing any reference again.

### Supported v0.1 DOM IDREFs

For the effective literal string selected from regular attributes, passthrough attributes, or
literal ARIA values, v0.1 rewrites the following when it targets an ID copied in the same duplicate
operation:

| Kind | Attributes | Rewrite rule |
| --- | --- | --- |
| Single ID | `for`, `form`, `list`, `popovertarget`, `commandfor`, `aria-activedescendant`, `aria-details`, `aria-errormessage` | Replace the complete value. |
| Space-separated IDs | `headers`, `itemref`, `aria-controls`, `aria-describedby`, `aria-flowto`, `aria-labelledby`, `aria-owns` | Replace matching ASCII-whitespace tokens, preserving other tokens. |
| `output[for]` | `for` on an `output` element | Apply the space-separated-ID rule. |
| Local fragment | `href`, `xlink:href` | Rewrite only an exact non-empty `#id`; leave every other URL unchanged. |

The command never guesses from arbitrary text. If a value is invalid or an ID has multiple
possible owners, the duplicate is blocked rather than silently choosing one target.

## Problems and command UX

Studio presents a blocked delete or duplicate as actionable Problems records. Each record locates
the **reference source** node and property/path, never the target that would disappear (or an
arbitrary page root). `relatedNodeId` retains the target as separate context. A delete record may
name the selected subtree in its message, but Locate selects the surviving source so it can be
repaired.

`EXTERNAL_NODE_REFERENCE`, `EXTERNAL_DOM_ID_REFERENCE`, `INVALID_AUTHORED_DOM_ID`, and
`DUPLICATE_AUTHORED_DOM_ID` are errors. They are session-only outcomes of a rejected command: they
are not persisted, exported, or undoable. Repeating the same rejection groups the record. A later
successful transaction may clear session failures according to the Diagnostics contract.

No confirmation-based force-delete exists in v0.1. A force action would need a separate,
reviewable multi-operation repair policy with exact inverses; simply bypassing the reducer boundary
would create a durable dangling reference and violates this contract.

## Deferred scope

The following values remain opaque and neither prove nor repair reference integrity in v0.1:

- `binding`, `raw`, and arbitrary string expression values;
- CSS `url()` values, selectors, and other CSS text references;
- `usemap`, SVG URL references beyond the exact supported `xlink:href` fragment case, and other
  non-listed HTML/SVG IDREF grammars;
- cross-document references, document navigation, and property-specific Inspector focus;
- malformed imported markup whose identity semantics cannot be represented in the typed model.

Importers must preserve this source rather than silently rewrite it. Future support must add a
typed grammar, deterministic rewrite rule, diagnostics, and inverse/redo tests before it is made a
reference-integrity guarantee.

## Required tests

- reducer deletion rejects external typed references in content, attributes, scoped styles, and
  ARIA; internal references do not block;
- `EXTERNAL_NODE_REFERENCE` has deterministic source/path/scope metadata and a failed transaction
  exposes no partial state;
- valid DOM IDs duplicate with collision-free `--copy` allocation and internal supported IDREF
  rewrites; external targets remain unchanged;
- runtime rendering, deletion scanning, and duplicate allocation agree on case-insensitive source
  precedence, including shadowed and conflicting spellings;
- invalid or non-unique authored DOM IDs block duplicate atomically;
- undo/redo restores the exact duplicate snapshot, including authored DOM IDs and rewritten values;
- Studio integration exposes source-located Problems and preserves selection/history on a block.
