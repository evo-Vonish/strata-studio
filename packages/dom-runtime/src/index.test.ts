import type { StrataNode, StrataProject } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import { buildStageDocument, compileDocument } from "./index";

const element = (
  id: string,
  parentId: string | null,
  tag: string,
  children: string[] = [],
): StrataNode => ({
  id,
  kind: "element",
  type: "Box",
  tag,
  parentId,
  children,
  attributes: {},
  styleRules: [],
  accessibility: { aria: {} },
  interactions: [],
  editor: {},
});
const project = (): StrataProject => ({
  version: "0.1",
  id: "project",
  activeDocumentId: "page",
  documents: {
    page: {
      id: "page",
      rootNodeIds: ["root", "image"],
      nodes: {
        root: {
          ...element("root", null, "main", ["text", "button"]),
          attributes: { title: { kind: "literal", value: `A & "B"` } },
        },
        text: {
          id: "text",
          kind: "text",
          type: "Text",
          parentId: "root",
          children: [],
          attributes: {},
          content: { kind: "literal", value: "<hello> & goodbye" },
          styleRules: [],
          accessibility: { aria: {} },
          interactions: [],
          editor: {},
        },
        button: {
          ...element("button", "root", "button"),
          content: { kind: "literal", value: "Go" },
          attributes: { disabled: { kind: "literal", value: true } },
        },
        image: {
          ...element("image", null, "img"),
          attributes: {
            src: { kind: "asset", assetId: "logo" },
            alt: { kind: "literal", value: "Logo" },
          },
        },
      },
    },
  },
  assets: { logo: { id: "logo", kind: "image", url: "/logo.png" } },
  programs: {},
});

describe("DOM runtime", () => {
  it("renders nested and multiple roots with escaping and void elements", () => {
    const result = compileDocument(project());
    expect(result.html).toBe(
      '<main data-strata-node-id="root" title="A &amp; &quot;B&quot;">&lt;hello&gt; &amp; goodbye<button data-strata-node-id="button" disabled>Go</button></main><img data-strata-node-id="image" alt="Logo" src="/logo.png">',
    );
  });
  it("filters active tags, handlers and URL schemes", () => {
    const input = project();
    const node = input.documents.page?.nodes.root;
    if (!node) throw new Error("fixture missing");
    node.tag = "script";
    node.attributes = {
      onclick: { kind: "literal", value: "alert(1)" },
      href: { kind: "literal", value: " java\nscript:alert(1)" },
    };
    const result = compileDocument(input);
    expect(result.html).toContain('<div data-strata-node-id="root">');
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("javascript");
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["BLOCKED_TAG", "BLOCKED_ATTRIBUTE", "BLOCKED_URL"]),
    );
  });
  it("preserves safe unknown elements with stable node identity", () => {
    const input = project();
    const image = input.documents.page?.nodes.image;
    if (!image) throw new Error("fixture missing");
    image.kind = "unknown";
    image.tag = "x-imported-widget";
    image.attributes = { "data-source": { kind: "literal", value: "import" } };
    const result = compileDocument(input);
    expect(result.html).toContain(
      '<x-imported-widget data-strata-node-id="image" data-source="import"></x-imported-widget>',
    );
  });
  it("compiles deterministic scoped CSS", () => {
    const input = project();
    const node = input.documents.page?.nodes.root;
    if (!node) throw new Error("fixture missing");
    node.styleRules = [
      {
        scope: {},
        properties: {
          color: { kind: "color", value: "#fff" },
          fontSize: { kind: "dimension", value: 16, unit: "px" },
        },
      },
      {
        scope: { state: "hover", breakpoint: "mobile" },
        properties: { opacity: { kind: "literal", value: 0.5 } },
      },
    ];
    const first = compileDocument(input);
    const second = compileDocument(structuredClone(input));
    expect(first).toEqual(second);
    expect(first.html).toContain('class="strata-n-72-6f-6f-74"');
    expect(first.css).toContain(".strata-n-72-6f-6f-74{color:#fff;font-size:16px}");
    expect(first.css).toContain(
      "@media (max-width: 767px){.strata-n-72-6f-6f-74:hover{opacity:0.5}}",
    );
  });
  it("warns for unsupported scopes, bindings and unresolved assets", () => {
    const input = project();
    const root = input.documents.page?.nodes.root;
    const image = input.documents.page?.nodes.image;
    if (!root || !image) throw new Error("fixture missing");
    root.content = { kind: "binding", expression: "state.title" };
    root.styleRules = [
      { scope: { variant: "primary" }, properties: { color: { kind: "color", value: "red" } } },
    ];
    image.attributes.src = { kind: "asset", assetId: "missing", fallbackUrl: "/fallback.png" };
    const result = compileDocument(input);
    expect(result.html).toContain('src="/fallback.png"');
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["UNRESOLVED_BINDING", "MISSING_ASSET", "UNSUPPORTED_SCOPE"]),
    );
  });
  it("serializes token, reference and raw values while blocking unsafe CSS", () => {
    const input = project();
    const root = input.documents.page?.nodes.root;
    if (!root) throw new Error("fixture missing");
    root.attributes["aria-controls"] = { kind: "reference", nodeId: "button" };
    root.styleRules = [
      {
        scope: { state: "focus-visible", breakpoint: "desktop" },
        properties: {
          color: { kind: "token", tokenId: "brand" },
          width: { kind: "raw", cssText: "calc(100% - 1rem)" },
          background: { kind: "raw", cssText: "url(javascript:bad)" },
        },
      },
    ];
    const result = compileDocument(input);
    expect(result.html).toContain('aria-controls="button"');
    expect(result.css).toContain("color:var(--token-62-72-61-6e-64)");
    expect(result.css).toContain("width:calc(100% - 1rem)");
    expect(result.css).not.toContain("javascript");
    expect(result.warnings.some((item) => item.code === "BLOCKED_CSS_VALUE")).toBe(true);
  });
  it("builds a complete script-free stage document with a restrictive CSP", () => {
    const srcDoc = buildStageDocument(project(), undefined, { title: "Preview <safe>" });
    expect(srcDoc).toMatch(/^<!doctype html>/);
    expect(srcDoc).toContain("Content-Security-Policy");
    expect(srcDoc).toContain("script-src &#39;none&#39;");
    expect(srcDoc).toContain("Preview &lt;safe&gt;");
    expect(srcDoc).not.toContain("<script");
  });
});
