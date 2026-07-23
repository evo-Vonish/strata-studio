import { applyOperation, parseProject, type StrataProject } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import { createElementNode } from "./element-factory";
import {
  getStagePlacementCapabilities,
  planStagePlacement,
  stagePlacementFromPoint,
} from "./stage-placement";

function createPlacementProject(): StrataProject {
  const page = createElementNode({ type: "Box", nodeId: "page", parentId: null });
  page.children = ["a", "b", "c", "text", "nested"];
  const legacy = createElementNode({ type: "Box", nodeId: "legacy", parentId: null });
  const legacyTwo = createElementNode({ type: "Box", nodeId: "legacy-two", parentId: null });
  const a = createElementNode({ type: "Box", nodeId: "a", parentId: "page" });
  const b = createElementNode({ type: "Box", nodeId: "b", parentId: "page" });
  const c = createElementNode({ type: "Box", nodeId: "c", parentId: "page" });
  c.children = ["c-child"];
  const text = createElementNode({ type: "Text", nodeId: "text", parentId: "page" });
  const nested = createElementNode({ type: "Box", nodeId: "nested", parentId: "page" });
  nested.children = ["nested-child"];
  const cChild = createElementNode({ type: "Text", nodeId: "c-child", parentId: "c" });
  const nestedChild = createElementNode({
    type: "Text",
    nodeId: "nested-child",
    parentId: "nested",
  });

  return parseProject({
    version: "0.1",
    id: "stage-placement-project",
    activeDocumentId: "document",
    documents: {
      document: {
        id: "document",
        rootNodeIds: ["page", "legacy", "legacy-two"],
        nodes: {
          page,
          legacy,
          "legacy-two": legacyTwo,
          a,
          b,
          c,
          text,
          nested,
          "c-child": cChild,
          "nested-child": nestedChild,
        },
      },
    },
    assets: {},
    programs: {},
  });
}

function ready(
  project: StrataProject,
  dragged: string,
  target: string,
  placement: "before" | "inside" | "after",
) {
  const plan = planStagePlacement(project, dragged, target, placement);
  if (plan.status !== "ready") throw new Error(`Expected a ready plan, received ${plan.status}`);
  return plan.command;
}

describe("Stage placement planning", () => {
  it("maps target edge bands and safe container centers to semantic placements", () => {
    const rect = { top: 100, bottom: 200, height: 100 };
    expect(stagePlacementFromPoint(true, 110, rect)).toBe("before");
    expect(stagePlacementFromPoint(true, 150, rect)).toBe("inside");
    expect(stagePlacementFromPoint(true, 190, rect)).toBe("after");
    expect(stagePlacementFromPoint(false, 140, rect)).toBe("before");
    expect(stagePlacementFromPoint(false, 160, rect)).toBe("after");
  });

  it("uses detached-list indexes for same-parent forward and backward moves", () => {
    const project = createPlacementProject();

    const forward = ready(project, "a", "c", "after");
    expect(forward.operation).toMatchObject({ parentId: "page", index: 2, source: "stage" });
    expect(
      applyOperation(project, forward.operation).project.documents.document?.nodes.page?.children,
    ).toEqual(["b", "c", "a", "text", "nested"]);

    const backward = ready(project, "c", "a", "before");
    expect(backward.operation).toMatchObject({ parentId: "page", index: 0 });
    expect(
      applyOperation(project, backward.operation).project.documents.document?.nodes.page?.children,
    ).toEqual(["c", "a", "b", "text", "nested"]);
  });

  it("plans cross-parent placement and appends inside a Box", () => {
    const project = createPlacementProject();
    const before = ready(project, "b", "c-child", "before");
    expect(before).toEqual({
      operation: {
        type: "MoveNode",
        source: "stage",
        documentId: "document",
        nodeId: "b",
        parentId: "c",
        index: 0,
      },
      selectionNodeId: "b",
    });

    const inside = ready(project, "b", "c", "inside");
    expect(inside.operation).toMatchObject({ parentId: "c", index: 1 });
    expect(
      applyOperation(project, inside.operation).project.documents.document?.nodes.c?.children,
    ).toEqual(["c-child", "b"]);
  });

  it("exposes non-Box and subtree drop rejections as capabilities", () => {
    const project = createPlacementProject();
    expect(planStagePlacement(project, "a", "text", "inside")).toEqual({
      status: "unavailable",
      reason: "parent-not-box",
    });
    expect(planStagePlacement(project, "c", "c-child", "inside")).toEqual({
      status: "unavailable",
      reason: "target-in-dragged-subtree",
    });
    expect(getStagePlacementCapabilities(project, "a", "text")).toMatchObject({
      inside: { available: false, noOp: false, reason: "parent-not-box" },
      before: { available: true, noOp: false },
      after: { available: true, noOp: false },
    });
  });

  it("rejects stale identities and locked sources or destination parents", () => {
    const project = createPlacementProject();
    expect(planStagePlacement(project, "missing", "a", "before")).toEqual({
      status: "unavailable",
      reason: "unknown-dragged-node",
    });
    expect(planStagePlacement(project, "a", "missing", "before")).toEqual({
      status: "unavailable",
      reason: "unknown-hover-target",
    });

    const document = project.documents.document;
    if (!document?.nodes.a || !document.nodes.c) throw new Error("Placement fixture is incomplete");
    document.nodes.a.editor.locked = true;
    expect(planStagePlacement(project, "a", "b", "before")).toEqual({
      status: "unavailable",
      reason: "dragged-node-locked",
    });
    document.nodes.a.editor.locked = false;
    document.nodes.c.editor.locked = true;
    expect(planStagePlacement(project, "b", "c-child", "before")).toEqual({
      status: "unavailable",
      reason: "parent-locked",
    });
  });

  it("protects the page-root sentinel and preserves direct-root legacy boundaries", () => {
    const project = createPlacementProject();
    expect(planStagePlacement(project, "page", "a", "inside")).toEqual({
      status: "unavailable",
      reason: "page-root-sentinel",
    });
    expect(planStagePlacement(project, "legacy", "page", "before")).toEqual({
      status: "unavailable",
      reason: "page-root-sentinel",
    });
    expect(planStagePlacement(project, "a", "legacy", "before")).toEqual({
      status: "unavailable",
      reason: "root-sibling-placement",
    });

    const reorderLegacySuffix = ready(project, "legacy-two", "legacy", "before");
    expect(reorderLegacySuffix.operation).toMatchObject({ parentId: null, index: 1 });
    expect(
      applyOperation(project, reorderLegacySuffix.operation).project.documents.document
        ?.rootNodeIds,
    ).toEqual(["page", "legacy-two", "legacy"]);

    const normalize = ready(project, "legacy", "page", "inside");
    expect(normalize.operation).toMatchObject({ parentId: "page", index: 5 });
    const normalized = applyOperation(project, normalize.operation).project;
    expect(normalized.documents.document?.rootNodeIds).toEqual(["page", "legacy-two"]);
    expect(normalized.documents.document?.nodes.page?.children.at(-1)).toBe("legacy");
  });

  it("does not emit a MoveNode for unchanged placement and has an exact inverse when it does", () => {
    const project = createPlacementProject();
    expect(planStagePlacement(project, "a", "b", "before")).toEqual({
      status: "no-op",
      selectionNodeId: "a",
    });

    const command = ready(project, "nested", "a", "before");
    const applied = applyOperation(project, command.operation);
    expect(applied.inverse).toEqual({
      type: "MoveNode",
      source: "stage",
      documentId: "document",
      nodeId: "nested",
      parentId: "page",
      index: 4,
    });
    expect(applyOperation(applied.project, applied.inverse).project).toEqual(project);
  });
});
