import { z } from "zod";

export const STRATA_PROJECT_VERSION = "0.1" as const;
const idSchema = z.string().min(1);
const stringMapSchema = z.record(z.string(), z.string());

export const strataValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unset") }).strict(),
  z
    .object({
      kind: z.literal("literal"),
      value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    })
    .strict(),
  z
    .object({ kind: z.literal("dimension"), value: z.number().finite(), unit: z.string().min(1) })
    .strict(),
  z.object({ kind: z.literal("color"), value: z.string().min(1) }).strict(),
  z
    .object({ kind: z.literal("asset"), assetId: idSchema, fallbackUrl: z.string().optional() })
    .strict(),
  z.object({ kind: z.literal("reference"), nodeId: idSchema }).strict(),
  z.object({ kind: z.literal("token"), tokenId: idSchema }).strict(),
  z.object({ kind: z.literal("binding"), expression: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("raw"), cssText: z.string().min(1) }).strict(),
]);
export type StrataValue = z.infer<typeof strataValueSchema>;
export const propertyMapSchema = z.record(z.string(), strataValueSchema);
export type PropertyMap = z.infer<typeof propertyMapSchema>;

export const styleScopeSchema = z
  .object({
    breakpoint: z.enum(["desktop", "tablet", "mobile"]).optional(),
    state: z.enum(["base", "hover", "focus", "focus-visible", "active", "disabled"]).optional(),
    colorMode: z.string().min(1).optional(),
    variant: z.string().min(1).optional(),
  })
  .strict();
export type StyleScope = z.infer<typeof styleScopeSchema>;
export const styleRuleSchema = z
  .object({
    scope: styleScopeSchema,
    properties: propertyMapSchema.refine(
      (properties) => Object.keys(properties).length > 0,
      "Style rules cannot be empty",
    ),
  })
  .strict();
export type StyleRule = z.infer<typeof styleRuleSchema>;
export const accessibilitySchema = z
  .object({ role: z.string().min(1).optional(), aria: propertyMapSchema.default({}) })
  .strict();
export type Accessibility = z.infer<typeof accessibilitySchema>;
export const interactionBindingSchema = z
  .object({ id: idSchema, event: z.string().min(1), programId: idSchema, entryPointId: idSchema })
  .strict();
export type InteractionBinding = z.infer<typeof interactionBindingSchema>;

export const strataNodeSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["element", "text", "component", "slot", "unknown"]),
    type: z.string().min(1),
    tag: z.string().min(1).optional(),
    parentId: idSchema.nullable(),
    attributes: propertyMapSchema.default({}),
    content: strataValueSchema.optional(),
    children: z.array(idSchema).default([]),
    styleRules: z.array(styleRuleSchema).default([]),
    accessibility: accessibilitySchema.default({ aria: {} }),
    interactions: z.array(interactionBindingSchema).default([]),
    editor: z
      .object({
        name: z.string().min(1).optional(),
        locked: z.boolean().optional(),
        hidden: z.boolean().optional(),
      })
      .strict()
      .default({}),
    passthrough: z
      .object({
        originalTag: z.string().min(1).optional(),
        unknownAttributes: stringMapSchema.optional(),
        unknownStyles: stringMapSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((node, context) => {
    if (new Set(node.children).size !== node.children.length)
      context.addIssue({ code: "custom", path: ["children"], message: "Children must be unique" });
    if (new Set(node.interactions.map((item) => item.id)).size !== node.interactions.length)
      context.addIssue({
        code: "custom",
        path: ["interactions"],
        message: "Interaction IDs must be unique",
      });
    if (new Set(node.interactions.map((item) => item.event)).size !== node.interactions.length)
      context.addIssue({
        code: "custom",
        path: ["interactions"],
        message: "Interaction events must be unique",
      });
    const scopeKeys = node.styleRules.map((rule) =>
      JSON.stringify([
        rule.scope.breakpoint ?? null,
        rule.scope.state ?? null,
        rule.scope.colorMode ?? null,
        rule.scope.variant ?? null,
      ]),
    );
    if (new Set(scopeKeys).size !== scopeKeys.length)
      context.addIssue({
        code: "custom",
        path: ["styleRules"],
        message: "Style rule scopes must be unique",
      });
  });
export type StrataNode = z.infer<typeof strataNodeSchema>;

export const documentSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).optional(),
    rootNodeIds: z.array(idSchema).min(1),
    nodes: z.record(z.string(), strataNodeSchema),
  })
  .strict();
export type StrataDocument = z.infer<typeof documentSchema>;
export const assetSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["image", "font", "video", "audio", "other"]),
    url: z.string().min(1),
    mimeType: z.string().min(1).optional(),
  })
  .strict();
export type StrataAsset = z.infer<typeof assetSchema>;
export const programSchema = z
  .object({ id: idSchema, entryPoints: z.record(z.string(), z.string().min(1)).default({}) })
  .strict();
export type StrataProgram = z.infer<typeof programSchema>;
const projectShape = z
  .object({
    version: z.literal(STRATA_PROJECT_VERSION),
    id: idSchema,
    name: z.string().min(1).optional(),
    activeDocumentId: idSchema,
    documents: z.record(z.string(), documentSchema),
    assets: z.record(z.string(), assetSchema).default({}),
    programs: z.record(z.string(), programSchema).default({}),
  })
  .strict();
function issue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function validateDocument(
  document: StrataDocument,
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  const nodes = document.nodes;
  const roots = new Set(document.rootNodeIds);
  if (roots.size !== document.rootNodeIds.length)
    issue(context, [...path, "rootNodeIds"], "Root nodes must be unique");
  for (const [key, node] of Object.entries(nodes)) {
    if (key !== node.id)
      issue(context, [...path, "nodes", key, "id"], "Node key must equal node.id");
    if (node.parentId === null && !roots.has(node.id))
      issue(context, [...path, "nodes", key], "Parentless node must be a document root");
    if (node.parentId !== null) {
      const parent = nodes[node.parentId];
      if (!parent) issue(context, [...path, "nodes", key, "parentId"], "Unknown parent");
      else if (!parent.children.includes(node.id))
        issue(context, [...path, "nodes", key, "parentId"], "Parent does not contain node");
    }
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child) issue(context, [...path, "nodes", key, "children"], "Unknown child");
      else if (child.parentId !== node.id)
        issue(context, [...path, "nodes", key, "children"], "Child parent does not match");
    }
  }
  for (const rootId of document.rootNodeIds) {
    const root = nodes[rootId];
    if (!root) issue(context, [...path, "rootNodeIds"], "Unknown root");
    else if (root.parentId !== null)
      issue(context, [...path, "rootNodeIds"], "Root must not have a parent");
  }
  for (const startId of Object.keys(nodes)) {
    const seen = new Set<string>();
    let current = nodes[startId];
    while (current?.parentId) {
      if (seen.has(current.id)) {
        issue(context, [...path, "nodes", startId], "Node hierarchy contains a cycle");
        break;
      }
      seen.add(current.id);
      current = nodes[current.parentId];
    }
  }
}
export const strataProjectSchema = projectShape.superRefine((project, context) => {
  if (!project.documents[project.activeDocumentId])
    issue(context, ["activeDocumentId"], "activeDocumentId must reference a document");
  for (const [key, document] of Object.entries(project.documents)) {
    if (key !== document.id)
      issue(context, ["documents", key, "id"], "Document key must equal document.id");
    validateDocument(document, context, ["documents", key]);
    for (const [nodeId, node] of Object.entries(document.nodes)) {
      for (const binding of node.interactions) {
        const program = project.programs[binding.programId];
        if (!program)
          issue(
            context,
            ["documents", key, "nodes", nodeId, "interactions"],
            "Unknown binding program",
          );
        else if (!program.entryPoints[binding.entryPointId])
          issue(
            context,
            ["documents", key, "nodes", nodeId, "interactions"],
            "Unknown program entry point",
          );
      }
    }
  }
  for (const [key, asset] of Object.entries(project.assets))
    if (key !== asset.id) issue(context, ["assets", key, "id"], "Asset key must equal asset.id");
  for (const [key, program] of Object.entries(project.programs))
    if (key !== program.id)
      issue(context, ["programs", key, "id"], "Program key must equal program.id");
});
export type StrataProject = z.infer<typeof strataProjectSchema>;

const metaSchema = z
  .object({
    source: z.enum(["human", "stage", "inspector", "blueprint", "agent", "import"]).optional(),
    documentId: idSchema.optional(),
    transactionId: z.string().min(1).optional(),
  })
  .strict();
export const insertNodeOperationSchema = metaSchema
  .extend({
    type: z.literal("InsertNode"),
    node: strataNodeSchema,
    parentId: idSchema.nullable(),
    index: z.number().int().nonnegative().optional(),
    descendants: z.array(strataNodeSchema).default([]),
  })
  .strict();
export const removeNodeOperationSchema = metaSchema
  .extend({ type: z.literal("RemoveNode"), nodeId: idSchema })
  .strict();
export const moveNodeOperationSchema = metaSchema
  .extend({
    type: z.literal("MoveNode"),
    nodeId: idSchema,
    parentId: idSchema.nullable(),
    index: z.number().int().nonnegative().optional(),
  })
  .strict();
export const setTagOperationSchema = metaSchema
  .extend({ type: z.literal("SetTag"), nodeId: idSchema, tag: z.string().min(1).optional() })
  .strict();
export const setContentOperationSchema = metaSchema
  .extend({ type: z.literal("SetContent"), nodeId: idSchema, value: strataValueSchema.optional() })
  .strict();
export const setAttributeOperationSchema = metaSchema
  .extend({
    type: z.literal("SetAttribute"),
    nodeId: idSchema,
    name: z.string().min(1),
    value: strataValueSchema,
  })
  .strict();
export const removeAttributeOperationSchema = metaSchema
  .extend({ type: z.literal("RemoveAttribute"), nodeId: idSchema, name: z.string().min(1) })
  .strict();
export const setStyleOperationSchema = metaSchema
  .extend({
    type: z.literal("SetStyle"),
    nodeId: idSchema,
    scope: styleScopeSchema,
    name: z.string().min(1),
    value: strataValueSchema.optional(),
  })
  .strict();
export const setAccessibilityOperationSchema = metaSchema
  .extend({
    type: z.literal("SetAccessibility"),
    nodeId: idSchema,
    accessibility: accessibilitySchema,
  })
  .strict();
export const bindInteractionOperationSchema = metaSchema
  .extend({
    type: z.literal("BindInteraction"),
    nodeId: idSchema,
    event: z.string().min(1),
    binding: interactionBindingSchema.optional(),
  })
  .strict();
export const operationSchema = z.discriminatedUnion("type", [
  insertNodeOperationSchema,
  removeNodeOperationSchema,
  moveNodeOperationSchema,
  setTagOperationSchema,
  setContentOperationSchema,
  setAttributeOperationSchema,
  removeAttributeOperationSchema,
  setStyleOperationSchema,
  setAccessibilityOperationSchema,
  bindInteractionOperationSchema,
]);
export type InsertNode = z.infer<typeof insertNodeOperationSchema>;
export type RemoveNode = z.infer<typeof removeNodeOperationSchema>;
export type MoveNode = z.infer<typeof moveNodeOperationSchema>;
export type SetTag = z.infer<typeof setTagOperationSchema>;
export type SetContent = z.infer<typeof setContentOperationSchema>;
export type SetAttribute = z.infer<typeof setAttributeOperationSchema>;
export type RemoveAttribute = z.infer<typeof removeAttributeOperationSchema>;
export type SetStyle = z.infer<typeof setStyleOperationSchema>;
export type SetAccessibility = z.infer<typeof setAccessibilityOperationSchema>;
export type BindInteraction = z.infer<typeof bindInteractionOperationSchema>;
export type ProjectOperation = z.infer<typeof operationSchema>;
export type ApplyResult = { project: StrataProject; inverse: ProjectOperation };
export type TransactionResult = { project: StrataProject; inverse: ProjectOperation[] };
export function parseProject(input: unknown): StrataProject {
  return strataProjectSchema.parse(input);
}
export function safeParseProject(input: unknown) {
  return strataProjectSchema.safeParse(input);
}

function documentFor(project: StrataProject, operation: ProjectOperation): StrataDocument {
  const document = project.documents[operation.documentId ?? project.activeDocumentId];
  if (!document) throw new Error("Unknown operation document");
  return document;
}
function updateDocument(project: StrataProject, document: StrataDocument): StrataProject {
  return { ...project, documents: { ...project.documents, [document.id]: document } };
}
function nodeFor(document: StrataDocument, id: string): StrataNode {
  const node = document.nodes[id];
  if (!node) throw new Error(`Unknown node '${id}' in document '${document.id}'`);
  return node;
}
function insertAt(ids: string[], id: string, index?: number): string[] {
  if (index !== undefined && index > ids.length)
    throw new Error("Insertion index is outside the target list");
  const at = index ?? ids.length;
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}
function without(ids: string[], id: string): string[] {
  return ids.filter((candidate) => candidate !== id);
}
function subtree(document: StrataDocument, id: string): StrataNode[] {
  const result: StrataNode[] = [];
  const visit = (nodeId: string) => {
    const node = nodeFor(document, nodeId);
    result.push(node);
    for (const child of node.children) visit(child);
  };
  visit(id);
  return result;
}
function sameScope(a: StyleScope, b: StyleScope): boolean {
  return (
    a.breakpoint === b.breakpoint &&
    a.state === b.state &&
    a.colorMode === b.colorMode &&
    a.variant === b.variant
  );
}
function inverseMeta(
  operation: ProjectOperation,
  documentId: string,
  inverse: ProjectOperation,
): ProjectOperation {
  return {
    ...inverse,
    ...(operation.source ? { source: operation.source } : {}),
    documentId,
    ...(operation.transactionId ? { transactionId: operation.transactionId } : {}),
  } as ProjectOperation;
}
function replaceNode(document: StrataDocument, node: StrataNode): StrataDocument {
  return { ...document, nodes: { ...document.nodes, [node.id]: node } };
}

export function applyOperation(input: StrataProject, raw: ProjectOperation): ApplyResult {
  const project = parseProject(input);
  const operation = operationSchema.parse(raw);
  const document = documentFor(project, operation);
  switch (operation.type) {
    case "InsertNode": {
      const all = [operation.node, ...operation.descendants];
      if (
        all.some(
          (node, index) =>
            document.nodes[node.id] ||
            all.findIndex((candidate) => candidate.id === node.id) !== index,
        )
      )
        throw new Error("Inserted node IDs must be new and unique");
      const added = Object.fromEntries(all.map((node) => [node.id, node]));
      for (const item of all) {
        for (const child of item.children)
          if (!added[child]) throw new Error("Inserted subtree is missing a child");
        if (item.id === operation.node.id) {
          if (item.parentId !== operation.parentId)
            throw new Error("Inserted root parentId must equal parentId");
        } else if (!item.parentId || !added[item.parentId])
          throw new Error("Inserted descendant parent must be inside subtree");
      }
      let next: StrataDocument = { ...document, nodes: { ...document.nodes, ...added } };
      if (operation.parentId === null)
        next = {
          ...next,
          rootNodeIds: insertAt(next.rootNodeIds, operation.node.id, operation.index),
        };
      else {
        const parent = nodeFor(document, operation.parentId);
        next = replaceNode(next, {
          ...parent,
          children: insertAt(parent.children, operation.node.id, operation.index),
        });
      }
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "RemoveNode",
          nodeId: operation.node.id,
        }),
      };
    }
    case "RemoveNode": {
      const node = nodeFor(document, operation.nodeId);
      const isRoot = node.parentId === null;
      if (isRoot && document.rootNodeIds.length === 1)
        throw new Error("A document must retain at least one root");
      const removed = subtree(document, node.id);
      const index = isRoot
        ? document.rootNodeIds.indexOf(node.id)
        : nodeFor(document, node.parentId as string).children.indexOf(node.id);
      const nodes = { ...document.nodes };
      for (const item of removed) delete nodes[item.id];
      let next: StrataDocument = { ...document, nodes };
      if (isRoot) next = { ...next, rootNodeIds: without(next.rootNodeIds, node.id) };
      else {
        const parent = nodeFor(document, node.parentId as string);
        next = replaceNode(next, { ...parent, children: without(parent.children, node.id) });
      }
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "InsertNode",
          node,
          descendants: removed.slice(1),
          parentId: node.parentId,
          index,
        }),
      };
    }
    case "MoveNode": {
      const node = nodeFor(document, operation.nodeId);
      if (
        operation.parentId &&
        subtree(document, node.id).some((item) => item.id === operation.parentId)
      )
        throw new Error("Cannot move a node into its descendant");
      const oldParentId = node.parentId;
      const oldList =
        oldParentId === null ? document.rootNodeIds : nodeFor(document, oldParentId).children;
      const oldIndex = oldList.indexOf(node.id);
      if (oldParentId === null && operation.parentId !== null && document.rootNodeIds.length === 1)
        throw new Error("A document must retain at least one root");
      let next: StrataDocument = document;
      if (oldParentId === null) next = { ...next, rootNodeIds: without(next.rootNodeIds, node.id) };
      else {
        const parent = nodeFor(next, oldParentId);
        next = replaceNode(next, { ...parent, children: without(parent.children, node.id) });
      }
      const target =
        operation.parentId === null ? next.rootNodeIds : nodeFor(next, operation.parentId).children;
      if (operation.parentId === null)
        next = { ...next, rootNodeIds: insertAt(target, node.id, operation.index) };
      else {
        const parent = nodeFor(next, operation.parentId);
        next = replaceNode(next, {
          ...parent,
          children: insertAt(target, node.id, operation.index),
        });
      }
      next = replaceNode(next, { ...node, parentId: operation.parentId });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "MoveNode",
          nodeId: node.id,
          parentId: oldParentId,
          index: oldIndex,
        }),
      };
    }
    case "SetTag": {
      const node = nodeFor(document, operation.nodeId);
      if (node.kind === "text" || node.kind === "slot")
        throw new Error(`Node kind '${node.kind}' cannot have an HTML tag`);
      const next = replaceNode(document, {
        ...node,
        ...(operation.tag ? { tag: operation.tag } : { tag: undefined }),
      });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "SetTag",
          nodeId: node.id,
          tag: node.tag,
        }),
      };
    }
    case "SetContent": {
      const node = nodeFor(document, operation.nodeId);
      const next = replaceNode(document, {
        ...node,
        ...(operation.value ? { content: operation.value } : { content: undefined }),
      });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "SetContent",
          nodeId: node.id,
          value: node.content,
        }),
      };
    }
    case "SetAttribute": {
      const node = nodeFor(document, operation.nodeId);
      const previous = node.attributes[operation.name];
      const next = replaceNode(document, {
        ...node,
        attributes: { ...node.attributes, [operation.name]: operation.value },
      });
      const inverse: ProjectOperation = previous
        ? { type: "SetAttribute", nodeId: node.id, name: operation.name, value: previous }
        : { type: "RemoveAttribute", nodeId: node.id, name: operation.name };
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, inverse),
      };
    }
    case "RemoveAttribute": {
      const node = nodeFor(document, operation.nodeId);
      const previous = node.attributes[operation.name];
      const attributes = { ...node.attributes };
      delete attributes[operation.name];
      const next = replaceNode(document, { ...node, attributes });
      const inverse: ProjectOperation = previous
        ? { type: "SetAttribute", nodeId: node.id, name: operation.name, value: previous }
        : { type: "RemoveAttribute", nodeId: node.id, name: operation.name };
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, inverse),
      };
    }
    case "SetStyle": {
      const node = nodeFor(document, operation.nodeId);
      const ruleIndex = node.styleRules.findIndex((rule) => sameScope(rule.scope, operation.scope));
      const previous =
        ruleIndex < 0 ? undefined : node.styleRules[ruleIndex]?.properties[operation.name];
      const properties = { ...(ruleIndex < 0 ? {} : node.styleRules[ruleIndex]?.properties) };
      if (operation.value) properties[operation.name] = operation.value;
      else delete properties[operation.name];
      const styleRules = [...node.styleRules];
      if (Object.keys(properties).length === 0) {
        if (ruleIndex >= 0) styleRules.splice(ruleIndex, 1);
      } else if (ruleIndex >= 0) styleRules[ruleIndex] = { scope: operation.scope, properties };
      else styleRules.push({ scope: operation.scope, properties });
      const next = replaceNode(document, { ...node, styleRules });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "SetStyle",
          nodeId: node.id,
          scope: operation.scope,
          name: operation.name,
          value: previous,
        }),
      };
    }
    case "SetAccessibility": {
      const node = nodeFor(document, operation.nodeId);
      const next = replaceNode(document, { ...node, accessibility: operation.accessibility });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "SetAccessibility",
          nodeId: node.id,
          accessibility: node.accessibility,
        }),
      };
    }
    case "BindInteraction": {
      const node = nodeFor(document, operation.nodeId);
      if (operation.binding && operation.binding.event !== operation.event)
        throw new Error("Binding event must equal operation event");
      const previous = node.interactions.find((item) => item.event === operation.event);
      const interactions = node.interactions.filter((item) => item.event !== operation.event);
      if (operation.binding) interactions.push(operation.binding);
      const next = replaceNode(document, { ...node, interactions });
      return {
        project: parseProject(updateDocument(project, next)),
        inverse: inverseMeta(operation, document.id, {
          type: "BindInteraction",
          nodeId: node.id,
          event: operation.event,
          binding: previous,
        }),
      };
    }
  }
}
export function applyTransaction(
  project: StrataProject,
  operations: readonly ProjectOperation[],
): TransactionResult {
  let next = project;
  const inverse: ProjectOperation[] = [];
  for (const operation of operations) {
    const result = applyOperation(next, operation);
    next = result.project;
    inverse.unshift(result.inverse);
  }
  return { project: next, inverse };
}
