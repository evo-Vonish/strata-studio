import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getElementBounds,
  getElementSelector,
  getPickableParent,
  isElementPickable,
} from "./index";

function setBounds(element: Element, width = 100, height = 40, left = 10, top = 20) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
}

describe("element picker primitives", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers a stable Strata id in generated selectors", () => {
    const element = document.createElement("button");
    element.dataset.strataId = "button:save";
    document.body.append(element);
    expect(getElementSelector(element)).toBe('[data-strata-id="button\\:save"]');
  });

  it("falls back to nth-of-type for repeated siblings", () => {
    document.body.innerHTML = "<section><span></span><span></span></section>";
    const target = document.querySelectorAll("span")[1];
    expect(target).toBeDefined();
    expect(getElementSelector(target as Element)).toContain("span:nth-of-type(2)");
  });

  it("rejects editor overlays and zero-sized elements", () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-strata-overlay", "");
    const child = document.createElement("button");
    overlay.append(child);
    document.body.append(overlay);
    setBounds(child);
    expect(isElementPickable(child)).toBe(false);

    const zeroSized = document.createElement("div");
    document.body.append(zeroSized);
    setBounds(zeroSized, 0, 0);
    expect(isElementPickable(zeroSized)).toBe(false);
  });

  it("computes viewport bounds", () => {
    const element = document.createElement("article");
    document.body.append(element);
    setBounds(element, 120, 60, 15, 25);
    expect(getElementBounds(element)).toEqual({
      x: 15,
      y: 25,
      left: 15,
      top: 25,
      right: 135,
      bottom: 85,
      width: 120,
      height: 60,
    });
  });

  it("finds the nearest pickable parent", () => {
    const parent = document.createElement("article");
    const child = document.createElement("span");
    parent.append(child);
    document.body.append(parent);
    setBounds(parent);
    setBounds(child);
    expect(getPickableParent(child)).toBe(parent);
  });
});
