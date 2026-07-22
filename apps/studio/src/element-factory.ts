import { type StrataNode, type StrataValue, strataNodeSchema } from "@strata/project-model";
import {
  createDefaultPropertySchemaRegistry,
  type ElementDefinition,
} from "@strata/property-schema";

export const basicElementTypes = ["Box", "Text", "Button", "Image", "Input"] as const;
export type BasicElementType = (typeof basicElementTypes)[number];

export interface CreateElementNodeInput {
  type: BasicElementType;
  nodeId: string;
  parentId: string | null;
}

const propertySchema = createDefaultPropertySchemaRegistry();

const literal = (value: string | number | boolean | null): StrataValue => ({
  kind: "literal",
  value,
});

const dimension = (value: number, unit = "px"): StrataValue => ({
  kind: "dimension",
  value,
  unit,
});

const color = (value: string): StrataValue => ({ kind: "color", value });

const placeholderImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%231b1732'/%3E%3Cpath d='M0 390 210 210l130 120 115-100 345 160v110H0Z' fill='%233f3470'/%3E%3Ccircle cx='590' cy='142' r='52' fill='%23b9ff66'/%3E%3C/svg%3E";

function defaultNode(definition: ElementDefinition, input: CreateElementNodeInput): StrataNode {
  return {
    id: input.nodeId,
    kind: "element",
    type: input.type,
    tag: definition.defaultTag,
    parentId: input.parentId,
    attributes: {},
    children: [],
    styleRules: [],
    accessibility: { aria: {} },
    interactions: [],
    editor: { name: definition.label },
  };
}

/**
 * Creates a detached, schema-valid leaf or container ready for an InsertNode operation.
 * The caller owns placement, IDs, and any follow-up content edits.
 */
export function createElementNode(input: CreateElementNodeInput): StrataNode {
  const definition = propertySchema.getElement(input.type);
  let node = defaultNode(definition, input);

  switch (input.type) {
    case "Box":
      node = {
        ...node,
        styleRules: [
          {
            scope: {},
            properties: {
              display: literal("flex"),
              "flex-direction": literal("column"),
              gap: dimension(12),
              padding: dimension(24),
              "min-height": dimension(120),
            },
          },
        ],
      };
      break;
    case "Text":
      node = {
        ...node,
        content: literal("Text"),
        styleRules: [
          { scope: {}, properties: { margin: dimension(0), "font-size": dimension(16) } },
        ],
      };
      break;
    case "Button":
      node = {
        ...node,
        attributes: { type: literal("button") },
        content: literal("Button"),
        styleRules: [
          {
            scope: {},
            properties: {
              display: literal("inline-flex"),
              "align-items": literal("center"),
              "justify-content": literal("center"),
              width: dimension(132),
              height: dimension(44),
              border: literal("0"),
              "border-radius": dimension(10),
              color: color("#111608"),
              "background-color": color("#b9ff66"),
              "font-weight": literal(650),
              cursor: literal("pointer"),
            },
          },
        ],
      };
      break;
    case "Image":
      node = {
        ...node,
        attributes: {
          src: literal(placeholderImage),
          alt: literal("Placeholder image"),
          loading: literal("lazy"),
          decoding: literal("async"),
        },
        styleRules: [
          {
            scope: {},
            properties: {
              display: literal("block"),
              width: dimension(100, "%"),
              "min-height": dimension(240),
              "object-fit": literal("cover"),
              "border-radius": dimension(12),
            },
          },
        ],
      };
      break;
    case "Input":
      node = {
        ...node,
        attributes: {
          type: literal("text"),
          name: literal("field"),
          placeholder: literal("Enter text"),
          autocomplete: literal("off"),
        },
        styleRules: [
          {
            scope: {},
            properties: {
              width: dimension(100, "%"),
              height: dimension(44),
              padding: dimension(12),
              border: literal("1px solid #6f668e"),
              "border-radius": dimension(10),
              color: color("#f4f1ff"),
              "background-color": color("#1c1738"),
              "font-size": dimension(16),
            },
          },
        ],
      };
      break;
  }

  return strataNodeSchema.parse(node);
}
