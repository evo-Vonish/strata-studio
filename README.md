# Strata Studio

Strata Studio is an AI-native visual IDE for interactive web experiences. It combines direct
manipulation, visual programming, real source code, and a project-aware Agent without replacing
the web platform underneath.

The product is organized around three coordinated surfaces:

1. **Stage/Canvas** — design and directly manipulate pages, components, and later web scenes;
2. **Program workspace** — author behavior through Blueprint first, with Blocks and Code as later
   projections of the same program model;
3. **AI Agent** — a persistent sidecar that reads context and proposes explicit, previewable,
   undoable project operations.

All three surfaces operate on the same versioned **Strata Project Model**. HTML, CSS, JavaScript,
TypeScript, Blueprint, and the rendered Stage are representations of that model rather than
independent sources of truth.

## Product boundary

Strata targets browser-based interactive experiences: websites, web applications, dashboards,
tools, data visualizations, Canvas experiences, and eventually web games. The near-term goal is not
to become a general backend IDE, a native application toolchain, or a full 3D engine.

## Current state

Four implementation checkpoints are present in the repository:

- **E0 Element Extractor:** a working vertical slice for selecting, capturing, sanitizing,
  reconstructing, and exporting a real DOM element.
- **Studio shell:** a React/Vite editor prototype with a Stage, element hierarchy, direct property
  editing, history controls, an Inspector, a Blueprint concept view, an Agent concept view, and
  resizable panels.
- **M1.1 Project Core:** a headless, versioned Project Model with document-owned node trees,
  reversible operations and transactions, typed values, a composable Property Registry, and the
  first Box, Text, Button, Image, and Input definitions.
- **M1.2 model-backed Stage core:** a deterministic, sandboxed DOM Runtime; a persistent Project
  Store with undo/redo; a model-derived hierarchy; and schema-generated Design/Content controls
  wired to the same operation protocol used by the Agent prototype.

The Stage is now a projection of the Project Model rather than an independently mutable React DOM
tree. The remaining M1.2 work is authoring structure itself: an Add Element palette, insertion and
reordering gestures, empty-page creation, and stronger diagnostics for invalid operations.

## E0 Element Extractor

The first deliverable is a browser-based element extractor that can:

- pick a real element from a page;
- capture its DOM subtree, applicable CSS, inherited context, and assets;
- reconstruct it in an isolated preview;
- support small, undoable edits;
- export a standalone HTML file and a versioned Strata Element Bundle.

This milestone becomes the first stage of the later HTML-to-Blueprint importer.

The executable extractor slice can:

1. turn on the picker and hover any node in the controlled fixture;
2. click to produce a schema-validated Element Bundle v0.1;
3. inspect rule, asset, node, warning, and fidelity metadata;
4. compare an inert sandbox preview or inspect/download the JSON bundle.

The preview runs without scripts or pointer interaction and carries a restrictive content security policy. The extractor removes executable descendants, inline event handlers, active form attributes, and unsafe resource protocols before serialization.

### Workspace map

| Path | Responsibility |
| --- | --- |
| `apps/studio` | React/Vite stage and bundle inspector |
| `packages/element-bundle` | Versioned data contract and runtime validation |
| `packages/element-picker` | Hit testing, overlay bounds, selectors, iframe/shadow traversal |
| `packages/element-extractor` | DOM sanitization, CSSOM matching, assets, fidelity, preview document |
| `packages/project-model` | Versioned project schemas, document trees, typed values, operations, transactions, and inversion |
| `packages/property-schema` | Property, capability, and element registries plus the five initial element definitions |
| `packages/dom-runtime` | Deterministic Project Model to HTML/CSS compilation and sandboxed Stage documents |

### Architecture documents

| Document | Purpose |
| --- | --- |
| [Product and editor architecture](docs/architecture/product-and-editor-architecture.md) | Accepted product position, workspace layout, Blueprint-first program model, Agent contract, and roadmap |
| [Element Model and Property Schema](docs/architecture/element-model-and-property-schema.md) | Element registry, capabilities, typed values, state scopes, import/export, and first implementation slice |
| [M1 technical specifications](docs/specs/m1-acceptance.md) | Project Model, Property Registry, DOM Runtime, operation protocol, and milestone gates |
| [DOM Runtime v0.1](docs/specs/dom-runtime-v0.1.md) | Deterministic rendering, stable node identity, scope mapping, and preview security boundary |
| [Element extractor upstream research](docs/research/element-extractor-upstreams.md) | Pinned upstream study and E0 extraction decisions |

### Run locally

Requires Node.js 24 and pnpm 11.

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:4173`.

Run the complete quality gate with:

```bash
pnpm check
```

### Known v0.1 boundaries

- cross-origin stylesheets can be listed but browsers may block their CSSOM;
- shadow-root contents and canvas pixels are reported but not serialized yet;
- resources remain external unless they were already data URLs;
- fidelity is structural in v0.1; automated pixel comparison is the next step.

No upstream repository is vendored into this repository. Research clones live outside the project tree and are pinned by commit in the research notes.

## Next vertical slice

The next slice completes structural Stage authoring before Blueprint execution:

1. create an empty document and open an Add Element palette;
2. insert Box, Text, Button, Image, and Input nodes through `InsertNode` transactions;
3. reorder and reparent nodes through hierarchy and Stage gestures;
4. expose operation failures in Problems without corrupting history;
5. add selection-aware keyboard delete/duplicate and exact undo/redo;
6. then begin `Button Click -> Set Text` in the minimal Blueprint workspace.

This slice closes the remaining M1.2 structural gap while keeping every edit on the Project Model.
