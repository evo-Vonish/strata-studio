# Product and editor architecture

Date: 2026-07-22

Status: accepted product direction; implementation pending unless marked current

## Product statement

**Strata Studio is an AI-native visual IDE for interactive web experiences.**

It is not only a website builder and it is not a no-code wrapper around generated HTML. The editor
must let people design structure and appearance, program behavior, inspect real source, and work
with an Agent while retaining understandable and editable project state.

The primary runtime boundary is the browser. Intended project classes include:

- websites and landing pages;
- web applications, dashboards, and internal tools;
- reusable frontend components and design systems;
- data visualization and interactive media;
- Canvas 2D experiences and, later, web games;
- WebGL experiences after the scene model has been validated.

Near-term non-goals are a general backend IDE, native mobile build toolchain, arbitrary native game
engine, and perfect visual conversion of every possible JavaScript or TypeScript program.

## One project, three coordinated surfaces

```text
HTML / CSS / JS / TS import
             |
             v
       Strata Project Model
        /        |         \
       v         v          v
 Stage/Canvas  Program     AI Agent
       \         |          /
        \        |         /
         +-- typed operations --+
                  |
                  v
        Preview and web export
```

The Stage, Program workspace, and Agent are editors of the same model. None may maintain a private
copy that can silently diverge from the others.

## Top-level editor layout

The central editor switches between two principal workspaces while the Agent remains visible:

```text
+--------------------------------------------------------------------------+
| Project | Stage | Program | Preview | Device | Run | Save | Publish       |
+----+----------------+--------------------------------------+--------------+
|Rail| Context panel  | Stage or Program workspace           | AI Agent     |
|    | Add / Layers   |                                      | default 30%  |
|    | Inspect/Assets |                                      |              |
+----+----------------+--------------------------------------+--------------+
| Operations | Console | Problems | Network | Timeline | Agent changes     |
+--------------------------------------------------------------------------+
```

The Agent width defaults to 30%, but must be resizable, collapsible, and capable of temporary
focus mode. On narrow viewports it becomes an overlay drawer. A permanently fixed width would make
the Stage unusable after opening the Inspector.

The current React shell already demonstrates Stage, Blueprint, Agent, Inspector, hierarchy,
operations, and resizable panel concepts. It is a visual and interaction prototype, not yet the
final information architecture above.

## Stage workspace

### Context panel

The panel beside the Stage changes with user intent instead of adding another permanent column.

When inserting, it exposes:

- searchable primitive elements and layout blocks;
- project and design-system components;
- assets, patterns, templates, and recent items;
- click-to-insert, drag-to-insert, and insertion between siblings;
- Agent-assisted insertion using the same `InsertNode` operation.

When a node is selected, it becomes a schema-driven Inspector with groups for content, layout,
size, spacing, typography, fill, border, effects, position, states, responsive behavior,
interactions, accessibility, and advanced values.

High-frequency actions may appear in a small selection toolbar on the Stage. Detailed controls stay
in the Inspector to keep the overlay readable.

### Layout-aware insertion

Insertion is structural rather than merely coordinate-based. Drag feedback must show:

- proposed parent;
- before/after/inside placement;
- Flex or Grid placement;
- whether the parent accepts the child;
- a preview of the resulting layout.

### Interaction modes

The Stage requires an explicit state machine:

| Mode | Meaning |
| --- | --- |
| `idle` | Navigate the editor without an active gesture |
| `insert` | Choose and place a node |
| `selected` | Inspect one or more nodes |
| `direct-edit` | Edit text or other inline content |
| `transform` | Resize, position, rotate, or change layout placement |
| `pan` | Move the editor viewport |
| `preview` | Send input to the real web application |
| `play` | Run continuous application or game behavior |

Edit, Preview, and Play must be distinct. A click selects a button in Edit mode but activates it in
Preview mode and may become player input in Play mode.

### Runtime isolation

User HTML, CSS, and JavaScript run in a controlled runtime frame rather than the editor document.
Selection outlines and transform handles are editor-owned overlays. This boundary prevents project
styles and scripts from corrupting the editor and provides a place to capture runtime errors,
reload state, and enforce preview permissions.

## Program workspace

“Program workspace” is the architectural name for the UI currently called Source or Blueprint. It
will eventually offer three projections:

1. **Blueprint:** node graph with execution and typed data edges;
2. **Blocks:** Scratch-like structured stacks for introductory and compact procedural logic;
3. **Code:** JavaScript or TypeScript with source navigation and diagnostics.

### Blueprint is the first implementation

The first visual programming mode will be UE-style Blueprint because the product must represent
component events, data flow, functions, asynchronous work, state, API calls, and later game logic.
Blocks remain a valuable later projection for simpler procedures and learning workflows.

A Blueprint node may expose:

- execution inputs and outputs;
- typed data inputs and outputs;
- success, error, and asynchronous completion paths;
- DOM, component, asset, state, or entity references;
- source location and runtime trace metadata.

The workspace needs a node palette, infinite graph canvas, scope breadcrumbs, search, minimap,
diagnostics, and execution highlighting. Example scope:

```text
App / CheckoutPage / SubmitButton / onClick
```

## Visual-code round trip contract

Strata cannot promise that arbitrary JavaScript or TypeScript always becomes a clear visual graph.
The supported contract has three levels:

1. **Managed logic:** Strata-created events, expressions, control flow, functions, bindings, and
   API operations can round-trip between Blueprint and generated TypeScript.
2. **Recognized code:** valid source that can be parsed but does not have an ergonomic graph form
   appears as a collapsed or compound node.
3. **Opaque code:** unsupported syntax remains in a typed Code Node with declared inputs, outputs,
   effects, and source text.

The guarantee is semantic preservation with an explicit fallback, not identical formatting or a
beautiful graph for every program. Unsupported source must never be silently discarded.

## Strata Project Model

The former Element Model becomes one domain within a larger project model:

```text
StrataProject
|- documents
|  |- pages
|  |- DOM trees
|  `- reusable components
|- styles
|  |- rules and scopes
|  |- tokens
|  `- themes
|- programs
|  |- events and functions
|  |- variables and state
|  `- graphs, AST, and opaque code
|- scenes
|  |- Canvas entities
|  |- transforms
|  `- scene components
|- assets
|- data and API schemas
`- runtime, dependencies, build, and deployment settings
```

The base node is renderer-neutral. DOM nodes add tags, attributes, and CSS; component instances add
props and slots; later scene entities add transforms and entity components. Game objects must not
be forced to pretend they are HTML elements.

## Renderer and framework boundaries

The first renderer targets standard DOM, CSS, and browser JavaScript/TypeScript. Later integrations
should be adapters rather than fields embedded into every core node:

```text
Project Model -> DOM renderer       -> HTML/CSS/JS
              -> React adapter      -> React/TSX
              -> Canvas 2D runtime  -> web scene
              -> later WebGL runtime
```

This keeps the project model stable while allowing framework-specific import and export rules.

## Agent sidecar and VonishAgent boundary

The Agent is not only a chat panel. It receives explicit editor context and proposes the same
operations available to human and visual-programming tools.

Required context includes current project, workspace, selection, viewport, graph scope, recent
operations, diagnostics, runtime errors, and an optional preview capture.

Required review flow:

```text
request -> plan -> structured changes -> preview -> apply -> undo
```

VonishAgent should integrate through an adapter rather than direct React state or DOM manipulation:

```ts
interface AgentBridge {
  getProjectSnapshot(): ProjectSnapshot;
  getCurrentContext(): EditorContext;
  proposeOperations(request: AgentRequest): Promise<OperationPlan>;
  previewOperations(plan: OperationPlan): Promise<PreviewResult>;
  applyOperations(planId: string): Promise<Transaction>;
  undoTransaction(transactionId: string): Promise<void>;
}
```

## Shared operation protocol

The Inspector, Stage gestures, Blueprint, code transforms, importer, and Agent all produce a common
operation vocabulary:

```text
InsertNode       RemoveNode       MoveNode
SetTag           SetContent       SetAttribute
RemoveAttribute SetStyle         SetAccessibility
CreateFunction  ConnectGraph     BindInteraction
AddDependency   UpdateAsset      UpdateProjectSetting
```

Every transaction records source, before/after state, scope, and transaction ID. This is the basis
for deterministic undo, Agent review, history, and later collaboration.

## Delivery sequence

### Phase 1 — web interface loop

- canonical DOM Element Model and typed Property Schema;
- Stage insertion, selection, direct editing, and layout-aware manipulation;
- HTML/CSS import and export with unknown-value preservation;
- sandboxed preview runtime;
- operation history and responsive/state scopes;
- persistent Agent sidecar shell.

### Phase 2 — program loop

- Blueprint IR and graph editor;
- events, values, conditions, loops, functions, and application state;
- DOM/component references and API calls;
- TypeScript generation, diagnostics, tracing, and Code Node fallback;
- Agent graph operations.

### Phase 3 — application development

- reusable components, props, slots, and variants;
- routing, data binding, data sources, and dependencies;
- framework adapters, tests, build, and publishing workflows.

### Phase 4 — web scenes and games

- Canvas 2D scene, entity, transform, sprite, input, animation, camera, and game loop;
- optional collision or physics adapters;
- WebGL only after the 2D scene contract and Play mode are stable.

## First end-to-end acceptance slice

The first slice after the model foundation is deliberately small:

1. insert Button and Text nodes;
2. edit typed content, color, size, and radius properties;
3. connect `Button Click -> Set Text` in Blueprint;
4. generate and execute TypeScript in the isolated runtime;
5. let the Agent propose an equivalent change;
6. preview, apply, and undo the complete transaction.

This slice is complete only when every surface reads the same project state and produces the same
operation semantics.
