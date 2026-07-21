import { beforeEach, describe, expect, it } from "vitest";
import { buildPreviewDocument, extractElement } from "./index";

function deterministicIds() {
  let index = 0;
  return () => String(++index);
}

function mockBounds(element: Element): void {
  element.getBoundingClientRect = () =>
    ({
      x: 24,
      y: 32,
      top: 32,
      right: 264,
      bottom: 152,
      left: 24,
      width: 240,
      height: 120,
      toJSON: () => ({}),
    }) as DOMRect;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "Extractor fixture";
});

describe("extractElement", () => {
  it("captures a sanitized DOM, matching CSS, assets, context, and geometry", () => {
    document.head.innerHTML = `
      <style>
        .workspace .card { color: rgb(70, 40, 180); display: grid; }
        .card > .label { font-weight: 700; }
        .unrelated { color: red; }
      </style>
    `;
    document.body.innerHTML = `
      <main class="workspace">
        <article class="card" onclick="alert('nope')">
          <span class="label">Signal</span>
          <img src="./cover.png" alt="cover">
          <script>window.bad = true</script>
        </article>
      </main>
    `;
    const card = document.querySelector(".card");
    if (!card) throw new Error("Fixture card is missing");
    mockBounds(card);

    const bundle = extractElement(card, {
      idFactory: deterministicIds(),
      now: () => new Date("2026-07-22T10:00:00.000Z"),
    });

    expect(bundle.id).toBe("bundle-1");
    expect(bundle.root.id).toBe("element-2");
    expect(bundle.root.html).toContain('data-strata-id="element-2"');
    expect(bundle.root.html).not.toContain("onclick");
    expect(bundle.root.html).not.toContain("<script");
    expect(bundle.root.contextHtml).toContain('class="workspace"');
    expect(bundle.styles.matchedRules.map((rule) => rule.selectorText)).toEqual([
      ".workspace .card",
      ".card > .label",
    ]);
    expect(bundle.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "image",
          resolvedUrl: "http://localhost:3000/cover.png",
          status: "external",
        }),
      ]),
    );
    expect(bundle.geometry).toMatchObject({ left: 24, top: 32, width: 240, height: 120 });
    expect(bundle.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["EVENT_HANDLER_REMOVED", "ACTIVE_DESCENDANTS_REMOVED"]),
    );
    expect(bundle.fidelity.status).toBe("partial");
  });

  it("removes unsafe resource protocols and active form attributes", () => {
    document.body.innerHTML = `
      <form action="https://example.com/submit">
        <img src="javascript:alert(1)" onerror="alert(2)" alt="blocked">
      </form>
    `;
    const form = document.querySelector("form");
    if (!form) throw new Error("Fixture form is missing");
    mockBounds(form);

    const bundle = extractElement(form, { idFactory: deterministicIds() });

    expect(bundle.root.html).not.toContain("action=");
    expect(bundle.root.html).not.toContain("javascript:");
    expect(bundle.root.html).not.toContain("onerror");
    expect(bundle.assets).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "blocked" })]),
    );
  });
});

describe("buildPreviewDocument", () => {
  it("creates an inert, CSP-protected preview document", () => {
    document.body.innerHTML = '<article class="card">Preview</article>';
    const card = document.querySelector(".card");
    if (!card) throw new Error("Fixture card is missing");
    mockBounds(card);
    const bundle = extractElement(card, { idFactory: deterministicIds() });

    const preview = buildPreviewDocument(bundle);

    expect(preview).toContain("Content-Security-Policy");
    expect(preview).toContain("pointer-events: none !important");
    expect(preview).toContain(bundle.root.html);
    expect(preview).not.toContain("<script");
  });
});
