import {
  type PropertyMap,
  parseProject,
  type StrataNode,
  type StrataProject,
  type StrataValue,
  type StyleRule,
} from "@strata/project-model";

export const STUDIO_DOCUMENT_ID = "home";
export const INITIAL_SELECTED_NODE_ID = "primary-action";

const literal = (value: string | number | boolean | null): StrataValue => ({
  kind: "literal",
  value,
});

const dimension = (value: number, unit = "px"): StrataValue => ({
  kind: "dimension",
  value,
  unit,
});

const color = (value: string): StrataValue => ({ kind: "color", value });
const raw = (cssText: string): StrataValue => ({ kind: "raw", cssText });

const baseStyle = (properties: PropertyMap): StyleRule => ({ scope: {}, properties });

const node = (
  id: string,
  type: string,
  tag: string,
  parentId: string | null,
  children: string[],
  options: {
    attributes?: PropertyMap;
    content?: StrataValue;
    styleRules?: StyleRule[];
    name?: string;
  } = {},
): StrataNode => ({
  id,
  kind: "element",
  type,
  tag,
  parentId,
  children,
  attributes: options.attributes ?? {},
  ...(options.content ? { content: options.content } : {}),
  styleRules: options.styleRules ?? [],
  accessibility: { aria: {} },
  interactions: [],
  editor: { name: options.name ?? id },
});

const signalArtwork =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 700'%3E%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop stop-color='%23b9ff66'/%3E%3Cstop offset='.2' stop-color='%237952ff'/%3E%3Cstop offset='1' stop-color='%23120f27'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='900' height='700' rx='48' fill='%23120f27'/%3E%3Ccircle cx='450' cy='350' r='250' fill='none' stroke='%238b78ff' stroke-opacity='.45' stroke-width='2'/%3E%3Ccircle cx='450' cy='350' r='165' fill='none' stroke='%23b9ff66' stroke-opacity='.55' stroke-width='2'/%3E%3Ccircle cx='450' cy='350' r='95' fill='url(%23g)'/%3E%3Ccircle cx='650' cy='200' r='12' fill='%23f4f0ff'/%3E%3C/svg%3E";

export function createStudioProject(): StrataProject {
  const nodes: Record<string, StrataNode> = {
    "page-root": node("page-root", "Box", "main", null, ["hero", "visual-card", "form-row"], {
      name: "Experience",
      styleRules: [
        baseStyle({
          "min-height": dimension(100, "vh"),
          display: literal("grid"),
          "grid-template-columns": raw("minmax(0, 1.05fr) minmax(320px, .95fr)"),
          "grid-template-areas": literal('"hero visual" "form visual"'),
          gap: dimension(40),
          padding: raw("clamp(36px, 7vw, 96px)"),
          "font-family": raw("Inter, ui-sans-serif, system-ui, sans-serif"),
          color: color("#f4f1ff"),
          "background-color": color("#120f27"),
          "background-image": raw(
            "radial-gradient(circle at 15% 15%, rgba(121,82,255,.28), transparent 36%), linear-gradient(145deg, #120f27, #090812)",
          ),
          "box-sizing": literal("border-box"),
        }),
        {
          scope: { breakpoint: "mobile" },
          properties: {
            "grid-template-columns": literal("1fr"),
            "grid-template-areas": literal('"hero" "visual" "form"'),
            padding: dimension(28),
          },
        },
      ],
    }),
    hero: node(
      "hero",
      "Box",
      "section",
      "page-root",
      ["eyebrow", "headline", "lede", "primary-action"],
      {
        name: "Hero",
        styleRules: [
          baseStyle({
            "grid-area": literal("hero"),
            display: literal("flex"),
            "flex-direction": literal("column"),
            "align-items": literal("flex-start"),
            "justify-content": literal("center"),
            gap: dimension(22),
            "max-width": dimension(720),
          }),
        ],
      },
    ),
    eyebrow: node("eyebrow", "Text", "span", "hero", [], {
      content: literal("STRATA / MODEL-BACKED STAGE"),
      name: "Eyebrow",
      styleRules: [
        baseStyle({
          color: color("#b9ff66"),
          "font-family": raw("ui-monospace, SFMono-Regular, Menlo, monospace"),
          "font-size": dimension(12),
          "font-weight": literal(700),
          "letter-spacing": dimension(0.16, "em"),
        }),
      ],
    }),
    headline: node("headline", "Text", "h1", "hero", [], {
      content: literal("Design the interface. Program the behavior."),
      name: "Headline",
      styleRules: [
        baseStyle({
          margin: dimension(0),
          "max-width": dimension(760),
          "font-size": raw("clamp(48px, 7vw, 92px)"),
          "font-weight": literal(760),
          "line-height": literal(0.96),
          "letter-spacing": dimension(-0.055, "em"),
        }),
      ],
    }),
    lede: node("lede", "Text", "p", "hero", [], {
      content: literal(
        "One project model now drives the canvas, typed properties, history, and the code we will generate next.",
      ),
      name: "Introduction",
      styleRules: [
        baseStyle({
          margin: dimension(0),
          "max-width": dimension(610),
          color: color("#b8b1cf"),
          "font-size": dimension(18),
          "line-height": dimension(1.65, "em"),
        }),
      ],
    }),
    "primary-action": node("primary-action", "Button", "button", "hero", [], {
      attributes: { type: literal("button") },
      content: literal("Edit this model"),
      name: "Primary action",
      styleRules: [
        baseStyle({
          width: dimension(184),
          height: dimension(52),
          border: literal("0"),
          "border-radius": dimension(16),
          color: color("#111608"),
          "background-color": color("#b9ff66"),
          "font-size": dimension(15),
          "font-weight": literal(720),
          cursor: literal("pointer"),
          transition: raw("transform 160ms ease, background-color 160ms ease"),
        }),
        {
          scope: { state: "hover" },
          properties: {
            transform: literal("translateY(-2px)"),
            "background-color": color("#d0ff9b"),
          },
        },
      ],
    }),
    "visual-card": node("visual-card", "Box", "aside", "page-root", ["signal-image"], {
      name: "Signal visual",
      styleRules: [
        baseStyle({
          "grid-area": literal("visual"),
          display: literal("grid"),
          "place-items": literal("center"),
          padding: dimension(18),
          border: raw("1px solid rgba(255,255,255,.12)"),
          "border-radius": dimension(30),
          "background-color": color("#1c1738"),
          "box-shadow": raw("0 30px 80px rgba(0,0,0,.38)"),
        }),
      ],
    }),
    "signal-image": node("signal-image", "Image", "img", "visual-card", [], {
      attributes: {
        src: { kind: "asset", assetId: "signal-artwork" },
        alt: literal("Abstract orbital signal visualization"),
        loading: literal("eager"),
        decoding: literal("async"),
      },
      name: "Signal image",
      styleRules: [
        baseStyle({
          display: literal("block"),
          width: dimension(100, "%"),
          height: dimension(100, "%"),
          "min-height": dimension(440),
          "object-fit": literal("cover"),
          "border-radius": dimension(20),
        }),
      ],
    }),
    "form-row": node("form-row", "Box", "section", "page-root", ["email-input", "form-note"], {
      name: "Input demo",
      styleRules: [
        baseStyle({
          "grid-area": literal("form"),
          display: literal("grid"),
          "grid-template-columns": raw("minmax(220px, 360px) 1fr"),
          "align-items": literal("center"),
          gap: dimension(18),
        }),
        {
          scope: { breakpoint: "mobile" },
          properties: { "grid-template-columns": literal("1fr") },
        },
      ],
    }),
    "email-input": node("email-input", "Input", "input", "form-row", [], {
      attributes: {
        type: literal("email"),
        name: literal("email"),
        placeholder: literal("you@example.com"),
        autocomplete: literal("email"),
      },
      name: "Email input",
      styleRules: [
        baseStyle({
          width: dimension(100, "%"),
          height: dimension(48),
          padding: raw("0 16px"),
          border: raw("1px solid rgba(255,255,255,.18)"),
          "border-radius": dimension(14),
          color: color("#f4f1ff"),
          "background-color": color("#211b42"),
          "font-size": dimension(14),
          outline: literal("none"),
          "box-sizing": literal("border-box"),
        }),
        {
          scope: { state: "focus" },
          properties: {
            "border-color": color("#b9ff66"),
            "box-shadow": raw("0 0 0 3px rgba(185,255,102,.14)"),
          },
        },
      ],
    }),
    "form-note": node("form-note", "Text", "p", "form-row", [], {
      content: literal("Five primitives, one canonical project, zero direct DOM edits."),
      name: "Model status",
      styleRules: [
        baseStyle({
          margin: dimension(0),
          color: color("#8f86aa"),
          "font-size": dimension(13),
          "line-height": literal(1.5),
        }),
      ],
    }),
  };

  return parseProject({
    version: "0.1",
    id: "strata-studio-demo",
    name: "Strata M1",
    activeDocumentId: STUDIO_DOCUMENT_ID,
    documents: {
      [STUDIO_DOCUMENT_ID]: {
        id: STUDIO_DOCUMENT_ID,
        name: "Home",
        rootNodeIds: ["page-root"],
        nodes,
      },
    },
    assets: {
      "signal-artwork": {
        id: "signal-artwork",
        kind: "image",
        url: signalArtwork,
      },
    },
    programs: {},
  });
}

export function selectedNode(project: StrataProject, nodeId: string | null): StrataNode | null {
  if (!nodeId) return null;
  return project.documents[project.activeDocumentId]?.nodes[nodeId] ?? null;
}
