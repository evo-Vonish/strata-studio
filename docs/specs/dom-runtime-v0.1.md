# Strata DOM Runtime v0.1

Status: implemented M1.2 foundation

`@strata/dom-runtime` is the first executable projection of the Strata Project Model. It turns one
validated document into deterministic HTML and CSS, then packages that output as an inert Stage
document. It never becomes a second source of truth.

## Public contract

- `compileDocument(project, documentId?, options?)` returns `{ html, css, warnings }`;
- `buildStageDocument(project, documentId?, options?)` returns a complete HTML document with a
  restrictive Content Security Policy;
- `buildStageDocumentFromCompiled(compiled, options?)` wraps an existing deterministic
  `CompiledDocument` in that same inert Stage shell, for callers that also consume `warnings`;
- `compileDocument` and `buildStageDocument` validate project input through
  `@strata/project-model` before rendering;
- equivalent project state produces equivalent output.

Every rendered element carries `data-strata-node-id`. Authored style rules receive deterministic
generated classes derived from the same node ID. The editor uses the data attribute to map pointer
selection in the iframe back to the canonical node without relying on authored classes or DOM
position.

## Values and scopes

The runtime serializes literal, dimension, color, raw, token, reference, and asset values. Binding
values produce a warning until the later program runtime can evaluate them. Missing assets also
produce a warning and use an authored fallback URL when present.

Base, hover, focus, focus-visible, active, and disabled state rules compile to pseudo-classes.
The Studio maps its Desktop control to the unscoped cascade base. Tablet and mobile scopes compile
to media queries; an explicitly authored `desktop` breakpoint also compiles to its configured
minimum-width query. Color-mode and variant scopes are retained by the model but reported as
unsupported by this runtime.

## Preview security boundary

The Stage document blocks scripts, frames, objects, form submission, base URL mutation, and
script-initiated requests through `connect-src 'none'`. Declared image, media, and font resources
remain available through the CSP. The compiler rejects active attributes, unsafe URL protocols,
blocked element tags, invalid attribute names, invalid CSS property names, and CSS values containing
active injection patterns. User-authored content and attribute values are escaped before insertion
into markup.

The Studio mounts the result in an iframe with `allow-same-origin` only. Same-origin access exists so
the editor can select projected nodes and measure overlays; the document itself receives no script
permission.

`buildStageDocumentFromCompiled` is for output already produced by this runtime, not a second
untrusted-markup entry point. It preserves the shell CSP and does not replace compiler escaping or
sanitization.

## Studio data flow

```text
Inspector / Stage / Agent intent
            -> ProjectOperation[]
            -> Project Store + inverse history
            -> Strata Project Model
            -> DOM Runtime
            -> sandboxed Stage iframe
```

Undo and redo replay inverse and forward operations against the Project Model. They never restore a
DOM snapshot. Local storage contains the validated project, while history remains session-local in
v0.1.

The Studio compiles the active document once per Project Model render. It uses the resulting HTML
and CSS to construct the Stage shell through `buildStageDocumentFromCompiled`, and converts the
same result's warnings into Problems diagnostics. This prevents a diagnostic pass from causing a
second compilation or changing the CSP/sandbox boundary.

## Known boundaries

- component and slot semantics currently render as neutral elements with warnings;
- interactions and Blueprint programs are not executed;
- token declarations and binding evaluation need the later runtime environment;
- imported unknown nodes retain passthrough data, but advanced editing uses a future fallback
  Inspector;
- compiler warnings are connected to Problems for the active document; cross-document diagnostic
  navigation and property-specific Inspector focus are not connected yet.

## Verification

Package tests cover deterministic output, nested rendering, scoped styles, typed values, assets,
escaping, and unsafe input blocking. Studio integration tests render the React editor, verify that
the Stage document contains stable model IDs, commit a schema-generated width edit, and verify exact
undo through persisted Project state.
