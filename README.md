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

Two implementation checkpoints are present in the repository:

- **E0 Element Extractor:** a working vertical slice for selecting, capturing, sanitizing,
  reconstructing, and exporting a real DOM element.
- **Studio shell:** a React/Vite editor prototype with a Stage, element hierarchy, direct property
  editing, history controls, an Inspector, a Blueprint concept view, an Agent concept view, and
  resizable panels.

The shell demonstrates interaction and visual direction; it does not yet implement the accepted
persistent 30% Agent layout or the canonical Project Model. Those are the next architectural
checkpoint.

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

### Architecture documents

| Document | Purpose |
| --- | --- |
| [Product and editor architecture](docs/architecture/product-and-editor-architecture.md) | Accepted product position, workspace layout, Blueprint-first program model, Agent contract, and roadmap |
| [Element Model and Property Schema](docs/architecture/element-model-and-property-schema.md) | Element registry, capabilities, typed values, state scopes, import/export, and first implementation slice |
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

The next slice should prove one complete path instead of expanding every panel at once:

1. insert a Button and Text node on the Stage;
2. edit typed content and visual properties through schema-generated controls;
3. connect `Button Click -> Set Text` in the Blueprint workspace;
4. generate and run TypeScript in the sandboxed preview runtime;
5. let the Agent propose the same change through structured operations;
6. preview, apply, and undo the transaction.

This slice validates the Element Model, Property Schema, Blueprint IR, runtime boundary, Agent
bridge, and undo history together.
