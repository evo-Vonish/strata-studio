import {
  applyTransaction,
  parseProject,
  type StrataNode,
  type StrataProject,
} from "@strata/project-model";
import { describe, expect, it } from "vitest";
import {
  analyzePageRoot,
  assertCompatiblePageRoot,
  createPageRootMigrationCommand,
  isCompatibleBoxContainer,
  PageRootMigrationError,
} from "./page-root-migration";

function node(
  id: string,
  type: string,
  parentId: string | null,
  children: string[] = [],
): StrataNode {
  return {
    id,
    kind: "element",
    type,
    tag: type === "Box" ? "div" : "p",
    parentId,
    attributes: {},
    children,
    styleRules: [],
    accessibility: { aria: {} },
    interactions: [],
    editor: { name: id },
  };
}

function projectWithRoots(roots: StrataNode[]): StrataProject {
  return parseProject({
    version: "0.1",
    id: "migration-project",
    activeDocumentId: "page",
    documents: {
      page: {
        id: "page",
        rootNodeIds: roots.map((item) => item.id),
        nodes: Object.fromEntries(roots.map((item) => [item.id, item])),
      },
    },
    assets: {},
    programs: {},
  });
}

describe("page-root migration", () => {
  it("recognizes only a parentless element Box with a registry-supported effective tag", () => {
    const root = node("root", "Box", null);
    root.tag = undefined;
    root.passthrough = { originalTag: "MAIN" };
    const project = projectWithRoots([root]);
    const document = project.documents.page;
    if (!document) throw new Error("Missing fixture document");

    expect(analyzePageRoot(document)).toMatchObject({ status: "compatible", rootNodeId: "root" });
    expect(isCompatibleBoxContainer(root)).toBe(true);

    const incompatible = structuredClone(root);
    incompatible.kind = "unknown";
    expect(isCompatibleBoxContainer(incompatible)).toBe(false);
    expect(analyzePageRoot({ ...document, nodes: { root: incompatible } })).toMatchObject({
      status: "repair-required",
      code: "PAGE_ROOT_MIGRATION_REQUIRED",
      reason: "ROOT_KIND",
    });

    const componentRoot = structuredClone(root);
    componentRoot.kind = "component";
    expect(analyzePageRoot({ ...document, nodes: { root: componentRoot } })).toMatchObject({
      status: "repair-required",
      reason: "ROOT_KIND",
    });

    const badTag = structuredClone(root);
    badTag.passthrough = { originalTag: "custom-shell" };
    expect(analyzePageRoot({ ...document, nodes: { root: badTag } })).toMatchObject({
      status: "repair-required",
      reason: "ROOT_TAG",
    });

    const nested = structuredClone(root);
    nested.parentId = "other";
    expect(analyzePageRoot({ ...document, nodes: { root: nested } })).toMatchObject({
      status: "repair-required",
      reason: "ROOT_HAS_PARENT",
    });
  });

  it("defensively describes missing roots and assertCompatiblePageRoot carries the assessment", () => {
    const broken = {
      id: "broken",
      rootNodeIds: ["missing"],
      nodes: {},
    } as unknown as import("@strata/project-model").StrataDocument;
    expect(analyzePageRoot(broken)).toMatchObject({
      status: "repair-required",
      code: "PAGE_ROOT_MIGRATION_REQUIRED",
      reason: "MISSING_ROOT_NODE",
    });
    expect(() => assertCompatiblePageRoot(broken)).toThrow(PageRootMigrationError);
    try {
      assertCompatiblePageRoot(broken);
    } catch (error) {
      expect(error).toBeInstanceOf(PageRootMigrationError);
      if (!(error instanceof PageRootMigrationError)) throw error;
      expect(error.assessment.reason).toBe("MISSING_ROOT_NODE");
    }
  });

  it("does nothing to a compatible first root even when legacy suffix roots remain", () => {
    const project = projectWithRoots([node("page", "Box", null), node("legacy", "Text", null)]);
    const command = createPageRootMigrationCommand(project, "page", () => "unused");

    expect(command).toMatchObject({
      assessment: { status: "compatible", rootNodeId: "page" },
      operations: [],
      selectionNodeId: "page",
    });
  });

  it("wraps imported roots in deterministic non-recycled Box operations and preserves every original node", () => {
    const text = node("legacy-text", "Text", null);
    text.content = { kind: "literal", value: "Preserved imported content" };
    text.attributes = { target: { kind: "reference", nodeId: "opaque-root" } };
    text.passthrough = {
      originalTag: "article",
      unknownAttributes: { "data-imported": "yes" },
      unknownStyles: { "paint-order": "stroke" },
    };
    text.editor = { name: "Opaque imported text", locked: true, hidden: true };
    const opaque = node("opaque-root", "Box", null, ["child"]);
    opaque.kind = "unknown";
    opaque.tag = undefined;
    opaque.passthrough = { originalTag: "section", unknownAttributes: { id: "legacy" } };
    const child = node("child", "Text", "opaque-root");
    const taken = node("page-root-taken", "Text", null);
    const original = parseProject({
      version: "0.1",
      id: "migration-project",
      activeDocumentId: "page",
      documents: {
        page: {
          id: "page",
          rootNodeIds: ["legacy-text", "opaque-root", "page-root-taken"],
          nodes: {
            "legacy-text": text,
            "opaque-root": opaque,
            child,
            "page-root-taken": taken,
          },
        },
      },
      assets: {},
      programs: {},
    });
    const fragments = ["taken", "fresh"];
    const command = createPageRootMigrationCommand(
      original,
      undefined,
      () => fragments.shift() ?? "extra",
    );

    expect(command.assessment).toMatchObject({
      status: "repair-required",
      reason: "ROOT_TYPE",
      rootNodeId: "legacy-text",
    });
    expect(command.selectionNodeId).toBe("legacy-text");
    expect(command.operations).toHaveLength(4);
    expect(command.operations[0]).toMatchObject({
      type: "InsertNode",
      source: "import",
      documentId: "page",
      transactionId: "page-root-migration-page-root-fresh",
      parentId: null,
      index: 0,
      node: {
        id: "page-root-fresh",
        kind: "element",
        type: "Box",
        tag: "div",
        children: [],
        styleRules: [
          { scope: {}, properties: { display: { kind: "literal", value: "contents" } } },
        ],
        editor: { name: "Imported page container" },
      },
    });
    expect(command.operations.slice(1)).toEqual([
      expect.objectContaining({
        type: "MoveNode",
        nodeId: "legacy-text",
        parentId: "page-root-fresh",
        index: 0,
      }),
      expect.objectContaining({
        type: "MoveNode",
        nodeId: "opaque-root",
        parentId: "page-root-fresh",
        index: 1,
      }),
      expect.objectContaining({
        type: "MoveNode",
        nodeId: "page-root-taken",
        parentId: "page-root-fresh",
        index: 2,
      }),
    ]);

    const migrated = applyTransaction(original, command.operations);
    const document = migrated.project.documents.page;
    if (!document) throw new Error("Missing migrated document");
    expect(document.rootNodeIds).toEqual(["page-root-fresh"]);
    expect(document.nodes["page-root-fresh"]?.children).toEqual([
      "legacy-text",
      "opaque-root",
      "page-root-taken",
    ]);
    expect(document.nodes["legacy-text"]).toEqual({
      ...original.documents.page?.nodes["legacy-text"],
      parentId: "page-root-fresh",
    });
    expect(document.nodes["opaque-root"]).toEqual({
      ...original.documents.page?.nodes["opaque-root"],
      parentId: "page-root-fresh",
    });
    expect(document.nodes.child).toEqual(original.documents.page?.nodes.child);

    const undone = applyTransaction(migrated.project, migrated.inverse);
    expect(undone.project).toEqual(original);
    const redone = applyTransaction(undone.project, command.operations);
    expect(redone.project).toEqual(migrated.project);
  });
});
