import { type ResolvedDomAttribute, resolveNodeDomAttributes } from "@strata/dom-runtime";
import type { StrataDocument, StrataNode, StrataValue } from "@strata/project-model";

export type DomReferenceIntegrityCode = "DUPLICATE_AUTHORED_DOM_ID" | "INVALID_AUTHORED_DOM_ID";

export interface DomReferenceIntegrityIssue {
  code: DomReferenceIntegrityCode;
  message: string;
  nodeId: string;
  property: "id";
  relatedNodeId?: string;
}

/** A deterministic, display-safe failure raised before an unsafe subtree duplicate. */
export class DomReferenceIntegrityError extends Error {
  readonly issues: readonly DomReferenceIntegrityIssue[];

  constructor(issues: readonly DomReferenceIntegrityIssue[]) {
    super(issues[0]?.message ?? "DOM reference integrity check failed");
    this.name = "DomReferenceIntegrityError";
    this.issues = issues;
  }
}

export interface ExternalDomReference {
  nodeId: string;
  property: string;
  targetId: string;
  targetNodeId?: string;
}

interface AuthoredDomId {
  value: string;
  storage: {
    kind: "attributes" | "passthrough";
    key: string;
  };
}

interface StringReference {
  property: string;
  value: string;
}

const SINGLE_REFERENCE_ATTRIBUTES = new Set([
  "for",
  "form",
  "list",
  "popovertarget",
  "commandfor",
  "aria-activedescendant",
  "aria-details",
  "aria-errormessage",
]);
const LIST_REFERENCE_ATTRIBUTES = new Set([
  "headers",
  "itemref",
  "aria-controls",
  "aria-describedby",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
]);

function isLiteralString(value: StrataValue | undefined): value is Extract<
  StrataValue,
  { kind: "literal" }
> & {
  value: string;
} {
  return value?.kind === "literal" && typeof value.value === "string";
}

function entriesForName<T>(record: Record<string, T>, name: string): Array<[string, T]> {
  return Object.entries(record).filter(([key]) => key.toLowerCase() === name);
}

function authoredDomId(node: StrataNode): AuthoredDomId | undefined {
  const resolution = resolveNodeDomAttributes(node);
  const id = resolution.attributes.find((attribute) => attribute.name === "id");
  if (!id) return undefined;
  if (id.source === "attributes" && typeof id.value !== "string" && isLiteralString(id.value))
    return { value: id.value.value, storage: { kind: "attributes", key: id.key } };
  if (id.source === "passthrough" && typeof id.value === "string")
    return { value: id.value, storage: { kind: "passthrough", key: id.key } };
  return undefined;
}

function hasAuthoredDomIdConflict(node: StrataNode): boolean {
  return resolveNodeDomAttributes(node).conflicts.some((conflict) => conflict.name === "id");
}

function hasAuthoredDomId(node: StrataNode): boolean {
  return (
    entriesForName(node.attributes, "id").length > 0 ||
    entriesForName(node.passthrough?.unknownAttributes ?? {}, "id").length > 0
  );
}

function validDomId(value: string): boolean {
  return value.length > 0 && !Array.from(value).some(isAsciiWhitespace);
}

function isAsciiWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r"
  );
}

function mapAsciiTokens(value: string, transform: (token: string) => string): string {
  let output = "";
  let token = "";
  for (const character of value) {
    if (isAsciiWhitespace(character)) {
      if (token) output += transform(token);
      token = "";
      output += character;
    } else token += character;
  }
  return token ? `${output}${transform(token)}` : output;
}

function asciiTokens(value: string): string[] {
  const tokens: string[] = [];
  mapAsciiTokens(value, (token) => {
    tokens.push(token);
    return token;
  });
  return tokens;
}

function nodeTag(node: StrataNode): string {
  return (node.tag ?? node.passthrough?.originalTag ?? "").toLowerCase();
}

function referenceKind(
  node: StrataNode,
  property: string,
): "single" | "list" | "fragment" | undefined {
  const name = property.toLowerCase();
  if (name === "for" && nodeTag(node) === "output") return "list";
  if (SINGLE_REFERENCE_ATTRIBUTES.has(name)) return "single";
  if (LIST_REFERENCE_ATTRIBUTES.has(name)) return "list";
  if (name === "href" || name === "xlink:href") return "fragment";
  return undefined;
}

function effectiveStringReferences(node: StrataNode): StringReference[] {
  const references: StringReference[] = [];
  for (const attribute of resolveNodeDomAttributes(node).attributes) {
    if (!referenceKind(node, attribute.name)) continue;
    if (typeof attribute.value === "string")
      references.push({ property: attribute.name, value: attribute.value });
    else if (isLiteralString(attribute.value))
      references.push({ property: attribute.name, value: attribute.value.value });
  }
  return references;
}

function targetsForReference(node: StrataNode, property: string, value: string): string[] {
  const kind = referenceKind(node, property);
  if (kind === "single") return [value];
  if (kind === "list") return asciiTokens(value);
  if (kind === "fragment" && value.startsWith("#") && value.length > 1) return [value.slice(1)];
  return [];
}

function rewriteReference(
  node: StrataNode,
  property: string,
  value: string,
  replacements: ReadonlyMap<string, string>,
): string {
  const kind = referenceKind(node, property);
  if (kind === "single") return replacements.get(value) ?? value;
  if (kind === "list") return mapAsciiTokens(value, (token) => replacements.get(token) ?? token);
  if (kind === "fragment" && value.startsWith("#") && value.length > 1) {
    const next = replacements.get(value.slice(1));
    return next ? `#${next}` : value;
  }
  return value;
}

function rewriteValue(value: StrataValue, next: string): StrataValue {
  return { ...value, value: next } as StrataValue;
}

function resolvedString(attribute: ResolvedDomAttribute): string | undefined {
  if (typeof attribute.value === "string") return attribute.value;
  return isLiteralString(attribute.value) ? attribute.value.value : undefined;
}

function writeResolvedString(
  node: StrataNode,
  attribute: ResolvedDomAttribute,
  next: string,
): void {
  if (attribute.source === "passthrough") {
    const passthrough = node.passthrough?.unknownAttributes;
    if (passthrough) passthrough[attribute.key] = next;
    return;
  }
  if (attribute.source === "attributes") {
    const value = node.attributes[attribute.key];
    if (value && isLiteralString(value)) node.attributes[attribute.key] = rewriteValue(value, next);
    return;
  }
  if (attribute.source === "aria") {
    const value = node.accessibility.aria[attribute.key];
    if (value && isLiteralString(value))
      node.accessibility.aria[attribute.key] = rewriteValue(value, next);
  }
}

function rewriteNodeReferences(node: StrataNode, replacements: ReadonlyMap<string, string>): void {
  for (const attribute of resolveNodeDomAttributes(node).attributes) {
    const value = resolvedString(attribute);
    if (value === undefined) continue;
    const next = rewriteReference(node, attribute.name, value, replacements);
    if (next !== value) writeResolvedString(node, attribute, next);
  }
}

function documentIds(document: StrataDocument): Map<string, StrataNode[]> {
  const ids = new Map<string, StrataNode[]>();
  for (const node of Object.values(document.nodes)) {
    const id = authoredDomId(node);
    if (!id || !validDomId(id.value)) continue;
    const entries = ids.get(id.value) ?? [];
    entries.push(node);
    ids.set(id.value, entries);
  }
  return ids;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function subtreeIds(document: StrataDocument, rootId: string): Set<string> {
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

function issueOrder(a: DomReferenceIntegrityIssue, b: DomReferenceIntegrityIssue): number {
  return (
    compareText(a.nodeId, b.nodeId) ||
    compareText(a.code, b.code) ||
    compareText(a.relatedNodeId ?? "", b.relatedNodeId ?? "")
  );
}

/**
 * Applies deterministic authored DOM-ID allocation and supported string IDREF rewrites to clones.
 * The supplied clones must be in the same DFS order as their source nodes.
 */
export function rewriteDuplicatedDomReferences(
  document: StrataDocument,
  sourceNodes: readonly StrataNode[],
  clonedNodes: readonly StrataNode[],
): void {
  if (sourceNodes.length !== clonedNodes.length)
    throw new Error("Copied DOM reference nodes must match their source subtree");

  const sourceIds = documentIds(document);
  const sourceNodeIds = new Set(sourceNodes.map((node) => node.id));
  const issues: DomReferenceIntegrityIssue[] = [];
  for (const source of sourceNodes) {
    if (!hasAuthoredDomId(source)) continue;
    const id = authoredDomId(source);
    if (hasAuthoredDomIdConflict(source) || !id || !validDomId(id.value)) {
      issues.push({
        code: "INVALID_AUTHORED_DOM_ID",
        message: `Authored DOM id on '${source.id}' must be a non-empty string without ASCII whitespace`,
        nodeId: source.id,
        property: "id",
      });
      continue;
    }
    const matches = sourceIds.get(id.value) ?? [];
    if (matches.length > 1) {
      for (const match of matches)
        if (match.id !== source.id)
          issues.push({
            code: "DUPLICATE_AUTHORED_DOM_ID",
            message: `Authored DOM id '${id.value}' is not unique in this document`,
            nodeId: source.id,
            property: "id",
            relatedNodeId: match.id,
          });
    }
  }
  if (issues.length > 0) throw new DomReferenceIntegrityError(issues.sort(issueOrder));

  const occupied = new Set(sourceIds.keys());
  const replacements = new Map<string, string>();
  for (const source of sourceNodes) {
    const id = authoredDomId(source);
    if (!id) continue;
    let suffix = 1;
    let candidate = `${id.value}--copy`;
    while (occupied.has(candidate)) {
      suffix += 1;
      candidate = `${id.value}--copy-${suffix}`;
    }
    occupied.add(candidate);
    replacements.set(id.value, candidate);
  }

  for (let index = 0; index < sourceNodes.length; index += 1) {
    const source = sourceNodes[index];
    const clone = clonedNodes[index];
    if (!source || !clone) continue;
    const id = authoredDomId(source);
    if (id) {
      const next = replacements.get(id.value);
      if (!next) throw new Error(`A copied DOM id was not allocated for '${source.id}'`);
      if (id.storage.kind === "attributes")
        clone.attributes[id.storage.key] = { kind: "literal", value: next };
      else {
        const passthrough = clone.passthrough?.unknownAttributes;
        if (!passthrough) throw new Error(`Copied passthrough DOM id is missing on '${source.id}'`);
        passthrough[id.storage.key] = next;
      }
    }
    rewriteNodeReferences(clone, replacements);
  }

  // Keep this assertion near the mutation path: all replacements must only describe copied IDs.
  for (const [sourceId] of replacements) {
    const owners = sourceIds.get(sourceId) ?? [];
    if (!owners.some((owner) => sourceNodeIds.has(owner.id)))
      throw new Error(`Copied DOM id '${sourceId}' is outside the selected subtree`);
  }
}

/** Finds surviving supported string IDREFs that point into a would-be removed subtree. */
export function findExternalDomReferences(
  document: StrataDocument,
  removedRootId: string,
): ExternalDomReference[] {
  const removedNodes = subtreeIds(document, removedRootId);
  const removedIds = new Map<string, string[]>();
  for (const nodeId of removedNodes) {
    const node = document.nodes[nodeId];
    if (!node) continue;
    const id = authoredDomId(node);
    if (id && validDomId(id.value)) {
      const owners = removedIds.get(id.value) ?? [];
      owners.push(nodeId);
      removedIds.set(id.value, owners);
    }
  }
  const references: ExternalDomReference[] = [];
  for (const node of Object.values(document.nodes)) {
    if (removedNodes.has(node.id)) continue;
    for (const reference of effectiveStringReferences(node))
      for (const targetId of targetsForReference(node, reference.property, reference.value)) {
        const owners = removedIds.get(targetId);
        if (!owners) continue;
        references.push({
          nodeId: node.id,
          property: reference.property,
          targetId,
          ...(owners.length === 1 && owners[0] ? { targetNodeId: owners[0] } : {}),
        });
      }
  }
  return references.sort(
    (a, b) =>
      compareText(a.nodeId, b.nodeId) ||
      compareText(a.property, b.property) ||
      compareText(a.targetId, b.targetId),
  );
}
