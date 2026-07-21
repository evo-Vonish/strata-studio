# Strata Studio

Strata Studio is a human–AI collaborative visual web creation engine built on real HTML, CSS, and JavaScript.

Its long-term architecture has three layers:

1. a live Stage/Canvas for direct manipulation;
2. Strata Blueprint as the structured visual source language;
3. an AI Agent that reads and changes the same project through explicit tools.

## Current milestone: E0 Element Extractor

The first deliverable is a browser-based element extractor that can:

- pick a real element from a page;
- capture its DOM subtree, applicable CSS, inherited context, and assets;
- reconstruct it in an isolated preview;
- support small, undoable edits;
- export a standalone HTML file and a versioned Strata Element Bundle.

This milestone becomes the first stage of the later HTML-to-Blueprint importer.

## Development status

The first executable vertical slice is now available:

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

The first two upstream studies are documented in [docs/research/element-extractor-upstreams.md](docs/research/element-extractor-upstreams.md).

No upstream repository is vendored into this repository. Research clones live outside the project tree and are pinned by commit in the research notes.
