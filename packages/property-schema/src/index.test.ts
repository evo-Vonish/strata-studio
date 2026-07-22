import { describe, expect, it } from "vitest";
import {
  type CapabilityDefinition,
  createDefaultPropertySchemaRegistry,
  matchesCondition,
} from "./index";

describe("property schema registry", () => {
  it("composes shared capabilities without duplicate controls", () => {
    const registry = createDefaultPropertySchemaRegistry();
    const properties = registry.getPropertiesForElement("Button");
    expect(properties.map((property) => property.id)).toContain("fontSize");
    expect(new Set(properties.map((property) => property.id)).size).toBe(properties.length);
    expect(() =>
      registry.registerCapability({ id: "box", label: "Again", properties: ["display"] }),
    ).toThrow(/Duplicate/);
  });
  it("rejects capability references and element composition conflicts", () => {
    const registry = createDefaultPropertySchemaRegistry();
    const invalid: CapabilityDefinition = { id: "bad", label: "Bad", properties: ["missing"] };
    expect(() => registry.registerCapability(invalid)).toThrow(/unknown property/);
    expect(() =>
      registry.registerElement({
        type: "Broken",
        label: "Broken",
        category: "Test",
        tags: ["div"],
        defaultTag: "span",
        capabilities: [],
        properties: [],
        events: [],
        acceptsChildren: false,
        defaultNode: {},
      }),
    ).toThrow();
  });
  it("evaluates Input type conditions from raw or Strata values", () => {
    const registry = createDefaultPropertySchemaRegistry();
    expect(registry.isVisible("checked", "Input", { inputType: "checkbox" })).toBe(true);
    expect(
      registry.isVisible("checked", "Input", { inputType: { kind: "literal", value: "text" } }),
    ).toBe(false);
    expect(registry.isVisible("accept", "Input", { inputType: "file" })).toBe(true);
    expect(registry.isVisible("accept", "Input", { inputType: "email" })).toBe(false);
    expect(
      matchesCondition(
        { all: [{ property: "a", exists: true }, { not: { property: "b", exists: true } }] },
        { a: 1 },
      ),
    ).toBe(true);
  });
  it("provides Button and Image semantic controls", () => {
    const registry = createDefaultPropertySchemaRegistry();
    expect(registry.getPropertiesForElement("Button").map((item) => item.id)).toEqual(
      expect.arrayContaining(["buttonType", "disabled", "cursor"]),
    );
    expect(registry.getPropertiesForElement("Image").map((item) => item.id)).toEqual(
      expect.arrayContaining(["imageSource", "alt", "decoding", "fetchPriority", "objectFit"]),
    );
    expect(registry.getPropertiesForElement("Text").map((item) => item.id)).toContain(
      "textContent",
    );
  });
  it("resolves semantic tag options for the selected element", () => {
    const registry = createDefaultPropertySchemaRegistry();
    const boxTag = registry
      .getPropertiesForElement("Box")
      .find((property) => property.id === "tag");
    const textTag = registry
      .getPropertiesForElement("Text")
      .find((property) => property.id === "tag");
    expect(boxTag?.options?.map((option) => option.value)).toContain("nav");
    expect(boxTag?.options?.map((option) => option.value)).not.toContain("p");
    expect(textTag?.options?.map((option) => option.value)).toContain("h6");
    expect(textTag?.options?.map((option) => option.value)).not.toContain("section");
  });
  it("handles malformed definitions and unknown lookups", () => {
    const registry = createDefaultPropertySchemaRegistry();
    expect(registry.findProperty("missing")).toBeUndefined();
    expect(registry.getProperty("display").options).toEqual(
      expect.arrayContaining([{ label: "flex", value: "flex" }]),
    );
    expect(registry.getElement("Input").type).toBe("Input");
    expect(registry.getCapability("typography").properties).toContain("fontSize");
    expect(() => registry.getProperty("missing")).toThrow(/Unknown property/);
    expect(() => registry.getCapability("missing")).toThrow(/Unknown capability/);
    expect(() => registry.getElement("missing")).toThrow(/Unknown element/);
    expect(() =>
      registry.registerProperty({
        id: "bad",
        label: "Bad",
        group: "Test",
        target: "style",
        valueType: "number",
        control: "number",
        min: 2,
        max: 1,
      }),
    ).toThrow(/min/);
  });
});
