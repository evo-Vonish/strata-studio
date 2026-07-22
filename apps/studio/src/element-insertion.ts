import type { StrataDocument, StrataNode, StrataProject } from "@strata/project-model";
import { createDefaultPropertySchemaRegistry } from "@strata/property-schema";
import type { BasicElementType } from "./element-factory";

export type InsertionPlacement = "inside" | "before" | "after";

export interface InsertionTarget {
  parentId: string | null;
  index: number;
}

type IdSource = () => string;

const propertySchema = createDefaultPropertySchemaRegistry();

export function acceptsInsertedChildren(node: StrataNode | null): boolean {
  if (!node || !propertySchema.findElement(node.type)?.acceptsChildren) return false;
  // M1.2 only guarantees arbitrary primitive composition inside a Box. Text and Button can carry
  // authored inline children later, but accepting every primitive there would create invalid HTML.
  return node.type === "Box";
}

export function pageRootNode(document: StrataDocument): StrataNode {
  const rootId = document.rootNodeIds[0];
  const root = rootId ? document.nodes[rootId] : undefined;
  if (!root) throw new Error("The document page root is not available");
  return root;
}

export function isPageRoot(document: StrataDocument, nodeId: string): boolean {
  return document.rootNodeIds[0] === nodeId;
}

export function assertCanContainElement(parent: StrataNode, childType: string): void {
  if (!acceptsInsertedChildren(parent))
    throw new Error(`${parent.editor.name ?? parent.type} cannot contain primitive elements`);
  const parentDefinition = propertySchema.findElement(parent.type);
  const childDefinition = propertySchema.findElement(childType);
  if (!childDefinition)
    throw new Error(`Unsupported element type '${childType}' cannot be reparented safely`);
  if (parentDefinition?.allowedChildren && !parentDefinition.allowedChildren.includes(childType))
    throw new Error(`${parent.type} does not allow ${childType} children`);
  if (childDefinition.allowedParents && !childDefinition.allowedParents.includes(parent.type))
    throw new Error(`${childType} cannot be inserted inside ${parent.type}`);
}

function randomIdFragment(): string {
  return globalThis.crypto.randomUUID();
}

export function createElementId(
  document: StrataDocument,
  type: BasicElementType,
  source: IdSource = randomIdFragment,
): string {
  const base = type.toLowerCase();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `${base}-${source()}`;
    if (!document.nodes[id]) return id;
  }
  throw new Error(`Could not allocate a unique ${type} node ID`);
}

export function resolveInsertionTarget(
  project: StrataProject,
  selectedNodeId: string | null,
  placement: InsertionPlacement,
  childType: BasicElementType,
): InsertionTarget {
  const document = project.documents[project.activeDocumentId];
  if (!document) throw new Error("The active document is not available");
  const selected = selectedNodeId ? document.nodes[selectedNodeId] : undefined;
  if (!selected) {
    const pageRoot = pageRootNode(document);
    assertCanContainElement(pageRoot, childType);
    return { parentId: pageRoot.id, index: pageRoot.children.length };
  }

  if (placement === "inside") {
    assertCanContainElement(selected, childType);
    return { parentId: selected.id, index: selected.children.length };
  }

  if (selected.parentId === null)
    throw new Error("Page-level roots are protected; insert inside a Box instead");

  const siblings = document.nodes[selected.parentId]?.children;
  if (!siblings) throw new Error("The selected node parent is not available");
  const parent = document.nodes[selected.parentId];
  if (!parent) throw new Error("The selected node parent is not available");
  assertCanContainElement(parent, childType);
  const selectedIndex = siblings.indexOf(selected.id);
  if (selectedIndex < 0) throw new Error("The selected node is missing from its parent");
  return {
    parentId: selected.parentId,
    index: selectedIndex + (placement === "after" ? 1 : 0),
  };
}
