import type { StrataDocument, StrataNode } from "@strata/project-model";
import { describe, expect, it } from "vitest";
import {
  DomReferenceIntegrityError,
  findExternalDomReferences,
  rewriteDuplicatedDomReferences,
} from "./dom-reference-integrity";

function node(id: string, parentId: string | null, children: string[] = []): StrataNode {
  return {
    id,
    kind: "element",
    type: "Box",
    tag: "div",
    parentId,
    children,
    attributes: {},
    styleRules: [],
    accessibility: { aria: {} },
    interactions: [],
    editor: {},
  };
}

function documentOf(...nodes: StrataNode[]): StrataDocument {
  return {
    id: "document",
    rootNodeIds: nodes.filter((item) => item.parentId === null).map((item) => item.id),
    nodes: Object.fromEntries(nodes.map((item) => [item.id, item])),
  };
}

describe("DOM reference integrity", () => {
  it("allocates collision-free DOM ids and rewrites mixed internal IDREF tokens and fragments", () => {
    const root = node("root", null, ["target"]);
    root.attributes = {
      id: { kind: "literal", value: "card" },
      form: { kind: "literal", value: "target-id" },
      headers: { kind: "literal", value: "target-id outside-id" },
      href: { kind: "literal", value: "#target-id" },
    };
    root.accessibility.aria = {
      controls: { kind: "literal", value: "target-id outside-id" },
    };
    const target = node("target", "root");
    target.attributes.id = { kind: "literal", value: "target-id" };
    const existing = node("existing", null);
    existing.attributes.id = { kind: "literal", value: "card--copy" };
    const outside = node("outside", null);
    outside.attributes.id = { kind: "literal", value: "outside-id" };
    const document = documentOf(root, target, existing, outside);
    const copies = structuredClone([root, target]);

    rewriteDuplicatedDomReferences(document, [root, target], copies);

    expect(copies[0]?.attributes).toMatchObject({
      id: { kind: "literal", value: "card--copy-2" },
      form: { kind: "literal", value: "target-id--copy" },
      headers: { kind: "literal", value: "target-id--copy outside-id" },
      href: { kind: "literal", value: "#target-id--copy" },
    });
    expect(copies[0]?.accessibility.aria.controls).toEqual({
      kind: "literal",
      value: "target-id--copy outside-id",
    });
    expect(copies[1]?.attributes.id).toEqual({ kind: "literal", value: "target-id--copy" });
  });

  it("preserves passthrough storage and does not change an outside reference", () => {
    const root = node("root", null, ["target"]);
    root.passthrough = {
      unknownAttributes: { id: "map", "xlink:href": "#target" },
    };
    root.attributes.list = { kind: "literal", value: "outside" };
    const target = node("target", "root");
    target.passthrough = { unknownAttributes: { id: "target" } };
    const outside = node("outside", null);
    outside.attributes.id = { kind: "literal", value: "outside" };
    const copies = structuredClone([root, target]);

    rewriteDuplicatedDomReferences(documentOf(root, target, outside), [root, target], copies);

    expect(copies[0]?.passthrough?.unknownAttributes).toEqual({
      id: "map--copy",
      "xlink:href": "#target--copy",
    });
    expect(copies[0]?.attributes.list).toEqual({ kind: "literal", value: "outside" });
  });

  it("rewrites only the effective case-insensitive attribute entry", () => {
    const root = node("root", null, ["target"]);
    root.passthrough = {
      unknownAttributes: {
        id: "shadow-root",
        href: "#target-id",
      },
    };
    root.attributes = {
      ID: { kind: "literal", value: "root-id" },
      HREF: { kind: "literal", value: "/external" },
    };
    root.accessibility.aria = {
      "ARIA-CONTROLS": { kind: "literal", value: "target-id" },
    };
    const target = node("target", "root");
    target.attributes.ID = { kind: "literal", value: "target-id" };
    const copies = structuredClone([root, target]);

    rewriteDuplicatedDomReferences(documentOf(root, target), [root, target], copies);

    expect(copies[0]?.attributes.ID).toEqual({ kind: "literal", value: "root-id--copy" });
    expect(copies[0]?.attributes.HREF).toEqual({ kind: "literal", value: "/external" });
    expect(copies[0]?.passthrough?.unknownAttributes).toEqual({
      id: "shadow-root",
      href: "#target-id",
    });
    expect(copies[0]?.accessibility.aria["ARIA-CONTROLS"]).toEqual({
      kind: "literal",
      value: "target-id--copy",
    });
    expect(copies[1]?.attributes.ID).toEqual({
      kind: "literal",
      value: "target-id--copy",
    });
  });

  it("blocks invalid or non-unique authored source ids with stable issues", () => {
    const invalid = node("invalid", null);
    invalid.attributes.id = { kind: "literal", value: "has space" };
    const invalidDocument = documentOf(invalid);
    expect(() =>
      rewriteDuplicatedDomReferences(invalidDocument, [invalid], [structuredClone(invalid)]),
    ).toThrow(DomReferenceIntegrityError);
    try {
      rewriteDuplicatedDomReferences(invalidDocument, [invalid], [structuredClone(invalid)]);
    } catch (error) {
      expect(error).toBeInstanceOf(DomReferenceIntegrityError);
      expect((error as DomReferenceIntegrityError).issues).toEqual([
        expect.objectContaining({ code: "INVALID_AUTHORED_DOM_ID", nodeId: "invalid" }),
      ]);
    }

    const first = node("first", null);
    first.attributes.id = { kind: "literal", value: "same" };
    const second = node("second", null);
    second.attributes.id = { kind: "literal", value: "same" };
    expect(() =>
      rewriteDuplicatedDomReferences(documentOf(first, second), [first], [structuredClone(first)]),
    ).toThrow(DomReferenceIntegrityError);

    const conflictingCase = node("conflicting-case", null);
    conflictingCase.attributes = {
      ID: { kind: "literal", value: "first-id" },
      id: { kind: "literal", value: "second-id" },
    };
    expect(() =>
      rewriteDuplicatedDomReferences(
        documentOf(conflictingCase),
        [conflictingCase],
        [structuredClone(conflictingCase)],
      ),
    ).toThrow(DomReferenceIntegrityError);
  });

  it("reserves the runtime-effective id even when an outside node has an id spelling conflict", () => {
    const source = node("source", null);
    source.attributes.id = { kind: "literal", value: "card" };
    const occupied = node("occupied", null);
    occupied.attributes = {
      ID: { kind: "literal", value: "shadowed-spelling" },
      id: { kind: "literal", value: "card--copy" },
    };
    const copy = structuredClone(source);

    rewriteDuplicatedDomReferences(documentOf(source, occupied), [source], [copy]);

    expect(copy.attributes.id).toEqual({
      kind: "literal",
      value: "card--copy-2",
    });
  });

  it("finds supported surviving references into a removed subtree in stable order", () => {
    const target = node("target", null);
    target.attributes.id = { kind: "literal", value: "gone" };
    const first = node("first", null);
    first.attributes.href = { kind: "literal", value: "#gone" };
    const second = node("second", null);
    second.accessibility.aria.describedby = { kind: "literal", value: "outside gone" };
    const third = node("third", null);
    third.attributes.href = { kind: "literal", value: "/elsewhere#gone" };

    expect(findExternalDomReferences(documentOf(target, first, second, third), "target")).toEqual([
      { nodeId: "first", property: "href", targetId: "gone", targetNodeId: "target" },
      {
        nodeId: "second",
        property: "aria-describedby",
        targetId: "gone",
        targetNodeId: "target",
      },
    ]);
  });

  it("scans the same effective attribute entry that the DOM runtime renders", () => {
    const target = node("target", null);
    target.attributes.ID = { kind: "literal", value: "gone" };
    const shadowed = node("shadowed", null);
    shadowed.passthrough = { unknownAttributes: { href: "#gone" } };
    shadowed.attributes.HREF = { kind: "literal", value: "/external" };
    const aria = node("aria", null);
    aria.accessibility.aria["ARIA-CONTROLS"] = {
      kind: "literal",
      value: "gone",
    };

    expect(findExternalDomReferences(documentOf(target, shadowed, aria), "target")).toEqual([
      {
        nodeId: "aria",
        property: "aria-controls",
        targetId: "gone",
        targetNodeId: "target",
      },
    ]);
  });

  it("keeps a higher-priority effective id visible despite a shadowed source conflict", () => {
    const target = node("target", null);
    target.attributes.id = { kind: "literal", value: "gone" };
    target.passthrough = {
      unknownAttributes: {
        ID: "old-shadow",
        id: "other-shadow",
      },
    };
    const source = node("source", null);
    source.attributes.href = { kind: "literal", value: "#gone" };

    expect(findExternalDomReferences(documentOf(target, source), "target")).toEqual([
      {
        nodeId: "source",
        property: "href",
        targetId: "gone",
        targetNodeId: "target",
      },
    ]);
  });
});
