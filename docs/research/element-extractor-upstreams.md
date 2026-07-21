# Element Extractor upstream research

Date: 2026-07-22  
Status: accepted as the E0 implementation baseline

## Why these two projects

The first research pair intentionally covers two different halves of the product:

- **React Grab** answers “how do we reliably point at and lock a live element?”
- **CSS-Used** answers “how do we discover the CSS required by the selected subtree?”

Both projects use the MIT license. They are research inputs, not foundations whose internal data models will become Strata's architecture.

## Pinned upstream snapshots

| Project | Repository | Pinned commit | Observed package version | License |
| --- | --- | --- | --- | --- |
| React Grab | <https://github.com/aidenybai/react-grab> | `760d080b6160453b042ac2921f795ef735cb4789` | `0.1.48` | MIT |
| CSS-Used | <https://github.com/painty/CSS-Used-ChromeExt> | `19223201eda756a0bfff349a21d514203e43a1d8` | `3.0.0` | MIT |

Research clones are shallow clones stored outside this repository. This prevents nested Git repositories, accidental vendoring, and upstream history from polluting Strata commits.

## React Grab findings

### Valuable source entry points

- `packages/react-grab/src/primitives.ts`
- `packages/react-grab/src/utils/get-unfiltered-elements-at-point.ts`
- `packages/react-grab/src/utils/create-element-bounds.ts`
- `packages/react-grab/src/utils/create-element-selector.ts`
- `packages/react-grab/src/utils/is-valid-grabbable-element.ts`
- `packages/react-grab/src/utils/freeze-animations.ts`
- `packages/react-grab/docs/architecture.md`

The public `react-grab/primitives` entry exposes element hit testing, paint-order candidates, bounds, selectors, page freeze/unfreeze, and element context. Its handling of open Shadow DOM and same-origin iframe boundaries is particularly relevant to Strata.

### Boundary decision

Do not make React Grab the picker core directly. The primitives entry still imports React Fiber tooling through `bippy`, the package declares React as a peer, and the package also depends on its CLI. Its page-freezing techniques intentionally patch framework and browser internals and are documented as fragile.

Strata will instead define a framework-neutral `ElementPickerAdapter` and run a short integration spike:

1. test whether the published primitives tree-shake cleanly enough for an extension content script;
2. if not, implement the small DOM-generic subset behind our own interface;
3. retain React-specific context capture as an optional adapter rather than a core dependency.

## CSS-Used findings

### Valuable source entry points

- `src/content.ts`
- `src/util/generateRulesAll.ts`
- `src/util/traversalCSSRuleList.ts`
- `src/util/filterRules.ts`
- `src/util/cleanHTML.ts`
- `src/util/convUrlToAbs.ts`

The useful pipeline is:

1. gather embedded and linked stylesheets;
2. recursively expand normal rules, media rules, imports, font faces, and keyframes;
3. test selectors against the selected root and descendants;
4. retain referenced fonts and animations;
5. clean the selected HTML and resolve relative URLs.

### Boundary decision

Use the pipeline as an algorithmic reference, but rewrite the implementation with modern DOM and CSS AST operations.

Known gaps that Strata must address:

- selectors depending on ancestors lose their matching context after extraction;
- custom properties inherited from ancestors are only partially handled;
- interaction-created DOM can have rules that are absent from the current snapshot;
- pseudo-class removal is regex-based and cannot safely model all modern selectors;
- HTML sanitization is regex-based and is not a security boundary;
- matching every rule against a large subtree can become expensive;
- cross-origin stylesheets and imports require explicit fallbacks and warnings.

## Strata E0 architecture derived from the study

```text
element-picker
  -> selected live Element
element-extractor
  -> DOM snapshot + matched CSS + inherited context + assets
element-bundle
  -> validated, versioned Strata Element Bundle
element-preview
  -> sandboxed reconstruction + visual comparison
```

The upstream projects do not define Strata's data model. The boundary between every stage is owned by Strata and represented with versioned TypeScript schemas.

## First implementation spike

The first executable slice will use a controlled fixture page and must demonstrate:

1. hover and click selection without selecting the editor overlay;
2. parent/child target navigation;
3. capture of sanitized subtree HTML;
4. collection of matching ordinary rules and active media rules;
5. collection of inherited custom properties and `::before`/`::after` data;
6. absolute URL resolution plus an asset manifest;
7. reconstruction inside a sandboxed iframe;
8. explicit warnings for inaccessible stylesheets and unsupported behavior.

The spike does not yet include arbitrary remote URL capture, JavaScript behavior reconstruction, multi-selection, drag-resize editing, or Blueprint generation.

## Licensing rule

No upstream source has been copied into Strata at this checkpoint. If a later implementation copies or modifies a meaningful portion of MIT-licensed source, its original copyright and license notice must be retained in the appropriate third-party notice file.

