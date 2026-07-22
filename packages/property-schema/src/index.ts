import { type StrataValue, strataValueSchema } from "@strata/project-model";
import { z } from "zod";

export const propertyTargetSchema = z.enum([
  "content",
  "tag",
  "attribute",
  "style",
  "aria",
  "interaction",
  "editor",
]);
export const propertyValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "dimension",
  "color",
  "asset",
  "url",
  "enum",
  "token",
  "binding",
  "raw",
]);
export const propertyControlSchema = z.enum([
  "text",
  "textarea",
  "number",
  "toggle",
  "select",
  "segmented",
  "color",
  "dimension",
  "asset",
  "url",
  "combobox",
  "code",
]);
export type PropertyTarget = z.infer<typeof propertyTargetSchema>;
export type PropertyValueType = z.infer<typeof propertyValueTypeSchema>;
export type PropertyControl = z.infer<typeof propertyControlSchema>;

export const optionSchema = z.object({ label: z.string().min(1), value: z.unknown() }).strict();
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z
      .object({
        property: z.string().min(1),
        equals: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
        oneOf: z
          .array(z.union([z.string(), z.number().finite(), z.boolean()]))
          .min(1)
          .optional(),
        exists: z.boolean().optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.equals !== undefined || value.oneOf !== undefined || value.exists !== undefined,
        "A condition needs equals, oneOf, or exists",
      ),
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
  ]),
);
export type Condition =
  | {
      property: string;
      equals?: string | number | boolean | undefined;
      oneOf?: Array<string | number | boolean> | undefined;
      exists?: boolean | undefined;
    }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const propertyDefinitionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    group: z.string().min(1),
    target: propertyTargetSchema,
    storageKey: z.string().min(1).optional(),
    valueType: propertyValueTypeSchema,
    control: propertyControlSchema,
    appliesTo: z.array(z.string().min(1)).optional(),
    options: z.array(optionSchema).optional(),
    units: z.array(z.string().min(1)).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().finite().positive().optional(),
    defaultValue: strataValueSchema.optional(),
    responsive: z.boolean().optional(),
    stateful: z.boolean().optional(),
    inheritable: z.boolean().optional(),
    visibleWhen: conditionSchema.optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (
      definition.min !== undefined &&
      definition.max !== undefined &&
      definition.min > definition.max
    )
      context.addIssue({ code: "custom", path: ["min"], message: "min cannot exceed max" });
    if (definition.visibleWhen && (!definition.appliesTo || definition.appliesTo.length === 0))
      context.addIssue({
        code: "custom",
        path: ["appliesTo"],
        message: "Conditional properties must declare appliesTo",
      });
    if (
      (definition.control === "select" || definition.control === "segmented") &&
      !definition.options?.length
    )
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Select controls need options",
      });
  });
export type PropertyDefinition = z.infer<typeof propertyDefinitionSchema>;

export const capabilityDefinitionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    properties: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;
export const elementDefinitionSchema = z
  .object({
    type: z.string().min(1),
    label: z.string().min(1),
    category: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    defaultTag: z.string().min(1),
    capabilities: z.array(z.string().min(1)),
    properties: z.array(z.string().min(1)),
    events: z.array(z.string().min(1)),
    acceptsChildren: z.boolean(),
    allowedParents: z.array(z.string().min(1)).optional(),
    allowedChildren: z.array(z.string().min(1)).optional(),
    defaultNode: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((definition, context) => {
    if (!definition.tags.includes(definition.defaultTag))
      context.addIssue({
        code: "custom",
        path: ["defaultTag"],
        message: "defaultTag must be included in tags",
      });
  });
export type ElementDefinition = z.infer<typeof elementDefinitionSchema>;

export type PropertyValues = Record<string, unknown>;
function unwrap(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as StrataValue).kind === "literal"
  )
    return (value as Extract<StrataValue, { kind: "literal" }>).value;
  return value;
}
export function matchesCondition(condition: Condition, values: PropertyValues): boolean {
  if ("all" in condition) return condition.all.every((item) => matchesCondition(item, values));
  if ("any" in condition) return condition.any.some((item) => matchesCondition(item, values));
  if ("not" in condition) return !matchesCondition(condition.not, values);
  const value = unwrap(values[condition.property]);
  if (condition.exists !== undefined && (value !== undefined) !== condition.exists) return false;
  if (condition.equals !== undefined && value !== condition.equals) return false;
  return !condition.oneOf || condition.oneOf.includes(value as string | number | boolean);
}

export class PropertySchemaRegistry {
  private readonly properties = new Map<string, PropertyDefinition>();
  private readonly capabilities = new Map<string, CapabilityDefinition>();
  private readonly elements = new Map<string, ElementDefinition>();

  registerProperty(definition: PropertyDefinition): this {
    const parsed = propertyDefinitionSchema.parse(definition);
    if (this.properties.has(parsed.id)) throw new Error(`Duplicate property '${parsed.id}'`);
    this.properties.set(parsed.id, parsed);
    return this;
  }
  registerCapability(definition: CapabilityDefinition): this {
    const parsed = capabilityDefinitionSchema.parse(definition);
    if (this.capabilities.has(parsed.id)) throw new Error(`Duplicate capability '${parsed.id}'`);
    for (const id of parsed.properties)
      if (!this.properties.has(id))
        throw new Error(`Capability '${parsed.id}' references unknown property '${id}'`);
    this.capabilities.set(parsed.id, parsed);
    return this;
  }
  registerElement(definition: ElementDefinition): this {
    const parsed = elementDefinitionSchema.parse(definition);
    if (this.elements.has(parsed.type)) throw new Error(`Duplicate element '${parsed.type}'`);
    for (const capability of parsed.capabilities)
      if (!this.capabilities.has(capability))
        throw new Error(`Element '${parsed.type}' references unknown capability '${capability}'`);
    for (const property of parsed.properties)
      if (!this.properties.has(property))
        throw new Error(`Element '${parsed.type}' references unknown property '${property}'`);
    this.elements.set(parsed.type, parsed);
    return this;
  }
  findProperty(id: string): PropertyDefinition | undefined {
    return this.properties.get(id);
  }
  findCapability(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }
  findElement(type: string): ElementDefinition | undefined {
    return this.elements.get(type);
  }
  getProperty(id: string): PropertyDefinition {
    const definition = this.findProperty(id);
    if (!definition) throw new Error(`Unknown property '${id}'`);
    return definition;
  }
  getCapability(id: string): CapabilityDefinition {
    const definition = this.findCapability(id);
    if (!definition) throw new Error(`Unknown capability '${id}'`);
    return definition;
  }
  getElement(type: string): ElementDefinition {
    const definition = this.findElement(type);
    if (!definition) throw new Error(`Unknown element '${type}'`);
    return definition;
  }
  getPropertiesForElement(type: string): PropertyDefinition[] {
    const element = this.elements.get(type);
    if (!element) throw new Error(`Unknown element '${type}'`);
    const ids = [
      ...element.capabilities.flatMap((id) => this.capabilities.get(id)?.properties ?? []),
      ...element.properties,
    ];
    return [...new Set(ids)]
      .map((id) => this.properties.get(id))
      .filter((item): item is PropertyDefinition => item !== undefined)
      .map((property) =>
        property.id === "tag"
          ? {
              ...property,
              options: element.tags.map((tag) => ({ label: tag, value: tag })),
            }
          : property,
      );
  }
  isApplicable(property: PropertyDefinition | string, elementType: string): boolean {
    const definition = typeof property === "string" ? this.properties.get(property) : property;
    return Boolean(
      definition && (!definition.appliesTo || definition.appliesTo.includes(elementType)),
    );
  }
  isVisible(
    property: PropertyDefinition | string,
    elementType: string,
    values: PropertyValues,
  ): boolean {
    const definition = typeof property === "string" ? this.properties.get(property) : property;
    return Boolean(
      definition &&
        this.isApplicable(definition, elementType) &&
        (!definition.visibleWhen || matchesCondition(definition.visibleWhen, values)),
    );
  }
}

const textInputTypes = ["text", "search", "tel", "url", "email", "password"];
const readOnlyInputTypes = [
  ...textInputTypes,
  "number",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
];
const enumValues: Record<string, string[]> = {
  display: ["block", "inline", "flex", "grid", "none"],
  overflow: ["visible", "hidden", "auto", "scroll"],
  flexDirection: ["row", "row-reverse", "column", "column-reverse"],
  flexWrap: ["nowrap", "wrap", "wrap-reverse"],
  justifyContent: ["flex-start", "center", "flex-end", "space-between"],
  alignItems: ["stretch", "flex-start", "center", "flex-end"],
  textAlign: ["start", "center", "end", "justify"],
  cursor: ["auto", "pointer", "text", "not-allowed"],
  pointerEvents: ["auto", "none"],
  objectFit: ["fill", "contain", "cover", "none", "scale-down"],
  tag: [
    "div",
    "section",
    "main",
    "article",
    "header",
    "footer",
    "nav",
    "aside",
    "p",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],
  buttonType: ["button", "submit", "reset"],
  loading: ["eager", "lazy"],
  decoding: ["auto", "sync", "async"],
  fetchPriority: ["auto", "high", "low"],
  inputType: [
    ...textInputTypes,
    "number",
    "range",
    "checkbox",
    "radio",
    "file",
    "date",
    "month",
    "week",
    "time",
    "datetime-local",
    "color",
  ],
  autocomplete: ["off", "on", "name", "email", "current-password", "new-password"],
};
function enumOptions(id: string) {
  return (enumValues[id] ?? ["auto"]).map((value) => ({ label: value, value }));
}

const styleGroups: Record<string, string> = {
  display: "Layout",
  overflow: "Layout",
  width: "Size",
  height: "Size",
  minWidth: "Size",
  maxWidth: "Size",
  margin: "Spacing",
  padding: "Spacing",
  gap: "Spacing",
  flexDirection: "Flex",
  flexWrap: "Flex",
  justifyContent: "Flex",
  alignItems: "Flex",
  flexGrow: "Flex Item",
  flexShrink: "Flex Item",
  flexBasis: "Flex Item",
  fontFamily: "Typography",
  fontSize: "Typography",
  fontWeight: "Typography",
  lineHeight: "Typography",
  color: "Typography",
  textAlign: "Typography",
  backgroundColor: "Fill",
  backgroundImage: "Fill",
  borderWidth: "Border",
  borderColor: "Border",
  borderRadius: "Border",
  opacity: "Effects",
  boxShadow: "Effects",
  cursor: "Interaction",
  pointerEvents: "Interaction",
  objectFit: "Media",
  objectPosition: "Media",
};

const style = (
  id: string,
  label: string,
  valueType: PropertyValueType,
  control: PropertyControl = "text",
): PropertyDefinition => ({
  id,
  label,
  group: styleGroups[id] ?? "Style",
  target: "style",
  storageKey: id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
  valueType,
  control,
  responsive: true,
  stateful: true,
  defaultValue: id === "display" ? { kind: "literal", value: "block" } : { kind: "unset" },
  ...(id === "fontFamily" ||
  id === "fontSize" ||
  id === "fontWeight" ||
  id === "lineHeight" ||
  id === "color" ||
  id === "textAlign"
    ? { inheritable: true }
    : {}),
  ...(control === "select" || control === "segmented" ? { options: enumOptions(id) } : {}),
  ...(valueType === "dimension" ? { units: ["px", "rem", "em", "%", "vw", "vh"] } : {}),
});
const attribute = (
  id: string,
  label: string,
  valueType: PropertyValueType,
  control: PropertyControl = "text",
  appliesTo?: string[],
  storageKey = id,
): PropertyDefinition => ({
  id,
  label,
  group: "Content",
  target: "attribute",
  storageKey,
  valueType,
  control,
  ...(appliesTo ? { appliesTo } : {}),
  ...(control === "select" || control === "segmented" ? { options: enumOptions(id) } : {}),
});

export const propertyDefinitions: PropertyDefinition[] = [
  style("display", "Display", "enum", "select"),
  style("overflow", "Overflow", "enum", "select"),
  style("width", "Width", "dimension", "dimension"),
  style("height", "Height", "dimension", "dimension"),
  style("minWidth", "Min width", "dimension", "dimension"),
  style("maxWidth", "Max width", "dimension", "dimension"),
  style("margin", "Margin", "dimension", "dimension"),
  style("padding", "Padding", "dimension", "dimension"),
  style("gap", "Gap", "dimension", "dimension"),
  style("flexDirection", "Direction", "enum", "segmented"),
  style("flexWrap", "Wrap", "enum", "select"),
  style("justifyContent", "Justify", "enum", "select"),
  style("alignItems", "Align items", "enum", "select"),
  style("flexGrow", "Grow", "number", "number"),
  style("flexShrink", "Shrink", "number", "number"),
  style("flexBasis", "Basis", "dimension", "dimension"),
  style("fontFamily", "Font", "string", "combobox"),
  style("fontSize", "Font size", "dimension", "dimension"),
  style("fontWeight", "Weight", "number", "number"),
  style("lineHeight", "Line height", "dimension", "dimension"),
  style("color", "Color", "color", "color"),
  style("textAlign", "Align", "enum", "segmented"),
  style("backgroundColor", "Background", "color", "color"),
  style("backgroundImage", "Background image", "raw", "text"),
  style("borderWidth", "Border width", "dimension", "dimension"),
  style("borderColor", "Border color", "color", "color"),
  style("borderRadius", "Corner radius", "dimension", "dimension"),
  style("opacity", "Opacity", "number", "number"),
  style("boxShadow", "Shadow", "raw", "text"),
  style("cursor", "Cursor", "enum", "select"),
  style("pointerEvents", "Pointer events", "enum", "select"),
  style("objectFit", "Object fit", "enum", "select"),
  style("objectPosition", "Object position", "string"),
  {
    id: "tag",
    label: "Semantic tag",
    group: "Content",
    target: "tag",
    valueType: "enum",
    control: "select",
    appliesTo: ["Box", "Text"],
    options: enumOptions("tag"),
  },
  {
    id: "textContent",
    label: "Text",
    group: "Content",
    target: "content",
    valueType: "string",
    control: "textarea",
    appliesTo: ["Text", "Button"],
    defaultValue: { kind: "literal", value: "" },
  },
  attribute("buttonType", "Button type", "enum", "select", ["Button"], "type"),
  attribute("disabled", "Disabled", "boolean", "toggle", ["Button", "Input"]),
  attribute("imageSource", "Source", "asset", "asset", ["Image"], "src"),
  attribute("alt", "Alternative text", "string", "text", ["Image"]),
  attribute("loading", "Loading", "enum", "select", ["Image"]),
  attribute("decoding", "Decoding", "enum", "select", ["Image"]),
  attribute("fetchPriority", "Fetch priority", "enum", "select", ["Image"], "fetchpriority"),
  attribute("inputType", "Input type", "enum", "select", ["Input"], "type"),
  attribute("name", "Name", "string", "text", ["Button", "Input"]),
  attribute("value", "Value", "string", "text", ["Button", "Input"]),
  attribute("placeholder", "Placeholder", "string", "text", ["Input"]),
  attribute("required", "Required", "boolean", "toggle", ["Input"]),
  attribute("autocomplete", "Autocomplete", "enum", "select", ["Input"]),
  {
    ...attribute("readOnly", "Read only", "boolean", "toggle", ["Input"], "readonly"),
    visibleWhen: { property: "inputType", oneOf: readOnlyInputTypes },
  },
  {
    ...attribute("pattern", "Pattern", "string", "text", ["Input"]),
    visibleWhen: { property: "inputType", oneOf: textInputTypes },
  },
  {
    ...attribute("minLength", "Minimum length", "number", "number", ["Input"], "minlength"),
    visibleWhen: { property: "inputType", oneOf: textInputTypes },
  },
  {
    ...attribute("maxLength", "Maximum length", "number", "number", ["Input"], "maxlength"),
    visibleWhen: { property: "inputType", oneOf: textInputTypes },
  },
  {
    ...attribute("checked", "Checked", "boolean", "toggle", ["Input"]),
    visibleWhen: { property: "inputType", oneOf: ["checkbox", "radio"] },
  },
  {
    ...attribute("min", "Minimum", "number", "number", ["Input"]),
    visibleWhen: {
      property: "inputType",
      oneOf: ["number", "range"],
    },
  },
  {
    ...attribute("max", "Maximum", "number", "number", ["Input"]),
    visibleWhen: {
      property: "inputType",
      oneOf: ["number", "range"],
    },
  },
  {
    ...attribute("step", "Step", "number", "number", ["Input"]),
    visibleWhen: {
      property: "inputType",
      oneOf: ["number", "range"],
    },
  },
  {
    ...attribute("accept", "Accepted files", "string", "text", ["Input"]),
    visibleWhen: { property: "inputType", equals: "file" },
  },
  {
    ...attribute("multiple", "Multiple", "boolean", "toggle", ["Input"]),
    visibleWhen: { property: "inputType", oneOf: ["file", "email"] },
  },
];

export const capabilityDefinitions: CapabilityDefinition[] = [
  { id: "box", label: "Box", properties: ["display", "overflow"] },
  { id: "sizing", label: "Sizing", properties: ["width", "height", "minWidth", "maxWidth"] },
  { id: "spacing", label: "Spacing", properties: ["margin", "padding", "gap"] },
  {
    id: "flex-container",
    label: "Flex container",
    properties: ["flexDirection", "flexWrap", "justifyContent", "alignItems"],
  },
  { id: "flex-item", label: "Flex item", properties: ["flexGrow", "flexShrink", "flexBasis"] },
  {
    id: "typography",
    label: "Typography",
    properties: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "textAlign"],
  },
  { id: "background", label: "Background", properties: ["backgroundColor", "backgroundImage"] },
  { id: "border", label: "Border", properties: ["borderWidth", "borderColor", "borderRadius"] },
  { id: "effects", label: "Effects", properties: ["opacity", "boxShadow"] },
  { id: "interactive", label: "Interactive", properties: ["cursor", "pointerEvents"] },
  {
    id: "replaced-content",
    label: "Replaced content",
    properties: ["objectFit", "objectPosition"],
  },
];
const visual = ["box", "sizing", "spacing", "typography", "background", "border", "effects"];
export const elementDefinitions: ElementDefinition[] = [
  {
    type: "Box",
    label: "Box",
    category: "Layout",
    tags: ["div", "section", "main", "article", "header", "footer", "nav", "aside"],
    defaultTag: "div",
    capabilities: [...visual, "flex-container", "flex-item"],
    properties: ["tag"],
    events: [],
    acceptsChildren: true,
    defaultNode: { tag: "div" },
  },
  {
    type: "Text",
    label: "Text",
    category: "Text",
    tags: ["p", "span", "h1", "h2", "h3", "h4", "h5", "h6"],
    defaultTag: "p",
    capabilities: ["typography", "spacing", "flex-item"],
    properties: ["tag", "textContent"],
    events: [],
    acceptsChildren: true,
    defaultNode: { tag: "p" },
  },
  {
    type: "Button",
    label: "Button",
    category: "Controls",
    tags: ["button"],
    defaultTag: "button",
    capabilities: [...visual, "interactive", "flex-item"],
    properties: ["textContent", "buttonType", "disabled", "name", "value"],
    events: ["click", "focus", "blur"],
    acceptsChildren: true,
    defaultNode: { tag: "button" },
  },
  {
    type: "Image",
    label: "Image",
    category: "Media",
    tags: ["img"],
    defaultTag: "img",
    capabilities: [
      "box",
      "sizing",
      "spacing",
      "border",
      "effects",
      "replaced-content",
      "flex-item",
    ],
    properties: ["imageSource", "alt", "loading", "decoding", "fetchPriority"],
    events: ["load", "error"],
    acceptsChildren: false,
    defaultNode: { tag: "img" },
  },
  {
    type: "Input",
    label: "Input",
    category: "Forms",
    tags: ["input"],
    defaultTag: "input",
    capabilities: [
      "box",
      "sizing",
      "spacing",
      "typography",
      "background",
      "border",
      "effects",
      "interactive",
      "flex-item",
      "replaced-content",
    ],
    properties: [
      "inputType",
      "name",
      "value",
      "placeholder",
      "required",
      "autocomplete",
      "readOnly",
      "pattern",
      "minLength",
      "maxLength",
      "disabled",
      "checked",
      "min",
      "max",
      "step",
      "accept",
      "multiple",
    ],
    events: ["input", "change", "focus", "blur"],
    acceptsChildren: false,
    defaultNode: { tag: "input" },
  },
];

export function createDefaultPropertySchemaRegistry(): PropertySchemaRegistry {
  const registry = new PropertySchemaRegistry();
  for (const property of propertyDefinitions) registry.registerProperty(property);
  for (const capability of capabilityDefinitions) registry.registerCapability(capability);
  for (const element of elementDefinitions) registry.registerElement(element);
  return registry;
}
