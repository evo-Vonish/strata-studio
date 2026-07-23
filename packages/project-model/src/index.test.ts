import { describe, expect, it } from "vitest";
import {
  applyOperation,
  applyTransaction,
  isProjectOperationError,
  type ProjectOperation,
  type ProjectOperationError,
  parseProject,
  type StrataProject,
  safeParseProject,
} from "./index";

const literal = { kind: "literal", value: "x" } as const;
const node = (id: string, parentId: string | null, children: string[] = []) => ({
  id,
  kind: "element" as const,
  type: "Box",
  parentId,
  children,
  attributes: {},
  styleRules: [],
  accessibility: { aria: {} },
  interactions: [],
  editor: {},
});
const project: StrataProject = {
  version: "0.1",
  id: "p",
  activeDocumentId: "d",
  documents: {
    d: {
      id: "d",
      rootNodeIds: ["root", "other"],
      nodes: {
        root: node("root", null, ["a", "b"]),
        a: node("a", "root", ["a1"]),
        a1: node("a1", "a"),
        b: node("b", "root"),
        other: node("other", null),
      },
    },
    second: {
      id: "second",
      rootNodeIds: ["second-root"],
      nodes: { "second-root": node("second-root", null) },
    },
  },
  assets: { logo: { id: "logo", kind: "image", url: "asset.png" } },
  programs: { program: { id: "program", entryPoints: { open: "open" } } },
};
function fixtureNode(input: StrataProject, documentId = "d", nodeId = "a") {
  const node = input.documents[documentId]?.nodes[nodeId];
  if (!node) throw new Error("Test fixture node is missing");
  return node;
}
function operationErrorOf(run: () => unknown): ProjectOperationError {
  try {
    run();
  } catch (error) {
    if (isProjectOperationError(error)) return error;
    throw error;
  }
  throw new Error("Expected project operation to fail");
}

describe("project model", () => {
  it("validates document-owned nodes, active document and map keys", () => {
    expect(parseProject(project)).toEqual(project);
    const invalid = structuredClone(project);
    invalid.activeDocumentId = "missing";
    expect(safeParseProject(invalid).success).toBe(false);
    const wrongKey = structuredClone(project);
    const logo = wrongKey.assets.logo;
    if (!logo) throw new Error("Test fixture is missing logo");
    logo.id = "nope";
    expect(safeParseProject(wrongKey).success).toBe(false);
  });
  it("rejects cycles, ambiguous style scopes and duplicate interactions", () => {
    const cyclic = structuredClone(project);
    fixtureNode(cyclic).parentId = "a1";
    expect(safeParseProject(cyclic).success).toBe(false);
    const style = structuredClone(project);
    fixtureNode(style).styleRules = [{ scope: {}, properties: {} }];
    expect(safeParseProject(style).success).toBe(false);
    const duplicateScopes = structuredClone(project);
    fixtureNode(duplicateScopes).styleRules = [
      { scope: { state: "hover" }, properties: { color: literal } },
      { scope: { state: "hover" }, properties: { opacity: literal } },
    ];
    expect(safeParseProject(duplicateScopes).success).toBe(false);
    const interactions = structuredClone(project);
    fixtureNode(interactions).interactions = [
      { id: "x", event: "click", programId: "program", entryPointId: "open" },
      { id: "x", event: "focus", programId: "program", entryPointId: "open" },
    ];
    expect(safeParseProject(interactions).success).toBe(false);
    const duplicateEvents = structuredClone(project);
    fixtureNode(duplicateEvents).interactions = [
      { id: "x", event: "click", programId: "program", entryPointId: "open" },
      { id: "y", event: "click", programId: "program", entryPointId: "open" },
    ];
    expect(safeParseProject(duplicateEvents).success).toBe(false);
  });
  it("inserts, removes and restores a subtree exactly", () => {
    const removed = applyOperation(project, { type: "RemoveNode", nodeId: "a" });
    expect(removed.project.documents.d?.nodes.a).toBeUndefined();
    expect(removed.project.documents.d?.nodes.a1).toBeUndefined();
    expect(applyOperation(removed.project, removed.inverse).project).toEqual(project);
  });
  it("supports root insert, move and removal while preserving at least one root", () => {
    const extra = node("extra", null);
    const inserted = applyOperation(project, {
      type: "InsertNode",
      node: extra,
      parentId: null,
      index: 1,
      descendants: [],
    });
    expect(inserted.project.documents.d?.rootNodeIds).toEqual(["root", "extra", "other"]);
    const moved = applyOperation(inserted.project, {
      type: "MoveNode",
      nodeId: "b",
      parentId: null,
      index: 1,
    });
    expect(moved.project.documents.d?.rootNodeIds).toEqual(["root", "b", "extra", "other"]);
    const removed = applyOperation(moved.project, { type: "RemoveNode", nodeId: "b" });
    expect(removed.project.documents.d?.rootNodeIds).not.toContain("b");
  });
  it("protects the final root and restores cross-parent moves exactly", () => {
    expect(() =>
      applyOperation(project, {
        type: "RemoveNode",
        documentId: "second",
        nodeId: "second-root",
      }),
    ).toThrow(/retain at least one root/);

    const moved = applyOperation(project, {
      type: "MoveNode",
      nodeId: "b",
      parentId: "other",
      index: 0,
    });
    expect(moved.project.documents.d?.nodes.other?.children).toEqual(["b"]);
    expect(moved.project.documents.d?.nodes.b?.parentId).toBe("other");
    expect(applyOperation(moved.project, moved.inverse).project).toEqual(project);
    expect(() =>
      applyOperation(project, {
        type: "MoveNode",
        nodeId: "b",
        parentId: "other",
        index: 2,
      }),
    ).toThrow(/index/);
  });
  it("checks indexes and uses the selected document only", () => {
    const fresh = node("new", "root");
    expect(() =>
      applyOperation(project, {
        type: "InsertNode",
        node: fresh,
        parentId: "root",
        index: 8,
        descendants: [],
      }),
    ).toThrow(/index/);
    expect(() =>
      applyOperation(project, {
        type: "SetAttribute",
        documentId: "second",
        nodeId: "a",
        name: "title",
        value: literal,
      }),
    ).toThrow(/Unknown node/);
    const second = applyOperation(project, {
      type: "SetAttribute",
      documentId: "second",
      nodeId: "second-root",
      name: "title",
      value: literal,
    });
    expect(second.project.documents.d?.nodes.root?.attributes.title).toBeUndefined();
  });
  it("exposes stable error codes, context and Zod causes", () => {
    const unknownNode = operationErrorOf(() =>
      applyOperation(project, {
        type: "SetAttribute",
        nodeId: "missing",
        name: "title",
        value: literal,
      }),
    );
    expect(unknownNode).toMatchObject({
      code: "UNKNOWN_NODE",
      operationType: "SetAttribute",
      documentId: "d",
      nodeId: "missing",
    });

    const invalidOperation = operationErrorOf(() =>
      applyOperation(project, { type: "SetAttribute", nodeId: "a" } as ProjectOperation),
    );
    expect(invalidOperation.code).toBe("INVALID_OPERATION");
    expect(invalidOperation.operationType).toBe("SetAttribute");
    expect(invalidOperation.cause).toBeDefined();

    const invalidProject = structuredClone(project);
    invalidProject.activeDocumentId = "missing";
    const invalidProjectError = operationErrorOf(() => parseProject(invalidProject));
    expect(invalidProjectError.code).toBe("INVALID_PROJECT");
    expect(invalidProjectError.cause).toBeDefined();

    const duplicateInsert = operationErrorOf(() =>
      applyOperation(project, {
        type: "InsertNode",
        node: node("a", "root"),
        parentId: "root",
        descendants: [],
      }),
    );
    expect(duplicateInsert).toMatchObject({
      code: "DUPLICATE_ID",
      operationType: "InsertNode",
      documentId: "d",
      nodeId: "a",
    });
  });
  it("pins inverse operations to the document resolved during apply", () => {
    const changed = applyOperation(project, {
      type: "SetAttribute",
      nodeId: "a",
      name: "title",
      value: literal,
    });
    expect(changed.inverse.documentId).toBe("d");
    const switched = { ...changed.project, activeDocumentId: "second" };
    const undone = applyOperation(switched, changed.inverse).project;
    expect(undone.documents.d?.nodes.a?.attributes.title).toBeUndefined();
    expect(undone.documents.second).toEqual(project.documents.second);
  });
  it("supports same-parent moves and atomic transaction undo", () => {
    const moved = applyOperation(project, {
      type: "MoveNode",
      nodeId: "a",
      parentId: "root",
      index: 1,
    });
    expect(moved.project.documents.d?.nodes.root?.children).toEqual(["b", "a"]);
    const applied = applyTransaction(project, [
      { type: "SetAttribute", nodeId: "a", name: "title", value: literal },
      {
        type: "SetStyle",
        nodeId: "a",
        scope: { state: "hover" },
        name: "color",
        value: { kind: "raw", cssText: "var(--color)" },
      },
    ]);
    expect(applyTransaction(applied.project, applied.inverse).project).toEqual(project);
    expect(() =>
      applyTransaction(project, [
        { type: "SetContent", nodeId: "a", value: { kind: "unset" } },
        { type: "MoveNode", nodeId: "a", parentId: "a1" },
      ]),
    ).toThrow();
    expect(project.documents.d?.nodes.a?.content).toBeUndefined();
  });
  it("reports the failed transaction operation and never exposes partial project state", () => {
    const before = structuredClone(project);
    const error = operationErrorOf(() =>
      applyTransaction(project, [
        { type: "SetContent", nodeId: "a", value: { kind: "unset" } },
        { type: "MoveNode", nodeId: "a", parentId: "a1" },
      ]),
    );
    expect(error).toMatchObject({
      code: "CYCLE",
      operationType: "MoveNode",
      documentId: "d",
      nodeId: "a",
      operationIndex: 1,
    });
    expect(project).toEqual(before);
    expect(project.documents.d?.nodes.a?.content).toBeUndefined();
  });
  it("changes semantic tags through a reversible operation", () => {
    const changed = applyOperation(project, { type: "SetTag", nodeId: "a", tag: "section" });
    expect(changed.project.documents.d?.nodes.a?.tag).toBe("section");
    expect(applyOperation(changed.project, changed.inverse).project).toEqual(project);
    const withTextNode = structuredClone(project);
    fixtureNode(withTextNode, "d", "a1").kind = "text";
    expect(() =>
      applyOperation(withTextNode, { type: "SetTag", nodeId: "a1", tag: "span" }),
    ).toThrow(/cannot have/);
  });
  it("enforces interaction event consistency and restores bindings", () => {
    expect(() =>
      applyOperation(project, {
        type: "BindInteraction",
        nodeId: "a",
        event: "click",
        binding: { id: "i", event: "focus", programId: "program", entryPointId: "open" },
      }),
    ).toThrow(/event/);
    const bound = applyOperation(project, {
      type: "BindInteraction",
      nodeId: "a",
      event: "click",
      binding: { id: "i", event: "click", programId: "program", entryPointId: "open" },
    });
    expect(applyOperation(bound.project, bound.inverse).project).toEqual(project);
  });
});
