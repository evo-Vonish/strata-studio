import { describe, expect, it } from "vitest";
import {
  parseElementBundle,
  STRATA_ELEMENT_BUNDLE_VERSION,
  type StrataElementBundle,
  safeParseElementBundle,
} from "./index";

function createFixture(): StrataElementBundle {
  return {
    version: STRATA_ELEMENT_BUNDLE_VERSION,
    id: "bundle-card-1",
    source: {
      url: "https://example.com/demo",
      title: "Demo",
      capturedAt: "2026-07-22T10:00:00.000Z",
      viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    },
    root: {
      id: "element-card-1",
      selector: "#card",
      tagName: "article",
      html: '<article id="card">Hello</article>',
      textContent: "Hello",
    },
    styles: {
      matchedRules: [
        {
          cssText: ".card { color: rebeccapurple; }",
          selectorText: ".card",
          conditions: [],
        },
      ],
      computedFallback: { display: "block" },
      variables: { "--accent": "rebeccapurple" },
      pseudoElements: [],
      fontFaces: [],
      keyframes: [],
    },
    assets: [],
    geometry: {
      x: 10,
      y: 20,
      top: 20,
      right: 210,
      bottom: 120,
      left: 10,
      width: 200,
      height: 100,
    },
    warnings: [],
    fidelity: {
      status: "exact",
      score: 1,
      checks: [{ name: "schema", status: "passed" }],
    },
  };
}

describe("Strata Element Bundle schema", () => {
  it("accepts and preserves a valid v0.1 bundle", () => {
    const fixture = createFixture();
    expect(parseElementBundle(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
  });

  it("rejects an unknown bundle version", () => {
    const fixture = { ...createFixture(), version: "9.9" };
    expect(safeParseElementBundle(fixture).success).toBe(false);
  });

  it("rejects inconsistent geometry", () => {
    const fixture = createFixture();
    fixture.geometry.width = 999;
    const result = safeParseElementBundle(fixture);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("width"))).toBe(true);
    }
  });

  it("rejects malformed warning codes", () => {
    const fixture = createFixture();
    fixture.warnings.push({
      code: "not kebab or lowercase",
      message: "Invalid code shape",
      severity: "warning",
    });
    expect(safeParseElementBundle(fixture).success).toBe(false);
  });
});
