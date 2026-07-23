import type {
  InsertNode,
  MoveNode,
  StrataDocument,
  StrataNode,
  StrataProject,
} from "@strata/project-model";
import { createDefaultPropertySchemaRegistry } from "@strata/property-schema";

const propertySchema = createDefaultPropertySchemaRegistry();
const boxTags = new Set(propertySchema.getElement("Box").tags);

export type PageRootMigrationReason =
  | "MISSING_ROOT_ID"
  | "MISSING_ROOT_NODE"
  | "ROOT_HAS_PARENT"
  | "ROOT_KIND"
  | "ROOT_TYPE"
  | "ROOT_TAG";

export interface CompatiblePageRootAssessment {
  status: "compatible";
  documentId: string;
  rootNodeId: string;
  root: StrataNode;
}

export interface RepairRequiredPageRootAssessment {
  status: "repair-required";
  code: "PAGE_ROOT_MIGRATION_REQUIRED";
  documentId: string;
  reason: PageRootMigrationReason;
  message: string;
  rootNodeId?: string;
  root?: StrataNode;
}

export type PageRootAssessment = CompatiblePageRootAssessment | RepairRequiredPageRootAssessment;

export class PageRootMigrationError extends Error {
  readonly assessment: RepairRequiredPageRootAssessment;

  constructor(assessment: RepairRequiredPageRootAssessment) {
    super(assessment.message);
    this.name = "PageRootMigrationError";
    this.assessment = assessment;
  }
}

/** Backwards-compatible name for callers that need to branch on a required migration. */
export const PageRootMigrationRequiredError = PageRootMigrationError;

export interface PageRootMigrationCommand {
  assessment: PageRootAssessment;
  operations: readonly [InsertNode, ...MoveNode[]] | readonly [];
  selectionNodeId: string | null;
}

export type PageRootIdSource = () => string;

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function effectiveTag(node: StrataNode): string {
  return asciiLowercase(node.tag ?? node.passthrough?.originalTag ?? "div");
}

/**
 * Returns whether a node is an editor-safe Box container. Parent placement is intentionally not
 * part of this predicate so normal Studio structure code can reuse it for nested containers.
 */
export function isCompatibleBoxContainer(node: StrataNode | undefined): node is StrataNode {
  return node?.kind === "element" && node.type === "Box" && boxTags.has(effectiveTag(node));
}

function repairRequired(
  document: StrataDocument,
  reason: PageRootMigrationReason,
  message: string,
  rootNodeId?: string,
  root?: StrataNode,
): RepairRequiredPageRootAssessment {
  return {
    status: "repair-required",
    code: "PAGE_ROOT_MIGRATION_REQUIRED",
    documentId: document.id,
    reason,
    message,
    ...(rootNodeId ? { rootNodeId } : {}),
    ...(root ? { root } : {}),
  };
}

/**
 * Inspects the Studio-only first-root contract without modifying an imported document. Project
 * Model root forests intentionally stay more general than this authoring policy.
 */
export function analyzePageRoot(document: StrataDocument): PageRootAssessment {
  const rootNodeId = document.rootNodeIds[0];
  if (!rootNodeId)
    return repairRequired(
      document,
      "MISSING_ROOT_ID",
      "The document has no page root to use as the Studio container",
    );

  const root = document.nodes[rootNodeId];
  if (!root)
    return repairRequired(
      document,
      "MISSING_ROOT_NODE",
      `The document page root '${rootNodeId}' is missing`,
      rootNodeId,
    );
  if (root.parentId !== null)
    return repairRequired(
      document,
      "ROOT_HAS_PARENT",
      `The document page root '${rootNodeId}' must not have a parent`,
      rootNodeId,
      root,
    );
  if (root.kind !== "element")
    return repairRequired(
      document,
      "ROOT_KIND",
      `The document page root '${rootNodeId}' must be an element Box`,
      rootNodeId,
      root,
    );
  if (root.type !== "Box")
    return repairRequired(
      document,
      "ROOT_TYPE",
      `The document page root '${rootNodeId}' must use the Box element type`,
      rootNodeId,
      root,
    );
  if (!boxTags.has(effectiveTag(root)))
    return repairRequired(
      document,
      "ROOT_TAG",
      `The document page root '${rootNodeId}' has an unsupported Box tag '${effectiveTag(root)}'`,
      rootNodeId,
      root,
    );
  return { status: "compatible", documentId: document.id, rootNodeId, root };
}

/** Throws a structured Studio error when a document cannot serve as the page-root container. */
export function assertCompatiblePageRoot(document: StrataDocument): CompatiblePageRootAssessment {
  const assessment = analyzePageRoot(document);
  if (assessment.status === "repair-required") throw new PageRootMigrationError(assessment);
  return assessment;
}

function randomIdFragment(): string {
  return globalThis.crypto.randomUUID();
}

function allocatePageRootId(document: StrataDocument, source: PageRootIdSource): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fragment = source();
    if (!fragment) continue;
    const candidate = `page-root-${fragment}`;
    if (!document.nodes[candidate]) return candidate;
  }
  throw new Error("Could not allocate a unique imported page-root ID");
}

function migrationWrapper(id: string): StrataNode {
  return {
    id,
    kind: "element",
    type: "Box",
    tag: "div",
    parentId: null,
    attributes: {},
    children: [],
    styleRules: [
      {
        scope: {},
        properties: { display: { kind: "literal", value: "contents" } },
      },
    ],
    accessibility: { aria: {} },
    interactions: [],
    editor: { name: "Imported page container" },
  };
}

function documentFor(project: StrataProject, documentId?: string): StrataDocument {
  const selectedId = documentId ?? project.activeDocumentId;
  const document = project.documents[selectedId];
  if (!document) throw new Error(`Unknown document '${selectedId}'`);
  return document;
}

/**
 * Creates the one-time, explicit transaction that wraps legacy page roots. Its forward operations
 * are intentionally ordinary Project Operations so the store obtains the reducer's exact inverse.
 */
export function createPageRootMigrationCommand(
  project: StrataProject,
  documentId?: string,
  idSource: PageRootIdSource = randomIdFragment,
): PageRootMigrationCommand {
  const document = documentFor(project, documentId);
  const assessment = analyzePageRoot(document);
  if (assessment.status === "compatible")
    return { assessment, operations: [], selectionNodeId: assessment.rootNodeId };

  // A model-invalid root cannot be repaired with a legal operation transaction. Keep the
  // assessment attached so the caller can surface a precise import diagnostic instead of guessing.
  if (
    assessment.reason === "MISSING_ROOT_ID" ||
    assessment.reason === "MISSING_ROOT_NODE" ||
    assessment.reason === "ROOT_HAS_PARENT"
  )
    throw new PageRootMigrationError(assessment);

  const originalRootIds = [...document.rootNodeIds];
  const wrapperId = allocatePageRootId(document, idSource);
  const transactionId = `page-root-migration-${wrapperId}`;
  const wrapper = migrationWrapper(wrapperId);
  const insert: InsertNode = {
    type: "InsertNode",
    source: "import",
    documentId: document.id,
    transactionId,
    node: wrapper,
    parentId: null,
    index: 0,
    descendants: [],
  };
  const moves: MoveNode[] = originalRootIds.map((nodeId, index) => ({
    type: "MoveNode",
    source: "import",
    documentId: document.id,
    transactionId,
    nodeId,
    parentId: wrapperId,
    index,
  }));
  return {
    assessment,
    operations: [insert, ...moves],
    selectionNodeId: originalRootIds[0] ?? null,
  };
}
