import type {
  ExternalNodeReference,
  InsertNode,
  MoveNode,
  PropertyMap,
  RemoveNode,
  StrataDocument,
  StrataNode,
  StrataProject,
  StrataValue,
  StyleScope,
} from "@strata/project-model";
import { findExternalNodeReferences } from "@strata/project-model";
import {
  DomReferenceIntegrityError,
  findExternalDomReferences,
  rewriteDuplicatedDomReferences,
} from "./dom-reference-integrity";
import { assertCanContainElement, isPageRoot, pageRootNode } from "./element-insertion";
import { analyzePageRoot, assertCompatiblePageRoot } from "./page-root-migration";

export type StructureMoveDirection = "up" | "down" | "indent" | "outdent";

export type ElementStructureIntegrityCode =
  | "EXTERNAL_NODE_REFERENCE"
  | "EXTERNAL_DOM_ID_REFERENCE"
  | "DUPLICATE_AUTHORED_DOM_ID"
  | "INVALID_AUTHORED_DOM_ID";

export interface ElementStructureIntegrityIssue {
  code: ElementStructureIntegrityCode;
  message: string;
  nodeId: string;
  property?: string;
  relatedNodeId?: string;
}

/** A deterministic structure-command preflight failure that is safe to show in Problems. */
export class ElementStructureIntegrityError extends Error {
  readonly issues: readonly ElementStructureIntegrityIssue[];

  constructor(issues: readonly ElementStructureIntegrityIssue[]) {
    super(issues[0]?.message ?? "Element structure integrity check failed");
    this.name = "ElementStructureIntegrityError";
    this.issues = issues;
  }
}

export function isElementStructureIntegrityError(
  error: unknown,
): error is ElementStructureIntegrityError {
  return error instanceof ElementStructureIntegrityError;
}

export interface ElementStructureCapabilities {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
}

export interface MoveElementCommand {
  operations: [MoveNode];
  selectionNodeId: string;
}

export interface DeleteElementCommand {
  operations: [RemoveNode];
  selectionFallbackId: string;
}

export interface DuplicateElementCommand {
  operations: [InsertNode];
  newRootNodeId: string;
  selectionNodeId: string;
}

export type StructureIdSource = () => string;

const unavailableCapabilities: ElementStructureCapabilities = {
  canMoveUp: false,
  canMoveDown: false,
  canIndent: false,
  canOutdent: false,
  canDelete: false,
  canDuplicate: false,
};

interface NodeContext {
  documentId: string;
  document: StrataDocument;
  node: StrataNode;
  parent: StrataNode | null;
  siblings: string[];
  index: number;
}

function activeDocument(project: StrataProject): [string, StrataDocument] {
  const documentId = project.activeDocumentId;
  const document = project.documents[documentId];
  if (!document) throw new Error("The active document is not available");
  return [documentId, document];
}

function isProtectedRoot(document: StrataDocument, nodeId: string): boolean {
  return isPageRoot(document, nodeId);
}

function nodeContext(project: StrataProject, nodeId: string): NodeContext {
  const [documentId, document] = activeDocument(project);
  assertCompatiblePageRoot(document);
  const node = document.nodes[nodeId];
  if (!node) throw new Error(`Unknown node '${nodeId}' in the active document`);
  if (isProtectedRoot(document, nodeId))
    throw new Error("The document page-root sentinel is protected");
  let parent: StrataNode | null = null;
  if (node.parentId) {
    parent = document.nodes[node.parentId] ?? null;
    if (!parent) throw new Error(`The parent of node '${nodeId}' is not available`);
  }
  const siblings = parent ? parent.children : document.rootNodeIds;
  const index = siblings.indexOf(node.id);
  if (index < 0) throw new Error(`Node '${nodeId}' is missing from its parent`);
  return { documentId, document, node, parent, siblings, index };
}

function canContain(parent: StrataNode | undefined, child: StrataNode): boolean {
  if (!parent || parent.editor.locked) return false;
  try {
    assertCanContainElement(parent, child.type);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the structural actions available for a selection without changing project state.
 * The first document root is the protected page-root sentinel. Additional legacy roots may be
 * normalized into it, but cannot displace index zero or be duplicated as new page-level roots.
 */
export function getElementStructureCapabilities(
  project: StrataProject,
  selectedNodeId: string | null,
): ElementStructureCapabilities {
  const [, document] = activeDocument(project);
  if (analyzePageRoot(document).status === "repair-required") return { ...unavailableCapabilities };
  if (!selectedNodeId || isProtectedRoot(document, selectedNodeId))
    return { ...unavailableCapabilities };
  const node = document.nodes[selectedNodeId];
  if (!node || node.editor.locked) return { ...unavailableCapabilities };
  let parent: StrataNode | null = null;
  if (node.parentId) {
    parent = document.nodes[node.parentId] ?? null;
    if (!parent) return { ...unavailableCapabilities };
  }
  if (parent?.editor.locked) return { ...unavailableCapabilities };
  const siblings = parent ? parent.children : document.rootNodeIds;
  const index = siblings.indexOf(node.id);
  if (index < 0) return { ...unavailableCapabilities };

  const previousId = siblings[index - 1];
  const previous = previousId ? document.nodes[previousId] : undefined;
  const grandparent = parent?.parentId ? document.nodes[parent.parentId] : undefined;
  const parentIndex = grandparent && parent ? grandparent.children.indexOf(parent.id) : -1;
  const rootLevel = node.parentId === null;

  return {
    canMoveUp: rootLevel ? index > 1 : index > 0,
    canMoveDown: index < siblings.length - 1,
    canIndent: canContain(previous, node),
    canOutdent: !rootLevel && parentIndex >= 0 && canContain(grandparent, node),
    canDelete: true,
    canDuplicate: !rootLevel,
  };
}

function unavailableMove(direction: StructureMoveDirection): Error {
  const labels: Record<StructureMoveDirection, string> = {
    up: "move up",
    down: "move down",
    indent: "indent",
    outdent: "outdent",
  };
  return new Error(`The selected node cannot ${labels[direction]}`);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function scopeDescription(scope: Readonly<StyleScope> | undefined): string {
  if (!scope) return "";
  const entries: Array<[string, string]> = [];
  if (scope.breakpoint !== undefined) entries.push(["breakpoint", scope.breakpoint]);
  if (scope.state !== undefined) entries.push(["state", scope.state]);
  if (scope.colorMode !== undefined) entries.push(["colorMode", scope.colorMode]);
  if (scope.variant !== undefined) entries.push(["variant", scope.variant]);
  return entries.length === 0
    ? ""
    : ` [${entries.map(([name, value]) => `${name}=${value}`).join(", ")}]`;
}

function typedReferenceProperty(reference: ExternalNodeReference): string {
  const path = reference.path.join(".");
  return `${path}${scopeDescription(reference.scope)}`;
}

function integrityIssueOrder(
  a: ElementStructureIntegrityIssue,
  b: ElementStructureIntegrityIssue,
): number {
  return (
    compareText(a.nodeId, b.nodeId) ||
    compareText(a.code, b.code) ||
    compareText(a.property ?? "", b.property ?? "") ||
    compareText(a.relatedNodeId ?? "", b.relatedNodeId ?? "")
  );
}

function deleteIntegrityIssues(
  document: StrataDocument,
  nodeId: string,
): ElementStructureIntegrityIssue[] {
  const typed = findExternalNodeReferences(document, nodeId).map(
    (reference): ElementStructureIntegrityIssue => {
      const property = typedReferenceProperty(reference);
      return {
        code: "EXTERNAL_NODE_REFERENCE",
        message: `Node '${reference.sourceNodeId}' references removed node '${reference.targetNodeId}' at ${property}`,
        nodeId: reference.sourceNodeId,
        property,
        relatedNodeId: reference.targetNodeId,
      };
    },
  );
  const dom = findExternalDomReferences(document, nodeId).map(
    (reference): ElementStructureIntegrityIssue => ({
      code: "EXTERNAL_DOM_ID_REFERENCE",
      message: `Node '${reference.nodeId}' references removed DOM id '${reference.targetId}' through ${reference.property}`,
      nodeId: reference.nodeId,
      property: reference.property,
      ...(reference.targetNodeId ? { relatedNodeId: reference.targetNodeId } : {}),
    }),
  );
  return [...typed, ...dom].sort(integrityIssueOrder);
}

/** Creates one explicitly document-scoped MoveNode operation. */
export function createMoveElementCommand(
  project: StrataProject,
  nodeId: string,
  direction: StructureMoveDirection,
): MoveElementCommand {
  const context = nodeContext(project, nodeId);
  const capabilities = getElementStructureCapabilities(project, nodeId);
  let parentId: string | null;
  let index: number;

  switch (direction) {
    case "up":
      if (!capabilities.canMoveUp) throw unavailableMove(direction);
      parentId = context.parent?.id ?? null;
      index = context.index - 1;
      break;
    case "down":
      if (!capabilities.canMoveDown) throw unavailableMove(direction);
      parentId = context.parent?.id ?? null;
      // MoveNode interprets same-parent indices after detaching the selected node.
      index = context.index + 1;
      break;
    case "indent": {
      if (!capabilities.canIndent) throw unavailableMove(direction);
      const previousId = context.siblings[context.index - 1];
      const previous = previousId ? context.document.nodes[previousId] : undefined;
      if (!previous) throw unavailableMove(direction);
      assertCanContainElement(previous, context.node.type);
      parentId = previous.id;
      index = previous.children.length;
      break;
    }
    case "outdent": {
      if (!capabilities.canOutdent || !context.parent?.parentId) throw unavailableMove(direction);
      const grandparent = context.document.nodes[context.parent.parentId];
      if (!grandparent) throw unavailableMove(direction);
      assertCanContainElement(grandparent, context.node.type);
      const parentIndex = grandparent.children.indexOf(context.parent.id);
      if (parentIndex < 0) throw unavailableMove(direction);
      parentId = grandparent.id;
      index = parentIndex + 1;
      break;
    }
  }

  return {
    operations: [
      {
        type: "MoveNode",
        source: "human",
        documentId: context.documentId,
        nodeId,
        parentId,
        index,
      },
    ],
    selectionNodeId: nodeId,
  };
}

/** Creates a subtree delete and the best surviving selection for the UI. */
export function createDeleteElementCommand(
  project: StrataProject,
  nodeId: string,
): DeleteElementCommand {
  const context = nodeContext(project, nodeId);
  if (!getElementStructureCapabilities(project, nodeId).canDelete)
    throw new Error("The selected node cannot be deleted");
  const integrityIssues = deleteIntegrityIssues(context.document, nodeId);
  if (integrityIssues.length > 0) throw new ElementStructureIntegrityError(integrityIssues);
  const selectionFallbackId =
    context.siblings[context.index + 1] ??
    context.siblings[context.index - 1] ??
    context.parent?.id ??
    pageRootNode(context.document).id;
  return {
    operations: [
      {
        type: "RemoveNode",
        source: "human",
        documentId: context.documentId,
        nodeId,
      },
    ],
    selectionFallbackId,
  };
}

function collectSubtree(document: StrataDocument, rootId: string): StrataNode[] {
  const nodes: StrataNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) throw new Error("The selected subtree contains a cycle");
    const node = document.nodes[nodeId];
    if (!node) throw new Error(`The selected subtree is missing node '${nodeId}'`);
    visited.add(nodeId);
    nodes.push(node);
    for (const childId of node.children) visit(childId);
  };
  visit(rootId);
  return nodes;
}

function idPrefix(type: string): string {
  const prefix = type
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return prefix || "node";
}

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

function allocateNodeId(
  node: StrataNode,
  occupied: Set<string>,
  source: StructureIdSource,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fragment = source();
    if (!fragment) continue;
    const candidate = `${idPrefix(node.type)}-${fragment}`;
    if (occupied.has(candidate)) continue;
    occupied.add(candidate);
    return candidate;
  }
  throw new Error(`Could not allocate a unique ${node.type} node ID`);
}

function remapValue(value: StrataValue, idMap: ReadonlyMap<string, string>): StrataValue {
  const copy = structuredClone(value);
  if (copy.kind !== "reference") return copy;
  const nodeId = idMap.get(copy.nodeId);
  return nodeId ? { ...copy, nodeId } : copy;
}

function remapPropertyMap(
  properties: PropertyMap,
  idMap: ReadonlyMap<string, string>,
): PropertyMap {
  return Object.fromEntries(
    Object.entries(properties).map(([name, value]) => [name, remapValue(value, idMap)]),
  );
}

function cloneSubtreeNode(
  original: StrataNode,
  rootId: string,
  idMap: ReadonlyMap<string, string>,
): StrataNode {
  const clone = structuredClone(original);
  const id = idMap.get(original.id);
  if (!id) throw new Error(`A copied ID was not allocated for node '${original.id}'`);
  clone.id = id;
  if (original.id !== rootId) {
    if (!original.parentId) throw new Error(`Copied descendant '${original.id}' has no parent`);
    const parentId = idMap.get(original.parentId);
    if (!parentId)
      throw new Error(`Copied descendant '${original.id}' has a parent outside its subtree`);
    clone.parentId = parentId;
  }
  clone.children = original.children.map((childId) => {
    const child = idMap.get(childId);
    if (!child) throw new Error(`A copied child ID was not allocated for node '${childId}'`);
    return child;
  });
  clone.attributes = remapPropertyMap(original.attributes, idMap);
  if (original.content) clone.content = remapValue(original.content, idMap);
  clone.styleRules = original.styleRules.map((rule) => ({
    scope: structuredClone(rule.scope),
    properties: remapPropertyMap(rule.properties, idMap),
  }));
  clone.accessibility = {
    ...structuredClone(original.accessibility),
    aria: remapPropertyMap(original.accessibility.aria, idMap),
  };
  if (original.id === rootId) {
    clone.editor = {
      ...clone.editor,
      name: `${original.editor.name ?? original.type} copy`,
    };
  }
  return clone;
}

/** Deep-copies a complete subtree immediately after its source as one InsertNode operation. */
export function createDuplicateElementCommand(
  project: StrataProject,
  nodeId: string,
  idSource: StructureIdSource = randomUuid,
): DuplicateElementCommand {
  const context = nodeContext(project, nodeId);
  if (!getElementStructureCapabilities(project, nodeId).canDuplicate)
    throw new Error("The selected node cannot be duplicated");
  const originalNodes = collectSubtree(context.document, nodeId);
  const occupied = new Set(Object.keys(context.document.nodes));
  const idMap = new Map<string, string>();
  for (const node of originalNodes) idMap.set(node.id, allocateNodeId(node, occupied, idSource));
  const copiedNodes = originalNodes.map((node) => cloneSubtreeNode(node, nodeId, idMap));
  try {
    rewriteDuplicatedDomReferences(context.document, originalNodes, copiedNodes);
  } catch (error) {
    if (error instanceof DomReferenceIntegrityError)
      throw new ElementStructureIntegrityError(
        error.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          nodeId: issue.nodeId,
          property: issue.property,
          ...(issue.relatedNodeId === undefined ? {} : { relatedNodeId: issue.relatedNodeId }),
        })),
      );
    throw error;
  }
  const root = copiedNodes[0];
  if (!root) throw new Error("The selected subtree is empty");

  return {
    operations: [
      {
        type: "InsertNode",
        source: "human",
        documentId: context.documentId,
        node: root,
        descendants: copiedNodes.slice(1),
        parentId: root.parentId,
        index: context.index + 1,
      },
    ],
    newRootNodeId: root.id,
    selectionNodeId: root.id,
  };
}
