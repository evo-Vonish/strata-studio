# M1 Unified Authoring Loop acceptance

Status: milestone contract

Related specifications:

- [Project Model v0.1](project-model-v0.1.md)
- [Property Registry v0.1](property-registry-v0.1.md)
- [Operation Protocol v0.1](operation-protocol-v0.1.md)
- [DOM Runtime v0.1](dom-runtime-v0.1.md)

## Milestone outcome

M1 proves that one project can be edited through the Stage, schema-driven Inspector, Blueprint, and
Agent without divergent state. The milestone is divided into independently verifiable checkpoints;
M1.1 establishes the headless model foundation.

## M1.1 Project Core gate

M1.1 is complete when:

- `@strata/project-model` provides versioned schemas, typed values, normalized document nodes,
  operations, transactions, and exact inversion;
- `@strata/property-schema` provides reusable capabilities and definitions for Box, Text, Button,
  Image, and Input;
- neither package imports React or browser DOM APIs;
- parsers reject malformed persisted state;
- project operations preserve tree invariants and input immutability;
- tests cover success, invalid input, and undo behavior;
- the complete repository quality gate passes.

## M1.2 Stage and Property Engine gate

Status: active. The model-backed renderer, stable selection, schema Inspector, scoped property
editing, local persistence, Agent transaction example, exact undo/redo, and the first Add Element
flow are implemented. Five primitives can now be searched and inserted Before/Inside/After through
canonical transactions. A protected page-root sentinel and hierarchy commands now cover canonical
move up/down, indent/outdent, deep duplicate, subtree delete, scoped keyboard actions, and
selection-aware history. Stage drag/drop placement, imported-root migration, reference-integrity
checks, and user-facing operation diagnostics remain before this gate is complete.

- create an empty page and insert the five initial elements;
- select through a stable Strata node ID;
- generate Inspector controls from registry definitions;
- edit content, layout, dimensions, spacing, typography, fill, border, radius, opacity, and
  applicable element fields;
- render the project inside a sandboxed runtime frame;
- express Stage and Inspector edits as transactions;
- preserve state and breakpoint scopes independently;
- save and reload the project without semantic change.

## M1.3 minimal Blueprint gate

- create event, literal, element-reference, set-content, set-attribute/style, branch, sequence, and
  log nodes;
- connect typed data and execution edges;
- compile a Button click graph to TypeScript;
- run it in Preview and update a Text node;
- surface compiler and runtime diagnostics;
- retain unsupported future source through an explicit Code Node boundary rather than discarding
  it.

M1 provides Blueprint only. Blocks and editable Code projections are later milestones.

## M1.4 Agent sidecar gate

- the Agent remains visible beside Stage and Program workspaces at a resizable default 30% width;
- an `AgentBridge` supplies current project, selection, workspace, diagnostics, and recent history;
- a mock adapter proposes real transactions for several known intents;
- the editor shows plan, change summary, preview, apply, reject, and undo;
- the Agent cannot bypass the operation reducer or directly mutate React/DOM state.

Formal VonishAgent integration follows successful validation of this adapter.

## M1.5 persistence and export gate

- save and load `.strata.json`;
- export independently runnable HTML, CSS, and generated TypeScript;
- convert an E0 Element Bundle into one or more Strata nodes;
- preserve unknown attributes, original classes, and unsupported CSS values;
- produce warnings for behavior or resources that cannot be reconstructed.

## End-to-end demonstration

The milestone review uses this fixed scenario:

1. create a project and page;
2. insert Text and Button;
3. edit button text, color, size, and radius;
4. author a different hover color and mobile width;
5. connect `Button.Click -> Set Text("Clicked!")` in Blueprint;
6. run Preview and verify behavior;
7. ask the mock Agent to change the button appearance;
8. preview, apply, undo, and redo the Agent transaction;
9. save, reload, and verify identical authored state;
10. export and run the generated web output.

## Cross-cutting quality requirements

- no secrets, executable imported markup, or unsafe preview privileges are committed;
- every public schema and reducer behavior has tests;
- generated output is deterministic for equivalent project state;
- keyboard navigation and accessible labels cover new editor controls;
- meaningful errors reach Problems/Console instead of only browser logs;
- performance remains interactive for the small acceptance fixture;
- current extractor tests continue to pass.

## Explicit M1 non-goals

- all HTML elements and CSS properties;
- Scratch-style Blocks;
- arbitrary JavaScript/TypeScript-to-Blueprint conversion;
- React, Vue, or Svelte round trips;
- routing, package management, backend/database tooling;
- Canvas game entities, physics, WebGL, or 3D;
- multiplayer collaboration;
- production VonishAgent integration.

These remain planned directions, not implied acceptance requirements.
