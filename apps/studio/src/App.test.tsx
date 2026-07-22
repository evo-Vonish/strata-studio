import type { StrataDocument, StrataProject } from "@strata/project-model";
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

function storedProject(): StrataProject | null {
  const serialized = window.localStorage.getItem("strata-studio.project.v0.1");
  return serialized ? (JSON.parse(serialized) as StrataProject) : null;
}

function requiredStoredProject(): StrataProject {
  const project = storedProject();
  if (!project) throw new Error("Stored project is missing");
  return project;
}

function homeDocument(project: StrataProject): StrataDocument {
  const document = project.documents.home;
  if (!document) throw new Error("Home document is missing");
  return document;
}

function storedWidth(): number | undefined {
  const project = storedProject();
  if (!project) return undefined;
  const primaryAction = homeDocument(project).nodes["primary-action"];
  if (!primaryAction) return undefined;
  const rules = primaryAction.styleRules as Array<{
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

  it("inserts a primitive through the canonical model and restores it with redo", async () => {
    const add = container.querySelector<HTMLButtonElement>('button[aria-label="Add element"]');
    if (!add) throw new Error("Add element action is missing");
    await act(async () => add.click());

    const inside = [
      ...container.querySelectorAll<HTMLButtonElement>(".insertion-target button"),
    ].find((button) => button.textContent === "Inside");
    const insertText = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert Text"]',
    );
    if (!inside || !insertText) throw new Error("Element palette is incomplete");
    expect(inside.disabled).toBe(true);

    await act(async () => insertText.click());
    const insertedProject = requiredStoredProject();
    const insertedDocument = homeDocument(insertedProject);
    const inserted = Object.values(insertedDocument.nodes).find(
      (node) => node.type === "Text" && node.id.startsWith("text-"),
    );
    if (!inserted) throw new Error("Inserted Text node is missing");
    expect(inserted.parentId).toBe("hero");
    expect(insertedDocument.nodes.hero?.children.at(-1)).toBe(inserted.id);
    expect(container.textContent).toContain("12 nodes · compiled stage");
    expect(container.textContent).toContain(`Text · ${inserted.id}`);
    expect(container.querySelector<HTMLIFrameElement>(".model-stage-frame")?.srcdoc).toContain(
      `data-strata-node-id="${inserted.id}"`,
    );

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="Undo"]');
    const redo = container.querySelector<HTMLButtonElement>('button[aria-label="Redo"]');
    if (!undo || !redo) throw new Error("History controls are missing");
    await act(async () => undo.click());
    expect(requiredStoredProject().documents.home?.nodes[inserted.id]).toBeUndefined();
    expect(container.textContent).toContain("11 nodes · compiled stage");

    await act(async () => redo.click());
    expect(requiredStoredProject().documents.home?.nodes[inserted.id]).toEqual(inserted);
    expect(requiredStoredProject().documents.home?.nodes.hero?.children.at(-1)).toBe(inserted.id);
  });

  it("opens Add Element from the keyboard command palette without hijacking text input", async () => {
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      ),
    );
    const commandInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search commands"]',
    );
    if (!commandInput) throw new Error("Command palette did not open");
    await act(async () =>
      commandInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search elements"]');
    const select = container.querySelector<HTMLButtonElement>('button[aria-label="Select (P)"]');
    if (!search || !select) throw new Error("Add Element panel did not open");
    expect(select.classList.contains("active")).toBe(true);

    search.focus();
    await act(async () =>
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })),
    );
    expect(select.classList.contains("active")).toBe(true);
  });
});
