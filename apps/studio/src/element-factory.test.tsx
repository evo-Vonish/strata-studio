import { strataNodeSchema } from "@strata/project-model";
import { createDefaultPropertySchemaRegistry } from "@strata/property-schema";
import { describe, expect, it } from "vitest";
import { basicElementTypes, createElementNode } from "./element-factory";

const registry = createDefaultPropertySchemaRegistry();

describe("element factory", () => {
  it.each(basicElementTypes)("creates a schema-valid %s node", (type) => {
    const node = createElementNode({
      type,
      nodeId: `${type.toLowerCase()}-node`,
      parentId: "parent",
    });

    expect(strataNodeSchema.parse(node)).toEqual(node);
    expect(node).toMatchObject({
      id: `${type.toLowerCase()}-node`,
      type,
      parentId: "parent",
      children: [],
      editor: { name: registry.getElement(type).label },
    });
    expect(node.tag).toBe(registry.getElement(type).defaultTag);
    expect(node.styleRules).toHaveLength(1);
    expect(node.styleRules[0]?.scope).toEqual({});
    expect(node.styleRules[0]?.properties).not.toEqual({});
  });

  it("supports a root insertion target", () => {
    const node = createElementNode({ type: "Box", nodeId: "root", parentId: null });

    expect(node.parentId).toBeNull();
  });

  it("provides semantic defaults for content and form elements", () => {
    expect(createElementNode({ type: "Text", nodeId: "text", parentId: "parent" })).toMatchObject({
      tag: "p",
      content: { kind: "literal", value: "Text" },
    });
    expect(
      createElementNode({ type: "Button", nodeId: "button", parentId: "parent" }),
    ).toMatchObject({
      tag: "button",
      content: { kind: "literal", value: "Button" },
      attributes: { type: { kind: "literal", value: "button" } },
    });
    expect(createElementNode({ type: "Image", nodeId: "image", parentId: "parent" })).toMatchObject(
      {
        tag: "img",
        attributes: {
          src: { kind: "literal", value: expect.stringMatching(/^data:image\/svg\+xml/) },
          alt: { kind: "literal", value: "Placeholder image" },
        },
      },
    );
    expect(createElementNode({ type: "Input", nodeId: "input", parentId: "parent" })).toMatchObject(
      {
        tag: "input",
        attributes: {
          type: { kind: "literal", value: "text" },
          placeholder: { kind: "literal", value: "Enter text" },
        },
      },
    );
  });

  it("returns independent node records for each invocation", () => {
    const first = createElementNode({ type: "Box", nodeId: "one", parentId: "parent" });
    const second = createElementNode({ type: "Box", nodeId: "two", parentId: "parent" });
    const firstRule = first.styleRules[0];
    if (!firstRule) throw new Error("Box factory is missing its base style rule");
    firstRule.properties.gap = { kind: "dimension", value: 99, unit: "px" };

    expect(second.styleRules[0]?.properties.gap).toEqual({
      kind: "dimension",
      value: 12,
      unit: "px",
    });
  });
});
