# Element Model and Property Schema

Date: 2026-07-22

Status: accepted architectural baseline; implementation pending

## Purpose

The Element Model is the canonical editable representation of a page or DOM component. The Stage,
Inspector, visual source views, importer, exporter, and Agent operate on this representation instead
of independently mutating HTML strings or a rendered DOM.

It is a domain inside the wider Strata Project Model. Program logic, assets, data, and later game
entities have their own models and reference element IDs through typed links.

## Two registries, not one tag list

Strata maintains two related catalogs.

### Native Element Registry

The native registry represents real HTML, SVG, custom elements, attributes, content rules, and
semantic relationships. Its job is faithful import/export and advanced editing. Unknown tags,
attributes, and declarations must survive round trips.

### Authoring Block Registry

The authoring registry exposes useful concepts such as Box, Stack, Grid, Heading, Button, Image,
Form, and Card. A block compiles to one or more native nodes and may allow its semantic tag to be
changed.

For example, Stack describes layout behavior but can output `div`, `section`, `nav`, or another
permitted semantic container. Visual type and HTML tag are separate fields.

## Element data layers

Each editable element is composed from six concerns:

| Layer | Responsibility |
| --- | --- |
| Structure | node kind, tag, parent, children, slots, ordering |
| Content and attributes | text, media sources, links, form values, HTML attributes |
| Authored style | layout, dimensions, typography, color, border, effects |
| Scopes | breakpoints, pseudo states, themes, and component variants |
| Semantics and behavior | accessibility, events, bindings, and references |
| Editor metadata | stable ID, name, lock, visibility, component boundaries |

The editor stores authored declarations and their provenance. Computed browser styles may be shown
as effective values but are not copied wholesale into the project.

## Support tiers

Element support is intentionally tiered:

1. **Default blocks:** small, understandable primitives in the insertion UI.
2. **Advanced editable natives:** media, tables, dialogs, detailed form controls, and SVG.
3. **System or import-only nodes:** metadata, scripts, templates, source/track children, and unknown
   custom elements that remain available through document settings or advanced views.

All recognized HTML can be preserved without presenting every tag as a beginner-facing block.

## Initial authoring catalog

The first default catalog contains 18 high-value blocks:

| Family | Blocks | Principal native output |
| --- | --- | --- |
| Document | Page | `html`, `body`, document settings |
| Layout | Section, Box, Stack, Grid | semantic container or `div` |
| Text | Heading, Text, Link | `h1`-`h6`, `p`, `span`, `a` |
| Controls | Button | `button` |
| Media | Image, Icon | `img`, `picture`, `svg` |
| Structure | Divider, List | `hr`, `ul`, `ol`, `li` |
| Forms | Form, Input, Textarea, Select, Checkbox/Radio | native form controls |

Card, Navbar, Hero, and similar concepts should normally be composed components rather than new
primitive node kinds.

## Element-specific property families

Shared visual properties come from capabilities. Element definitions list only their semantic or
behavior-specific fields.

| Element family | Element-specific properties |
| --- | --- |
| Page | title, language, direction, description, favicon, viewport, theme |
| Semantic container | tag, accessible label, children/slots |
| Heading | level, structured inline content, anchor ID |
| Link | `href`, target, relation, download, language, referrer policy |
| Ordered list | start, reversed, marker type, item collection |
| Image/Picture | source, alt text, source set, sizes, loading, decoding, fetch priority |
| Icon/SVG | icon/asset ID, view box, title, decorative state, fill, stroke |
| Video/Audio | sources, controls, autoplay, muted, loop, preload, tracks, poster where applicable |
| Form | action, method, encoding, target, autocomplete, validation mode |
| Input | type plus type-dependent name, value, placeholder, autocomplete, min/max/step, pattern, checked, accept, or multiple |
| Textarea | name, value, placeholder, rows, columns, length limits, wrap |
| Select | name, multiple, size, required, options and option groups |
| Button | content, type, disabled, name, value, form overrides |
| Details/Dialog | open state and element-specific runtime behavior |
| Table | caption, rows, cells, spans, headers, and header scope |
| Custom component | component/version ID, props, slots, exposed capabilities |

System elements such as `head`, `meta`, `link`, `style`, `script`, `template`, `source`, and `track`
are managed through document, resource, code, or parent-media interfaces rather than the normal
block drawer.

## Capabilities and shared visual properties

An element inherits only the capabilities that apply to it:

| Capability | Representative properties |
| --- | --- |
| Box | display, visibility, box sizing, overflow |
| Sizing | width, height, min/max sizes, aspect ratio |
| Spacing | margin, padding, row/column gap |
| Flex container/item | direction, wrap, alignment, grow, shrink, basis, order |
| Grid container/item | tracks, areas, flow, placement, spans |
| Position | position mode, inset, stacking order |
| Typography | family, size, weight, line height, spacing, alignment, decoration |
| Background | color, image, gradient, repeat, size, position |
| Border and shape | side widths/styles/colors, outline, corner radii |
| Effects | opacity, shadows, filters, blend modes |
| Transform | translate, rotate, scale, skew, origin, perspective |
| Motion | transition, animation, timing and delay |
| Interaction | cursor, pointer events, user selection |
| Replaced content | object fit and object position |
| List/table | list marker, border collapse/spacing, table layout |
| Advanced CSS | custom properties and raw declarations |

Definitions compose instead of duplicating panels:

```text
Button
  = CoreNode
  + Box
  + Sizing
  + Typography
  + Background
  + BorderAndShape
  + Effects
  + Interactive
  + FormAssociated
  + ButtonSpecific
```

## Typed values and provenance

A property cannot be represented only by a string or number. It may be unset, literal, dimensional,
token-based, data-bound, or an expression that Strata does not yet understand.

```ts
type StrataValue =
  | { kind: "unset" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "dimension"; value: number; unit: string }
  | { kind: "color"; value: string }
  | { kind: "asset"; assetId: string; fallbackUrl?: string }
  | { kind: "reference"; nodeId: string }
  | { kind: "token"; tokenId: string }
  | { kind: "binding"; expression: string }
  | { kind: "raw"; cssText: string };
```

The raw fallback preserves values such as `calc()`, `clamp()`, custom functions, and declarations
introduced by newer platform features. `auto`, `inherit`, `initial`, `unset`, `revert`, and CSS
custom properties must remain distinguishable from an absent value.

## Property definition

```ts
interface PropertyDefinition<T = StrataValue> {
  id: string;
  label: string;
  group: string;
  target: "content" | "attribute" | "style" | "aria" | "interaction" | "editor";
  valueType: string;
  control: string;
  appliesTo?: string[];
  options?: Array<{ label: string; value: unknown }>;
  units?: string[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: T;
  responsive?: boolean;
  stateful?: boolean;
  inheritable?: boolean;
  visibleWhen?: Condition;
  validate?: Validator;
  parse?: Parser<T>;
  serialize?: Serializer<T>;
  ai?: {
    description: string;
    examples?: string[];
    constraints?: string[];
  };
}
```

`appliesTo` and `visibleWhen` are required for type-dependent controls. For example, checked applies
to checkbox and radio inputs, while min/max/step apply to numeric and temporal input variants.

## Element definition

```ts
interface ElementDefinition {
  type: string;
  label: string;
  category: string;
  tags: string[];
  defaultTag: string;
  capabilities: string[];
  properties: string[];
  events: string[];
  acceptsChildren: boolean;
  allowedParents?: string[];
  allowedChildren?: string[];
  defaultNode: Partial<StrataNode>;
}
```

Content rules prevent or repair invalid structures such as a table cell outside a table row, an
option outside a selection context, or interactive content nested where the platform forbids it.

## Node model and style scopes

```ts
interface StrataNode {
  id: string;
  kind: "element" | "text" | "component" | "slot";
  type: string;
  tag?: string;
  attributes: Record<string, StrataValue>;
  content?: RichContent;
  children: string[];
  styleRules: Array<{
    scope: {
      breakpoint?: string;
      state?: string;
      colorMode?: string;
      variant?: string;
    };
    properties: Record<string, StrataValue>;
  }>;
  accessibility: {
    role?: string;
    aria: Record<string, StrataValue>;
  };
  interactions: InteractionBinding[];
  editor: {
    name?: string;
    locked?: boolean;
    hidden?: boolean;
  };
  passthrough?: {
    originalTag?: string;
    unknownAttributes?: Record<string, string>;
    unknownStyles?: Record<string, string>;
  };
}
```

The stable Strata node ID is not the same as the user-visible DOM `id` attribute.

The first state scopes are base, hover, focus, focus-visible, active, and disabled. The first
breakpoints are desktop, tablet, and mobile. Later scopes include checked, indeterminate,
valid/invalid, focus-within, open, component variants, and theme modes. Editing one scope must not
overwrite another.

## Imported CSS and effective values

Imported classes and external rules remain separate from Strata-authored overrides. The Inspector
may display:

- the effective browser value;
- the authored value, if any;
- its source rule, class, token, binding, or breakpoint;
- whether a more specific declaration overrides it.

Serialization should normally generate stable classes for Strata-authored styles while preserving
original classes and rules. Inline styles remain supported when required by imported source or an
explicit export mode.

## Accessibility behavior

The schema computes appropriate accessibility fields from element semantics and role rather than
showing every ARIA property on every node. The editor should warn about missing accessible names,
image alternatives, labels, and invalid relationships, but must not silently add incorrect roles or
ARIA values.

## Shared edit operations

Stage controls, Inspector controls, Blueprint, importers, and the Agent use the same reversible
operations:

```text
InsertNode       RemoveNode       MoveNode
SetTag           SetContent       SetAttribute
RemoveAttribute SetStyle         SetAccessibility
BindInteraction SetEditorMetadata
```

`SetStyle` always includes a style scope. Operations record source (`human`, `blueprint`, `agent`,
or `import`), transaction ID, and exact before/after values.

## First implementation slice

Begin with Box, Text, Button, Image, and Input rather than the whole catalog. Implement in this
order:

1. typed value codecs and raw fallback;
2. Property Registry and capability composition;
3. Element Registry and content constraints;
4. common operations and exact undo;
5. schema-generated Inspector controls;
6. HTML/Model import-export tests from the first five elements;
7. responsive and state scopes;
8. expansion to the remaining default blocks.

## Acceptance criteria

- HTML -> Model -> HTML remains semantically equivalent.
- Unknown tags, attributes, classes, declarations, and unsupported values survive a round trip.
- Stage, Inspector, Blueprint, and Agent edits produce equivalent model operations.
- Undo restores the exact authored value and its source.
- Breakpoint and state edits never overwrite base values.
- Invalid parent/child relationships are rejected or repaired explicitly.
- Accessibility problems are surfaced without inventing incorrect semantics.
- Computed styles do not expand into a permanent full-style snapshot.
