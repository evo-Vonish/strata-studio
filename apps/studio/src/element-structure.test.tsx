import { applyTransaction, parseProject, type StrataProject } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import { createElementNode } from "./element-factory";
import {
  createDeleteElementCommand,
  createDuplicateElementCommand,
  createMoveElementCommand,
  getElementStructureCapabilities,
} from "./element-structure";

function createStructureProject(): StrataProject {
  const page = createElementNode({ type: "Box", nodeId: "page", parentId: null });
  page.editor.name = "Page";
  page.children = ["alpha", "beta", "gamma"];

  const secondary = createElementNode({
    type: "Box",
    nodeId: "secondary-page",
    parentId: null,
  });
  secondary.editor.name = "Secondary page root";

  const alpha = createElementNode({ type: "Box", nodeId: "alpha", parentId: "page" });
  alpha.editor.name = "Alpha";
  alpha.children = ["alpha-text"];
  alpha.content = { kind: "reference", nodeId: "alpha-text" };
  alpha.attributes = {
    internalTarget: { kind: "reference", nodeId: "alpha-text" },
    externalTarget: { kind: "reference", nodeId: "gamma" },
  };
  const alphaRule = alpha.styleRules[0];
  if (!alphaRule) throw new Error("The Alpha fixture is missing its default style rule");
  alphaRule.properties["--internal-target"] = { kind: "reference", nodeId: "alpha-text" };
  alpha.accessibility.aria.controls = { kind: "reference", nodeId: "alpha-text" };

  const alphaText = createElementNode({
    type: "Text",
    nodeId: "alpha-text",
    parentId: "alpha",
  });
  alphaText.editor.name = "Alpha text";
  alphaText.content = { kind: "reference", nodeId: "alpha" };

  const beta = createElementNode({ type: "Box", nodeId: "beta", parentId: "page" });
  beta.editor.name = "Beta";
  const gamma = createElementNode({ type: "Text", nodeId: "gamma", parentId: "page" });
  gamma.editor.name = "Gamma";

  return parseProject({
    version: "0.1",
    id: "structure-project",
    activeDocumentId: "document",
    documents: {
      document: {
        id: "document",
        rootNodeIds: ["page", "secondary-page"],
        nodes: {
          page,
          "secondary-page": secondary,
          alpha,
          "alpha-text": alphaText,
          beta,
          gamma,
        },
      },
    },
    assets: {},
    programs: {},
  });
}

const unavailable = {
  canMoveUp: false,
  canMoveDown: false,
  canIndent: false,
  canOutdent: false,
  canDelete: false,
  canDuplicate: false,
};

describe("element structure commands", () => {
  it("protects the page sentinel and computes legacy-root and ordinary-node capabilities", () => {
    const project = createStructureProject();

    expect(getElementStructureCapabilities(project, "page")).toEqual(unavailable);
    expect(getElementStructureCapabilities(project, "secondary-page")).toEqual({
      canMoveUp: false,
      canMoveDown: false,
      canIndent: true,
      canOutdent: false,
      canDelete: true,
      canDuplicate: false,
    });
    expect(getElementStructureCapabilities(project, null)).toEqual(unavailable);
    expect(getElementStructureCapabilities(project, "missing")).toEqual(unavailable);
    expect(getElementStructureCapabilities(project, "beta")).toEqual({
      canMoveUp: true,
      canMoveDown: true,
      canIndent: true,
      canOutdent: false,
      canDelete: true,
      canDuplicate: true,
    });
    expect(getElementStructureCapabilities(project, "alpha-text")).toEqual({
      canMoveUp: false,
      canMoveDown: false,
      canIndent: false,
      canOutdent: true,
      canDelete: true,
      canDuplicate: true,
    });

    expect(() => createMoveElementCommand(project, "page", "down")).toThrow(/protected/);
    expect(() => createDeleteElementCommand(project, "page")).toThrow(/protected/);
    expect(() => createDuplicateElementCommand(project, "page")).toThrow(/protected/);
    expect(() => createDuplicateElementCommand(project, "secondary-page")).toThrow(/cannot/);

    const normalize = createMoveElementCommand(project, "secondary-page", "indent");
    expect(normalize.operations[0]).toMatchObject({
      nodeId: "secondary-page",
      parentId: "page",
      index: 3,
    });
    const normalized = applyTransaction(project, normalize.operations);
    expect(normalized.project.documents.document?.rootNodeIds).toEqual(["page"]);
    expect(normalized.project.documents.document?.nodes.page?.children).toEqual([
      "alpha",
      "beta",
      "gamma",
      "secondary-page",
    ]);
    expect(applyTransaction(normalized.project, normalized.inverse).project).toEqual(project);
  });

  it("moves siblings up and down using post-detach MoveNode indices", () => {
    const project = createStructureProject();
    const moveUp = createMoveElementCommand(project, "beta", "up");
    expect(moveUp).toEqual({
      operations: [
        {
          type: "MoveNode",
          source: "human",
          documentId: "document",
          nodeId: "beta",
          parentId: "page",
          index: 0,
        },
      ],
      selectionNodeId: "beta",
    });
    const movedUp = applyTransaction(project, moveUp.operations);
    expect(movedUp.project.documents.document?.nodes.page?.children).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
    expect(applyTransaction(movedUp.project, movedUp.inverse).project).toEqual(project);

    const moveDown = createMoveElementCommand(project, "beta", "down");
    expect(moveDown.operations[0].index).toBe(2);
    const movedDown = applyTransaction(project, moveDown.operations);
    expect(movedDown.project.documents.document?.nodes.page?.children).toEqual([
      "alpha",
      "gamma",
      "beta",
    ]);
    expect(applyTransaction(movedDown.project, movedDown.inverse).project).toEqual(project);
  });

  it("keeps the page sentinel first while reordering legacy root suffixes", () => {
    const draft = createStructureProject();
    const document = draft.documents.document;
    if (!document) throw new Error("The structure fixture document is missing");
    const tertiary = createElementNode({
      type: "Box",
      nodeId: "tertiary-page",
      parentId: null,
    });
    document.nodes[tertiary.id] = tertiary;
    document.rootNodeIds.push(tertiary.id);
    const project = parseProject(draft);

    expect(getElementStructureCapabilities(project, "secondary-page").canMoveUp).toBe(false);
    expect(getElementStructureCapabilities(project, "tertiary-page").canMoveUp).toBe(true);
    const moved = applyTransaction(
      project,
      createMoveElementCommand(project, "tertiary-page", "up").operations,
    );
    expect(moved.project.documents.document?.rootNodeIds).toEqual([
      "page",
      "tertiary-page",
      "secondary-page",
    ]);
    expect(applyTransaction(moved.project, moved.inverse).project).toEqual(project);
  });

  it("rejects indent when the preceding sibling is not a safe container", () => {
    const draft = createStructureProject();
    const page = draft.documents.document?.nodes.page;
    if (!page) throw new Error("The structure fixture page is missing");
    page.children = ["alpha", "gamma", "beta"];
    const project = parseProject(draft);

    expect(getElementStructureCapabilities(project, "beta").canIndent).toBe(false);
    expect(() => createMoveElementCommand(project, "beta", "indent")).toThrow(/cannot indent/);
  });

  it("indents into the previous Box and outdents immediately after the original parent", () => {
    const project = createStructureProject();
    const indent = createMoveElementCommand(project, "beta", "indent");
    expect(indent.operations[0]).toMatchObject({
      type: "MoveNode",
      documentId: "document",
      nodeId: "beta",
      parentId: "alpha",
      index: 1,
    });
    const indented = applyTransaction(project, indent.operations);
    expect(indented.project.documents.document?.nodes.page?.children).toEqual(["alpha", "gamma"]);
    expect(indented.project.documents.document?.nodes.alpha?.children).toEqual([
      "alpha-text",
      "beta",
    ]);
    expect(applyTransaction(indented.project, indented.inverse).project).toEqual(project);

    const outdent = createMoveElementCommand(indented.project, "beta", "outdent");
    expect(outdent.operations[0]).toMatchObject({
      type: "MoveNode",
      documentId: "document",
      nodeId: "beta",
      parentId: "page",
      index: 1,
    });
    expect(applyTransaction(indented.project, outdent.operations).project).toEqual(project);
  });

  it("deletes a subtree with a surviving selection fallback and an exact inverse", () => {
    const project = createStructureProject();
    const command = createDeleteElementCommand(project, "alpha");

    expect(command).toEqual({
      operations: [
        {
          type: "RemoveNode",
          source: "human",
          documentId: "document",
          nodeId: "alpha",
        },
      ],
      selectionFallbackId: "beta",
    });
    const deleted = applyTransaction(project, command.operations);
    expect(deleted.project.documents.document?.nodes.alpha).toBeUndefined();
    expect(deleted.project.documents.document?.nodes["alpha-text"]).toBeUndefined();
    expect(deleted.inverse[0]).toMatchObject({
      type: "InsertNode",
      documentId: "document",
      node: { id: "alpha" },
      descendants: [{ id: "alpha-text" }],
      parentId: "page",
      index: 0,
    });
    expect(applyTransaction(deleted.project, deleted.inverse).project).toEqual(project);
  });

  it("duplicates a deep subtree with unique typed IDs and remapped internal references", () => {
    const draft = createStructureProject();
    const document = draft.documents.document;
    if (!document) throw new Error("The structure fixture document is missing");
    const reserved = createElementNode({
      type: "Box",
      nodeId: "box-reserved",
      parentId: null,
    });
    document.nodes[reserved.id] = reserved;
    document.rootNodeIds.push(reserved.id);
    const project = parseProject(draft);
    const fragments = [
      "reserved",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ];
    const command = createDuplicateElementCommand(
      project,
      "alpha",
      () => fragments.shift() ?? "00000000-0000-4000-8000-000000000099",
    );
    const operation = command.operations[0];
    const copiedRootId = "box-00000000-0000-4000-8000-000000000001";
    const copiedTextId = "text-00000000-0000-4000-8000-000000000002";
    const copiedText = operation.descendants[0];
    if (!copiedText) throw new Error("The copied subtree is missing its descendant");

    expect(command.newRootNodeId).toBe(copiedRootId);
    expect(command.selectionNodeId).toBe(copiedRootId);
    expect(operation).toMatchObject({
      type: "InsertNode",
      source: "human",
      documentId: "document",
      parentId: "page",
      index: 1,
      node: {
        id: copiedRootId,
        parentId: "page",
        children: [copiedTextId],
        content: { kind: "reference", nodeId: copiedTextId },
        editor: { name: "Alpha copy" },
      },
    });
    expect(copiedText).toMatchObject({
      id: copiedTextId,
      parentId: copiedRootId,
      children: [],
      content: { kind: "reference", nodeId: copiedRootId },
      editor: { name: "Alpha text" },
    });
    expect(operation.node.attributes).toEqual({
      internalTarget: { kind: "reference", nodeId: copiedTextId },
      externalTarget: { kind: "reference", nodeId: "gamma" },
    });
    expect(operation.node.styleRules[0]?.properties["--internal-target"]).toEqual({
      kind: "reference",
      nodeId: copiedTextId,
    });
    expect(operation.node.accessibility.aria.controls).toEqual({
      kind: "reference",
      nodeId: copiedTextId,
    });
    expect(operation.node.attributes).not.toBe(project.documents.document?.nodes.alpha?.attributes);

    const duplicated = applyTransaction(project, command.operations);
    expect(duplicated.project.documents.document?.nodes.page?.children).toEqual([
      "alpha",
      copiedRootId,
      "beta",
      "gamma",
    ]);
    expect(duplicated.project.documents.document?.nodes[copiedTextId]?.parentId).toBe(copiedRootId);
    expect(project.documents.document?.nodes.alpha?.children).toEqual(["alpha-text"]);
    expect(applyTransaction(duplicated.project, duplicated.inverse).project).toEqual(project);
  });
});
