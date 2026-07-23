import type { MoveNode, StrataDocument, StrataNode, StrataProject } from "@strata/project-model";
import { acceptsInsertedChildren, isPageRoot } from "./element-insertion";

/** The three structural drop locations exposed by the Stage. */
export type StagePlacement = "before" | "inside" | "after";

export type StagePlacementRejectionReason =
  | "unknown-dragged-node"
  | "unknown-hover-target"
  | "dragged-node-locked"
  | "page-root-sentinel"
  | "target-in-dragged-subtree"
  | "root-sibling-placement"
  | "parent-not-box"
  | "parent-locked"
  | "invalid-tree";

export interface StagePlacementCommand {
  operation: MoveNode;
  selectionNodeId: string;
}

export type StagePlacementPlan =
  | { status: "ready"; command: StagePlacementCommand }
  | { status: "no-op"; selectionNodeId: string }
  | { status: "unavailable"; reason: StagePlacementRejectionReason };

export interface StagePlacementCapability {
  available: boolean;
  noOp: boolean;
  reason?: StagePlacementRejectionReason;
}

export type StagePlacementCapabilities = Record<StagePlacement, StagePlacementCapability>;

export interface StagePlacementRect {
  top: number;
  bottom: number;
  height: number;
}

interface NodeContext {
  node: StrataNode;
  siblings: string[];
  index: number;
}

function activeDocument(project: StrataProject): [string, StrataDocument] {
  const document = project.documents[project.activeDocumentId];
  if (!document) throw new Error("The active document is not available");
  return [project.activeDocumentId, document];
}

function nodeContext(document: StrataDocument, nodeId: string): NodeContext | undefined {
  const node = document.nodes[nodeId];
  if (!node) return undefined;
  const siblings =
    node.parentId === null ? document.rootNodeIds : document.nodes[node.parentId]?.children;
  if (!siblings) return undefined;
  const index = siblings.indexOf(nodeId);
  if (index < 0) return undefined;
  return { node, siblings, index };
}

function isInSubtree(document: StrataDocument, rootId: string, nodeId: string): boolean {
  const visited = new Set<string>();
  const visit = (currentId: string): boolean => {
    if (currentId === nodeId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const current = document.nodes[currentId];
    return current?.children.some(visit) ?? false;
  };
  return visit(rootId);
}

function targetParent(
  document: StrataDocument,
  hovered: StrataNode,
  placement: StagePlacement,
): { parentId: string | null; index: number } | StagePlacementRejectionReason {
  if (placement === "inside") return { parentId: hovered.id, index: hovered.children.length };
  if (isPageRoot(document, hovered.id)) return "page-root-sentinel";
  const siblings =
    hovered.parentId === null ? document.rootNodeIds : document.nodes[hovered.parentId]?.children;
  if (!siblings) return "invalid-tree";
  const index = siblings.indexOf(hovered.id);
  if (index < 0) return "invalid-tree";
  return { parentId: hovered.parentId, index: index + (placement === "after" ? 1 : 0) };
}

function unavailable(reason: StagePlacementRejectionReason): StagePlacementPlan {
  return { status: "unavailable", reason };
}

/**
 * Maps a vertical Stage pointer position to a semantic placement. Box targets reserve their middle
 * region for inside; leaf targets split that region at the visual midpoint.
 */
export function stagePlacementFromPoint(
  targetAcceptsChildren: boolean,
  clientY: number,
  rect: StagePlacementRect,
): StagePlacement {
  const edgeBand = Math.min(24, Math.max(8, rect.height * 0.25));
  if (clientY <= rect.top + edgeBand) return "before";
  if (clientY >= rect.bottom - edgeBand) return "after";
  if (targetAcceptsChildren) return "inside";
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Plans one Stage drag drop from canonical model state. Indices are calculated against the
 * destination list after the dragged node has been detached, matching the MoveNode reducer.
 */
export function planStagePlacement(
  project: StrataProject,
  draggedNodeId: string,
  hoverTargetNodeId: string,
  placement: StagePlacement,
): StagePlacementPlan {
  const [documentId, document] = activeDocument(project);
  const dragged = nodeContext(document, draggedNodeId);
  if (!dragged)
    return unavailable(document.nodes[draggedNodeId] ? "invalid-tree" : "unknown-dragged-node");
  if (dragged.node.editor.locked) return unavailable("dragged-node-locked");
  if (isPageRoot(document, draggedNodeId)) return unavailable("page-root-sentinel");

  const hovered = document.nodes[hoverTargetNodeId];
  if (!hovered) return unavailable("unknown-hover-target");
  if (isInSubtree(document, draggedNodeId, hoverTargetNodeId))
    return unavailable("target-in-dragged-subtree");

  const destination = targetParent(document, hovered, placement);
  if (typeof destination === "string") return unavailable(destination);
  if (destination.parentId === null && dragged.node.parentId !== null)
    return unavailable("root-sibling-placement");

  const parent = destination.parentId ? document.nodes[destination.parentId] : undefined;
  if (destination.parentId !== null && !parent) return unavailable("invalid-tree");
  if (parent?.editor.locked) return unavailable("parent-locked");
  if (parent && !acceptsInsertedChildren(parent)) return unavailable("parent-not-box");

  const sameList = destination.parentId === dragged.node.parentId;
  const index = destination.index - (sameList && dragged.index < destination.index ? 1 : 0);
  if (sameList && index === dragged.index)
    return { status: "no-op", selectionNodeId: draggedNodeId };

  return {
    status: "ready",
    command: {
      operation: {
        type: "MoveNode",
        source: "stage",
        documentId,
        nodeId: draggedNodeId,
        parentId: destination.parentId,
        index,
      },
      selectionNodeId: draggedNodeId,
    },
  };
}

/** Returns the Stage's valid drop locations and their explicit rejection reasons. */
export function getStagePlacementCapabilities(
  project: StrataProject,
  draggedNodeId: string,
  hoverTargetNodeId: string,
): StagePlacementCapabilities {
  return Object.fromEntries(
    (["before", "inside", "after"] as const).map((placement) => {
      const plan = planStagePlacement(project, draggedNodeId, hoverTargetNodeId, placement);
      const capability: StagePlacementCapability =
        plan.status === "unavailable"
          ? { available: false, noOp: false, reason: plan.reason }
          : { available: true, noOp: plan.status === "no-op" };
      return [placement, capability];
    }),
  ) as StagePlacementCapabilities;
}
