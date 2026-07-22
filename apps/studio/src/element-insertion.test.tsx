import { applyOperation } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import { createElementNode } from "./element-factory";
import { createElementId, resolveInsertionTarget } from "./element-insertion";
import { createStudioProject } from "./studio-project";

describe("element insertion", () => {
  it("allocates opaque IDs without recycling the first matching document ID", () => {
    const project = createStudioProject();
    const document = project.documents[project.activeDocumentId];
    if (!document) throw new Error("Fixture document is missing");
    document.nodes["box-reserved"] = createElementNode({
      type: "Box",
      nodeId: "box-reserved",
      parentId: "hero",
    });
    const fragments = ["reserved", "fresh"];

    expect(createElementId(document, "Box", () => fragments.shift() ?? "fallback")).toBe(
      "box-fresh",
    );
  });

  it("resolves inside, before, after, and document-root placement", () => {
    const project = createStudioProject();

    expect(resolveInsertionTarget(project, "hero", "inside", "Text")).toEqual({
      parentId: "hero",
      index: 4,
    });
    expect(resolveInsertionTarget(project, "primary-action", "before", "Text")).toEqual({
      parentId: "hero",
      index: 3,
    });
    expect(resolveInsertionTarget(project, "primary-action", "after", "Text")).toEqual({
      parentId: "hero",
      index: 4,
    });
    expect(resolveInsertionTarget(project, null, "after", "Text")).toEqual({
      parentId: null,
      index: 1,
    });
  });

  it("rejects primitive insertion inside non-Box and void elements", () => {
    const project = createStudioProject();

    expect(() => resolveInsertionTarget(project, "primary-action", "inside", "Text")).toThrow(
      /cannot contain primitive/,
    );
    expect(() => resolveInsertionTarget(project, "signal-image", "inside", "Box")).toThrow(
      /cannot contain primitive/,
    );
  });

  it("produces an exactly reversible InsertNode operation", () => {
    const project = createStudioProject();
    const target = resolveInsertionTarget(project, "hero", "inside", "Button");
    const node = createElementNode({
      type: "Button",
      nodeId: "inserted-button",
      parentId: target.parentId,
    });
    const inserted = applyOperation(project, {
      type: "InsertNode",
      source: "human",
      documentId: project.activeDocumentId,
      node,
      parentId: target.parentId,
      index: target.index,
      descendants: [],
    });

    expect(inserted.project.documents.home?.nodes["inserted-button"]).toEqual(node);
    expect(applyOperation(inserted.project, inserted.inverse).project).toEqual(project);
  });
});
