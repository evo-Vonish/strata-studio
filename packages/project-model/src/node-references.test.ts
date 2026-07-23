import { describe, expect, it } from "vitest";
import {
  findExternalNodeReferences,
  parseProject,
  type StrataNode,
  type StrataProject,
} from "./index";

const node = (id: string, parentId: string | null, children: string[] = []): StrataNode => ({
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

function project(): StrataProject {
  const root = node("root", null, ["removed", "survivor"]);
  const removed = node("removed", "root", ["descendant"]);
  const descendant = node("descendant", "removed");
  const survivor = node("survivor", "root");
  survivor.content = { kind: "reference", nodeId: "removed" };
  survivor.attributes.target = { kind: "reference", nodeId: "descendant" };
  survivor.attributes.literal = { kind: "literal", value: "removed" };
  survivor.styleRules = [
    {
      scope: { state: "hover" },
      properties: {
        "--descendant": { kind: "reference", nodeId: "descendant" },
        "--opaque": { kind: "raw", cssText: "url(#removed)" },
      },
    },
    {
      scope: { breakpoint: "mobile" },
      properties: { "--removed": { kind: "reference", nodeId: "removed" } },
    },
  ];
  survivor.accessibility.aria.controls = { kind: "reference", nodeId: "removed" };
  survivor.passthrough = {
    unknownAttributes: { for: "removed" },
    unknownStyles: { filter: "url(#removed)" },
  };
  removed.attributes.internal = { kind: "reference", nodeId: "descendant" };
  descendant.content = { kind: "reference", nodeId: "survivor" };

  return parseProject({
    version: "0.1",
    id: "references",
    activeDocumentId: "page",
    documents: {
      page: {
        id: "page",
        rootNodeIds: ["root"],
        nodes: { root, removed, descendant, survivor },
      },
    },
    assets: {},
    programs: {},
  });
}

describe("findExternalNodeReferences", () => {
  it("finds each typed surviving reference and preserves semantic paths and scopes", () => {
    const document = project().documents.page;
    if (!document) throw new Error("fixture document is missing");

    expect(findExternalNodeReferences(document, "removed")).toEqual([
      {
        sourceNodeId: "survivor",
        targetNodeId: "removed",
        field: "accessibility",
        path: ["accessibility", "aria", "controls"],
      },
      {
        sourceNodeId: "survivor",
        targetNodeId: "descendant",
        field: "attributes",
        path: ["attributes", "target"],
      },
      {
        sourceNodeId: "survivor",
        targetNodeId: "removed",
        field: "content",
        path: ["content"],
      },
      {
        sourceNodeId: "survivor",
        targetNodeId: "descendant",
        field: "style",
        path: ["styleRules", "properties", "--descendant"],
        scope: { state: "hover" },
      },
      {
        sourceNodeId: "survivor",
        targetNodeId: "removed",
        field: "style",
        path: ["styleRules", "properties", "--removed"],
        scope: { breakpoint: "mobile" },
      },
    ]);
  });

  it("returns no finding for opaque values, internal references, or an unknown root", () => {
    const document = project().documents.page;
    if (!document) throw new Error("fixture document is missing");

    const noExternal = structuredClone(document);
    delete noExternal.nodes.survivor?.content;
    delete noExternal.nodes.survivor?.attributes.target;
    delete noExternal.nodes.survivor?.accessibility.aria.controls;
    noExternal.nodes.survivor?.styleRules.splice(0, noExternal.nodes.survivor.styleRules.length);
    expect(findExternalNodeReferences(noExternal, "removed")).toEqual([]);
    expect(findExternalNodeReferences(document, "missing")).toEqual([]);
  });
});
