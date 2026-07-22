import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function propertyField(container: Element, id: string): HTMLElement {
  const field = container.querySelector<HTMLElement>(`.schema-property[data-property-id="${id}"]`);
  if (!field) throw new Error(`Missing '${id}' schema field`);
  return field;
}

function storedWidth(): number | undefined {
  const serialized = window.localStorage.getItem("strata-studio.project.v0.1");
  if (!serialized) return undefined;
  const project = JSON.parse(serialized);
  const rules = project.documents.home.nodes["primary-action"].styleRules as Array<{
    scope: Record<string, string>;
    properties: Record<string, { kind: string; value?: number }>;
  }>;
  return rules.find((rule) => Object.keys(rule.scope).length === 0)?.properties.width?.value;
}

describe("Strata Studio model integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<App />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("renders the canonical project into the isolated stage", () => {
    const frame = container.querySelector<HTMLIFrameElement>(".model-stage-frame");
    expect(frame).not.toBeNull();
    expect(frame?.srcdoc).toContain('data-strata-node-id="primary-action"');
    expect(frame?.srcdoc).toContain("Design the interface. Program the behavior.");
    expect(container.textContent).toContain("11 nodes · compiled stage");
  });

  it("writes schema edits to the project and undoes them", async () => {
    const width = propertyField(container, "width").querySelector<HTMLInputElement>("input");
    if (!width) throw new Error("Width input is missing");
    expect(width.value).toBe("184");

    await act(async () => {
      width.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!valueSetter) throw new Error("Native input setter is missing");
      valueSetter.call(width, "240");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => width.blur());
    expect(storedWidth()).toBe(240);

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="Undo"]');
    if (!undo) throw new Error("Undo button is missing");
    await act(async () => undo.click());
    expect(storedWidth()).toBe(184);
  });

  it("preserves registered asset references when an asset field is committed unchanged", async () => {
    const signalImage = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="treeitem"]'),
    ].find((button) => button.textContent?.includes("Signal image"));
    const contentTab = [
      ...container.querySelectorAll<HTMLButtonElement>(".inspector-tabbar button"),
    ].find((button) => button.textContent === "Content");
    if (!signalImage || !contentTab) throw new Error("Image inspector controls are missing");

    await act(async () => signalImage.click());
    await act(async () => contentTab.click());
    const source = propertyField(container, "imageSource").querySelector<HTMLInputElement>("input");
    if (!source) throw new Error("Image source input is missing");
    expect(source.value).toBe("signal-artwork");
    await act(async () => source.focus());
    await act(async () => source.blur());

    const serialized = window.localStorage.getItem("strata-studio.project.v0.1");
    const stored = serialized ? JSON.parse(serialized) : null;
    expect(stored?.documents.home.nodes["signal-image"].attributes.src).toEqual({
      kind: "asset",
      assetId: "signal-artwork",
    });
  });

  it("keeps stage links inert while element selection is disabled", async () => {
    const pan = container.querySelector<HTMLButtonElement>('button[aria-label="Pan"]');
    const frame = container.querySelector<HTMLIFrameElement>(".model-stage-frame");
    if (!pan || !frame?.contentDocument) throw new Error("Stage controls are missing");

    await act(async () => pan.click());
    frame.contentDocument.body.innerHTML =
      '<a data-strata-node-id="external-link" href="https://example.com">External</a>';
    await act(async () => frame.dispatchEvent(new Event("load")));

    const link = frame.contentDocument.querySelector<HTMLAnchorElement>("a");
    if (!link) throw new Error("Stage link is missing");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(link.dispatchEvent(click)).toBe(false);
    expect(click.defaultPrevented).toBe(true);
  });
});
