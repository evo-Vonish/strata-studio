# Strata Project Model v0.1

Status: M1.1 implementation contract

## Objective

`StrataProject` is the canonical persisted state shared by the Stage, Inspector, Blueprint,
importers, exporters, runtime, and Agent. Rendered DOM, open panels, hover state, and browser
computed styles are projections or ephemeral editor state and never become competing sources of
truth.

Version 0.1 intentionally models DOM authoring deeply enough for the first vertical slice while
reserving typed boundaries for programs, assets, and later scene models.

## Ownership and package boundary

`@strata/project-model` owns:

- versioned project schemas and parsers;
- stable project, document, node, asset, and program identifiers;
- normalized document trees;
- typed property values and authored style scopes;
- accessibility and interaction bindings;
- operations, transactions, validation, and inversion;
- framework-independent state transitions.

It must not import React, manipulate a live DOM, read browser computed styles, or call an Agent.

## Root shape

```ts
interface StrataProject {
  version: "0.1";
  id: string;
  name?: string;
  documents: Record<string, StrataDocument>;
  programs: Record<string, StrataProgram>;
  assets: Record<string, StrataAsset>;
  activeDocumentId: string;
}
```

All maps use their contained object's `id` as the key. Map keys and object IDs must match.

## Document and normalized tree

```ts
interface StrataDocument {
  id: string;
  name?: string;
  rootNodeIds: string[];
  nodes: Record<string, StrataNode>;
}

interface StrataNode {
  id: string;
  kind: "element" | "text" | "component" | "slot" | "unknown";
  type: string;
  tag?: string;
  parentId: string | null;
  children: string[];
  attributes: PropertyMap;
  content?: StrataValue;
  styleRules: StyleRule[];
  accessibility: AccessibilityData;
  interactions: InteractionBinding[];
  editor?: NodeEditorMetadata;
  passthrough?: PassthroughData;
}
```

Nodes are normalized so operations can address a stable ID without walking or replacing nested
object trees. `rootNodeIds` provides document order for parentless nodes.

## Tree invariants

A valid document satisfies all of the following:

1. every node ID is unique within the document;
2. every child ID resolves to an existing node;
3. a child occurs at most once across roots and parent child lists;
4. a root node has no `parentId`;
5. every non-root node has a parent that lists it exactly once;
6. the graph is acyclic;
7. a node cannot be moved inside itself or a descendant;
8. removal is explicit about whether it removes a subtree or promotes children;
9. document and project map keys match contained IDs;
10. `activeDocumentId` resolves to an existing document.

Schema parsing checks data shape. Operation application additionally checks relational invariants.

## Typed values

```ts
type StrataValue =
  | { kind: "unset" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "dimension"; value: number; unit: string }
  | { kind: "color"; value: string }
  | { kind: "asset"; assetId: string; fallbackUrl?: string }
  | { kind: "reference"; nodeId: string }
  | { kind: "token"; tokenId: string }
  | { kind: "binding"; expression: string }
  | { kind: "raw"; cssText: string };

type PropertyMap = Record<string, StrataValue>;
```

`raw` is a first-class preservation path, not an error state. Importers use it when a valid web
platform value cannot yet be represented by a more specific variant.

`unset` differs from an absent map entry: an absent entry means Strata has no authored declaration;
`unset` means the author deliberately selected the CSS or property-level unset behavior.

## Authored style rules

```ts
interface StyleScope {
  breakpoint?: string;
  state?: string;
  colorMode?: string;
  variant?: string;
}

interface StyleRule {
  scope: StyleScope;
  properties: PropertyMap;
}
```

Only authored declarations are persisted. Effective browser values and their provenance may be
cached by the editor but are not serialized into every node.

Scope identity is based on all scope fields, not array position. `SetStyle` updates one property in
one exact scope and must not overwrite declarations in another scope.

## Accessibility and interactions

Accessibility data stores authored semantics without pretending that every ARIA field is valid for
every node:

```ts
interface AccessibilityData {
  role?: string;
  aria: PropertyMap;
}
```

An interaction references a program and entry point rather than embedding executable JavaScript in
the element:

```ts
interface InteractionBinding {
  id: string;
  event: string;
  programId: string;
  entryPointId: string;
}
```

Program content remains minimal in M1.1. The Program Model milestone may extend its internal schema
without changing element binding semantics.

## Assets and programs

M1.1 requires stable reference records, not complete asset processing or graph compilation:

```ts
interface StrataAsset {
  id: string;
  kind: "image" | "font" | "audio" | "video" | "other";
  url: string;
  mimeType?: string;
}

interface StrataProgram {
  id: string;
  entryPoints: Record<string, string>;
}
```

The program record is deliberately only a reference target in M1.1. Executable graph nodes, edges,
types, and generated source belong to the Program Model checkpoint.

## Serialization and evolution

- Persisted projects always include a literal version.
- `parseProject` rejects unknown versions until a migration is registered.
- `safeParseProject` returns structured validation results without throwing.
- Serialization must not depend on map insertion order for semantics.
- Migrations are pure functions from one validated version to the next.
- Unknown DOM attributes and style declarations belong in normal property maps or `passthrough`,
  never in transient editor state.

## Error behavior

Operations fail explicitly for missing projects/documents/nodes, duplicate IDs, invalid indices,
cycles, broken parent references, or incompatible operation payloads. An invalid operation must not
partially modify the input project.

## Required tests

- valid project parse and JSON round trip;
- invalid version and mismatched active document;
- typed value variants, including raw and unset;
- root and nested insertions;
- subtree removal and exact restoration;
- movement between roots and parents;
- cycle and duplicate prevention;
- scoped style isolation;
- attribute/content/accessibility/interaction changes;
- transaction ordering, failure behavior, and exact undo.
