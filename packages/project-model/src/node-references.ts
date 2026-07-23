import type { PropertyMap, StrataDocument, StrataValue, StyleScope } from "./index";

/** The authored node-data surface that contains a typed node reference. */
export type ExternalNodeReferenceField = "content" | "attributes" | "style" | "accessibility";

/** A stable, schema-shaped location for a typed node reference. */
export type ExternalNodeReferencePath =
  | readonly ["content"]
  | readonly ["attributes", string]
  | readonly ["styleRules", "properties", string]
  | readonly ["accessibility", "aria", string];

/** The exact authored style scope containing a style-property reference. */
export type ExternalNodeReferenceScope = Readonly<StyleScope>;

/**
 * A surviving node's typed reference into a subtree about to be removed.
 * `scope` is present only when `field` is `"style"`.
 */
export interface ExternalNodeReference {
  sourceNodeId: string;
  targetNodeId: string;
  field: ExternalNodeReferenceField;
  path: ExternalNodeReferencePath;
  scope?: ExternalNodeReferenceScope | undefined;
}

function subtreeNodeIds(document: StrataDocument, rootId: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (nodeId: string) => {
    if (ids.has(nodeId)) return;
    const node = document.nodes[nodeId];
    if (!node) return;
    ids.add(nodeId);
    for (const childId of node.children) visit(childId);
  };
  visit(rootId);
  return ids;
}

function scopeKey(scope: ExternalNodeReferenceScope | undefined): string {
  if (!scope) return "";
  return JSON.stringify([
    scope.breakpoint ?? null,
    scope.state ?? null,
    scope.colorMode ?? null,
    scope.variant ?? null,
  ]);
}

function pathKey(path: ExternalNodeReferencePath): string {
  return path.join("\u0000");
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareReferences(a: ExternalNodeReference, b: ExternalNodeReference): number {
  return (
    compareText(a.sourceNodeId, b.sourceNodeId) ||
    compareText(a.field, b.field) ||
    compareText(pathKey(a.path), pathKey(b.path)) ||
    compareText(scopeKey(a.scope), scopeKey(b.scope)) ||
    compareText(a.targetNodeId, b.targetNodeId)
  );
}

function addPropertyReference(
  references: ExternalNodeReference[],
  sourceNodeId: string,
  targetNodeIds: ReadonlySet<string>,
  value: StrataValue,
  field: ExternalNodeReferenceField,
  path: ExternalNodeReferencePath,
  scope?: ExternalNodeReferenceScope,
): void {
  if (value.kind !== "reference" || !targetNodeIds.has(value.nodeId)) return;
  references.push({
    sourceNodeId,
    targetNodeId: value.nodeId,
    field,
    path,
    ...(scope ? { scope: { ...scope } } : {}),
  });
}

function addPropertyMapReferences(
  references: ExternalNodeReference[],
  sourceNodeId: string,
  targetNodeIds: ReadonlySet<string>,
  properties: PropertyMap,
  field: Exclude<ExternalNodeReferenceField, "content">,
  pathFor: (property: string) => ExternalNodeReferencePath,
  scope?: ExternalNodeReferenceScope,
): void {
  for (const [property, value] of Object.entries(properties))
    addPropertyReference(
      references,
      sourceNodeId,
      targetNodeIds,
      value,
      field,
      pathFor(property),
      scope,
    );
}

/**
 * Finds typed node references from surviving nodes into the subtree rooted at `removedRootId`.
 * It deliberately excludes string, raw, binding, and passthrough values because their references
 * are not reliably distinguishable from ordinary authored text or the DOM-ID namespace.
 */
export function findExternalNodeReferences(
  document: StrataDocument,
  removedRootId: string,
): readonly ExternalNodeReference[] {
  const targetNodeIds = subtreeNodeIds(document, removedRootId);
  if (targetNodeIds.size === 0) return [];

  const references: ExternalNodeReference[] = [];
  for (const node of Object.values(document.nodes)) {
    if (targetNodeIds.has(node.id)) continue;
    if (node.content)
      addPropertyReference(references, node.id, targetNodeIds, node.content, "content", [
        "content",
      ]);
    addPropertyMapReferences(
      references,
      node.id,
      targetNodeIds,
      node.attributes,
      "attributes",
      (property) => ["attributes", property],
    );
    for (const rule of node.styleRules)
      addPropertyMapReferences(
        references,
        node.id,
        targetNodeIds,
        rule.properties,
        "style",
        (property) => ["styleRules", "properties", property],
        rule.scope,
      );
    addPropertyMapReferences(
      references,
      node.id,
      targetNodeIds,
      node.accessibility.aria,
      "accessibility",
      (property) => ["accessibility", "aria", property],
    );
  }
  return references.sort(compareReferences);
}
