# Property Registry v0.1

Status: M1.1 implementation contract

## Objective

The Property Registry converts reusable element capabilities into a deterministic, inspectable set
of editable fields. The Stage, Inspector, importer, exporter, and Agent use the same definitions for
types, defaults, applicability, validation, parsing, and serialization.

The registry avoids two failure modes:

- one hand-written Inspector for every element;
- one flat panel containing every HTML attribute and CSS property.

## Registry layers

```text
Property Registry
      ^
      |
Capability Registry
      ^
      |
Element Registry
```

A capability names an ordered set of property IDs. An element selects capabilities and adds only
its element-specific fields. Resolution produces the final Inspector schema.

## Property definition

```ts
interface PropertyDefinition {
  id: string;
  label: string;
  group: string;
  target: "content" | "tag" | "attribute" | "style" | "aria" | "interaction" | "editor";
  storageKey?: string;
  valueType: string;
  control: string;
  defaultValue?: StrataValue;
  options?: Array<{ label: string; value: string | number | boolean }>;
  units?: string[];
  min?: number;
  max?: number;
  step?: number;
  responsive?: boolean;
  stateful?: boolean;
  inheritable?: boolean;
  appliesTo?: string[];
  visibleWhen?: Condition;
}
```

Properties refer to `StrataValue` from `@strata/project-model`; the schema package must not create a
second incompatible value model.

`id` is stable editor identity while `storageKey` names the real HTML attribute or CSS declaration.
For example, both `buttonType` and `inputType` store into the native `type` attribute, and
`backgroundColor` stores into `background-color`.

## Controls

The first control vocabulary is data-oriented and UI-framework-neutral:

```text
text       textarea    number      toggle
select     segmented   color       dimension
asset      url         combobox    code
```

React components consume this vocabulary but do not define its semantics.

## Conditions

M1.1 conditions compare known element context without evaluating arbitrary JavaScript. Supported
operators are equality, membership, existence, all, any, and not.

Examples:

```ts
{ property: "inputType", equals: "checkbox" }

{
  any: [
    { property: "inputType", equals: "number" },
    { property: "inputType", equals: "range" }
  ]
}
```

`appliesTo` determines semantic validity. `visibleWhen` controls progressive disclosure. Hiding a
field does not silently erase an already-authored value.

## Registration invariants

- property, capability, and element IDs are unique;
- every capability property ID resolves;
- every element capability and element-specific property resolves;
- duplicate property IDs in a resolved element are deduplicated deterministically;
- conflicting definitions with the same ID are rejected, not merged silently;
- registry output is stable for the same registration order and input context;
- lookup of an unknown ID has explicit safe and throwing variants.

Capability order establishes Inspector order, not CSS cascade priority.

## Initial capabilities

| Capability | Initial concerns |
| --- | --- |
| `box` | display and overflow |
| `sizing` | width, height, minimum width, maximum width |
| `spacing` | margin, padding, gap |
| `flex-container` | direction, wrap, justify, align |
| `flex-item` | grow, shrink, and basis |
| `typography` | family, size, weight, line height, alignment, color |
| `background` | background color |
| `border` | width, color, and radius |
| `effects` | opacity, box shadow |
| `interactive` | cursor and pointer events |
| `replaced-content` | object fit and object position |

M1.1 implements a focused high-value subset. Completeness is less important than typed,
composable behavior.

## Initial elements

### Box

- native tag defaults to `div`;
- accepts children;
- capabilities: box, sizing, spacing, flex container/item, background, border, effects;
- element field: semantic tag.

### Text

- native tag defaults to `p`;
- structured content is represented through the content target;
- capabilities: typography, spacing, and flex item;
- element field: semantic text tag.

### Button

- native tag is `button`;
- capabilities: box, sizing, spacing, typography, background, border, effects, flex item,
  interactive;
- element fields: content, button type, disabled, name, value;
- exposes click and focus-related events;
- supports base, hover, focus, active, and disabled style scopes.

### Image

- native tag defaults to `img`;
- does not accept children;
- capabilities: box, sizing, spacing, border, effects, flex item, and replaced content;
- element fields: source/asset, alt text, loading, decoding, fetch priority.

### Input

- native tag is `input`;
- does not accept children;
- capabilities: box, sizing, spacing, typography, background, border, effects, flex item,
  interactive;
- common fields: type, name, value, placeholder, autocomplete, required, read-only, disabled;
- conditional fields include min/max/step, checked, pattern, length limits, accept, and multiple;
- exposes input, change, focus, and blur events.

## Responsive and state metadata

`responsive` means an authored value may vary by breakpoint. `stateful` means it may vary by an
interaction or component state. These flags authorize Inspector scope controls; they do not store
the values themselves.

Content and semantic HTML attributes are normally not stateful. Visual properties commonly are.
Inherited typography fields declare `inheritable` so the Inspector can distinguish an effective
inherited value from a local authored value.

## AI metadata

A later extension may add descriptions, examples, and constraints for Agent tool generation. M1.1
keeps definitions serializable and deterministic so this metadata can be added without changing
property identity.

## Required tests

- complete default registry builds without unresolved references;
- duplicate registration is rejected;
- each initial element resolves expected capabilities and specific fields;
- capability properties are ordered and deduplicated;
- Input conditions distinguish text, numeric, checkbox/radio, and file variants;
- Button and Image exclude invalid element-specific properties;
- responsive/stateful/inheritable metadata is retained;
- unknown lookups and malformed definitions fail explicitly.
