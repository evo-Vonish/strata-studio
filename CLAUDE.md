# Strata Studio project memory

Last updated: 2026-07-23

This file is the durable, repository-scoped context for Claude Code, Codex, and other coding agents.
Read it before making architectural changes. Keep it concise, factual, and current. Never store API
keys, tokens, private credentials, or user secrets here.

## Product identity

Strata Studio is an AI-native visual IDE for interactive web experiences. It is not merely a
website builder and not a chat wrapper that emits disposable HTML. It should let a person design,
program, inspect, learn from, and retain control over a real project while collaborating with AI.

The initial runtime is the browser. The long-term product can cover websites, web applications,
components, data visualizations, Canvas experiences, and later web games. Backend IDE features,
native application toolchains, and 3D engine scope are not near-term goals.

Repository: `evo-Vonish/strata-studio`

## Three coordinated surfaces

1. **Stage / Canvas** — visual structure, layout, appearance, selection, and direct manipulation.
2. **Program workspace** — Blueprint first; Scratch-like Blocks and editable Code are later
   projections where semantic round trips are possible.
3. **AI Agent** — a persistent right-side workspace, approximately 30% by default, integrated later
   through a VonishAgent adapter.

All three surfaces edit one versioned **Strata Project Model**. HTML, CSS, JavaScript, TypeScript,
Blueprint, Blocks, Code, and the rendered Stage are projections or imports/exports—not competing
sources of truth.

## Non-negotiable architecture

- The Project Model is canonical. Do not make the rendered DOM authoritative.
- Human UI, Stage gestures, importers, Blueprint, and Agent changes must produce typed
  `ProjectOperation[]` transactions.
- Operations must be reviewable, deterministic where practical, and exactly undoable/redoable.
- The Stage runs inside a sandboxed runtime frame. Project content must not execute in the editor
  document or mutate editor-owned React state directly.
- Every projected node uses a stable `data-strata-node-id` for selection and overlay mapping.
- Inspector controls come from the Property Schema Registry rather than one-off element forms.
- Preserve unsupported or unknown source explicitly. Never silently discard code, attributes, CSS,
  or behavior during conversion.
- Framework support belongs behind adapters. The first renderer targets standard DOM/CSS/browser
  APIs; React, Vue, Canvas, and other renderers must not leak into every core node.
- Agent integration must use an `AgentBridge` and the shared operation reducer. The Agent cannot
  bypass history or directly edit the DOM.

## Current implementation snapshot

### Completed foundations

- **E0 Element Extractor:** DOM selection, sanitized capture, CSS/assets/fidelity metadata, inert
  reconstruction, Element Bundle v0.1, and export.
- **Studio shell:** React/Vite editor frame inspired by professional IDEs, with Stage, hierarchy,
  Inspector, Program concept, Agent sidecar, operations panel, devices, and resizable regions.
- **M1.1 Project Core:** validated project/document/node schemas, typed values, tree invariants,
  reversible operations and transactions, and Property Registry definitions for Box, Text, Button,
  Image, and Input.
- **M1.2 model-backed Stage core:** deterministic DOM Runtime, sandbox Stage, stable selection,
  model-derived hierarchy, schema-generated Design/Content controls, responsive/state scopes,
  persistent Project Store, exact undo/redo, an Agent transaction example, and a searchable Add
  Element panel that inserts all five primitives through Before/Inside/After transactions.
- **M1.2 structural commands:** a protected Box page-root sentinel, canonical sibling move up/down,
  indent into the previous Box, outdent after the current parent, deep subtree duplicate, subtree
  delete, hierarchy-scoped keyboard commands, and selection-aware Undo/Redo.
- **M1.2 Stage reorder:** an explicit Reorder mode routes iframe Pointer Events through a
  conservative vertical Before/Inside/After placement planner. It starts after a 5px mouse or 8px
  touch/pen threshold, previews parent/container highlights, sibling insertion lines, or disabled
  targets, and commits one latest-model-validated `MoveNode` on pointer-up. Inside remains
  Box-only; selection stays on the moved node and exact Undo/Redo uses the same history envelope.
  Escape, pointer cancellation/capture loss, frame blur, a tool switch, and leaving Stage cancel
  without creating history.

The active editor data path is:

```text
Inspector / Stage / Agent intent
            -> ProjectOperation[]
            -> Project Store + inverse history
            -> Strata Project Model
            -> DOM Runtime
            -> sandboxed Stage iframe
```

### Active next slice

With conservative Stage reorder complete, finish diagnostics and integrity work before Blueprint
execution:

1. route reducer/runtime failures into Problems without corrupting history;
2. guard deletion against external node references and handle authored DOM IDs during duplicate;
3. define an explicit migration/diagnostic path for imported documents without a valid Box page
   root;
4. extend Stage placement from its current vertical semantic baseline to Flex/Grid axis-aware
   feedback only after those invariants are covered;
5. then begin `Button Click -> Set Text` in the minimal Blueprint workspace.

## Important implementation boundaries

- `@strata/project-model` and `@strata/property-schema` remain headless: no React or browser DOM
  dependencies.
- `@strata/dom-runtime` is a projection layer, never a second state store.
- Desktop in the Studio currently maps to the unscoped base cascade. Tablet/mobile are breakpoint
  scopes. An explicitly authored desktop breakpoint can still compile to a media query.
- Stage CSP blocks scripts, frames, form actions, objects, base URL changes, and `connect-src`.
  Image/media/font resources may still load through declared CSP sources.
- Imported arbitrary JavaScript/TypeScript cannot always become a clean graph. Preserve unsupported
  source in recognized compound nodes or typed Code Nodes.
- Primitive insertion uses opaque, non-recycled type-prefixed UUIDs. The Add UI currently treats
  only Box as a safe arbitrary-primitive parent.
- `rootNodeIds[0]` is the Studio page-root sentinel. It stays fixed and cannot be deleted, moved,
  duplicated, or given root siblings. Extra roots from older projects can be normalized into it.
  This is an editor policy layered above the generic Project Model root array.
- Hierarchy structure shortcuts run only while the hierarchy/tree toolbar owns focus; Inspector and
  search inputs retain native editing behavior.
- Stage reorder currently uses explicit mode and conservative vertical semantics; Flex/Grid
  axis-aware placement, auto-scroll, and drag ghosts are not complete yet. Problems/diagnostics,
  external-reference repair, imported-root migration, and runtime Blueprint execution are also not
  complete yet.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/studio` | React/Vite editor shell and integration tests |
| `packages/project-model` | Canonical schemas, operations, transactions, inversion |
| `packages/property-schema` | Element capabilities and schema-generated property definitions |
| `packages/dom-runtime` | Deterministic HTML/CSS projection and sandbox Stage document |
| `packages/element-bundle` | Versioned extracted-element interchange format |
| `packages/element-picker` | Browser hit testing and editor overlay helpers |
| `packages/element-extractor` | Sanitized DOM/CSS/assets extraction and preview reconstruction |
| `docs/architecture` | Accepted product and system architecture |
| `docs/specs` | Executable milestone contracts and technical specifications |
| `docs/research` | Upstream project research and adopted/rejected ideas |

## Authoritative reading order

1. `CLAUDE.md` — durable context, constraints, current state, and workflow.
2. `README.md` — repository overview and current public checkpoint.
3. `docs/architecture/product-and-editor-architecture.md` — accepted product direction.
4. `docs/architecture/element-model-and-property-schema.md` — element/property architecture.
5. `docs/specs/m1-acceptance.md` — current milestone gates.
6. The specific package spec relevant to the change.

When documents disagree, do not silently pick one. Inspect implementation and git history, then
update the stale document as part of the same change.

## Development and handoff protocol

Before work:

- read this file and the relevant product/spec documents;
- inspect `git status` and preserve unrelated user changes;
- state assumptions when a choice would materially change product behavior;
- use a maximum of four concurrent agents unless the user changes that limit; prefer Terra agents
  when delegating implementation or review for this project.

For every completed development slice:

1. update the relevant product architecture/specification and this current-state memory;
2. add or update tests for model, reducer, runtime, and user-visible integration behavior;
3. run `pnpm check` and `git diff --check`;
4. commit the coherent slice with a descriptive conventional commit message;
5. push the current branch to `origin` after checks pass;
6. report the commit, verification results, remaining boundaries, and push/deployment status.

If push is blocked by credentials or network access, keep the local commit intact and report the
exact blocker. Do not claim a remote update until it is verified. Deployment is separate from push
and should only occur when requested or already established as the active workflow.

## Commands

Requires Node.js 24 and pnpm 11.

```bash
pnpm install
pnpm dev
pnpm check
```

`pnpm check` runs lint, TypeScript, all tests, and the production Studio build.

## Security and repository hygiene

- Never commit access tokens, deploy keys, environment secrets, or credentials.
- Use repository-scoped/deploy-key access rather than broad personal access tokens where possible.
- Treat imported HTML/CSS/JS and project assets as untrusted input.
- Keep iframe permissions and CSP narrow; add regression tests when relaxing either boundary.
- Do not vendor research repositories. Record their URL, license, pinned revision, and the ideas
  adopted or rejected.
- Do not rewrite or discard unrelated work in a dirty worktree.

## Product language

Use these names consistently:

- **Strata Studio** — product and editor.
- **Stage** — visual canvas/runtime projection workspace.
- **Program workspace** — umbrella term for Blueprint, Blocks, and Code.
- **Blueprint** — first graph-based programming projection.
- **Project Model** — canonical authored state.
- **Project Operation** — typed mutation intent applied by the reducer.
- **DOM Runtime** — Project Model to HTML/CSS Stage projection.
- **Agent sidecar** — persistent AI workspace; **VonishAgent** is the future integration adapter.
