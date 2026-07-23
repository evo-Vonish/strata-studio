import {
  parseProject,
  type StrataDocument,
  type StrataNode,
  type StrataProject,
  type StrataValue,
  type StyleScope,
} from "@strata/project-model";

export interface CompileWarning {
  code:
    | "BLOCKED_ATTRIBUTE"
    | "BLOCKED_CSS_VALUE"
    | "BLOCKED_TAG"
    | "BLOCKED_URL"
    | "INVALID_ATTRIBUTE"
    | "INVALID_STYLE_PROPERTY"
    | "MISSING_ASSET"
    | "UNSUPPORTED_NODE_KIND"
    | "UNSUPPORTED_SCOPE"
    | "UNRESOLVED_BINDING";
  message: string;
  nodeId?: string;
  property?: string;
}

export interface CompileOptions {
  breakpoints?: Partial<Record<"desktop" | "tablet" | "mobile", string>>;
  tokenPrefix?: string;
}

export interface CompiledDocument {
  html: string;
  css: string;
  warnings: CompileWarning[];
}

export interface StageDocumentOptions extends CompileOptions {
  title?: string;
}

export interface StageShellOptions {
  title?: string;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const BLOCKED_TAGS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
]);
const URL_ATTRIBUTES = new Set([
  "action",
  "cite",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);
const DEFAULT_BREAKPOINTS = {
  desktop: "(min-width: 1024px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  mobile: "(max-width: 767px)",
} as const;

function warning(
  warnings: CompileWarning[],
  code: CompileWarning["code"],
  message: string,
  nodeId?: string,
  property?: string,
): void {
  warnings.push({
    code,
    message,
    ...(nodeId ? { nodeId } : {}),
    ...(property ? { property } : {}),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stableFragment(value: string): string {
  return Array.from(value, (character) => character.codePointAt(0)?.toString(16) ?? "0").join("-");
}

function className(nodeId: string): string {
  return `strata-n-${stableFragment(nodeId)}`;
}

function cssName(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function tokenName(tokenId: string, prefix: string): string {
  return `--${prefix}-${stableFragment(tokenId)}`;
}

function safeUrl(value: string): boolean {
  const compact = Array.from(value.trim())
    .filter((character) => (character.codePointAt(0) ?? 0) > 32)
    .join("")
    .toLowerCase();
  return !(
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:text/html") ||
    compact.startsWith("data:application/xhtml")
  );
}

interface ValueContext {
  project: StrataProject;
  warnings: CompileWarning[];
  nodeId: string;
  property: string;
  tokenPrefix: string;
  css: boolean;
}

function serializeValue(value: StrataValue, context: ValueContext): string | undefined {
  switch (value.kind) {
    case "unset":
      return undefined;
    case "literal":
      return value.value === null ? undefined : String(value.value);
    case "dimension":
      return `${value.value}${value.unit}`;
    case "color":
      return value.value;
    case "raw":
      return value.cssText;
    case "token":
      return `var(${tokenName(value.tokenId, context.tokenPrefix)})`;
    case "reference":
      return value.nodeId;
    case "binding":
      warning(
        context.warnings,
        "UNRESOLVED_BINDING",
        `Binding '${value.expression}' cannot be serialized without runtime evaluation`,
        context.nodeId,
        context.property,
      );
      return undefined;
    case "asset": {
      const asset = context.project.assets[value.assetId];
      if (asset) return context.css ? `url("${escapeCssString(asset.url)}")` : asset.url;
      warning(
        context.warnings,
        "MISSING_ASSET",
        `Asset '${value.assetId}' could not be resolved`,
        context.nodeId,
        context.property,
      );
      if (!value.fallbackUrl) return undefined;
      return context.css ? `url("${escapeCssString(value.fallbackUrl)}")` : value.fallbackUrl;
    }
  }
}

function escapeCssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\a ");
}

function safeCssValue(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  return !(
    /[{}<>]/.test(value) ||
    normalized.includes("javascript:") ||
    normalized.includes("vbscript:") ||
    normalized.includes("expression(") ||
    normalized.includes("@import")
  );
}

function stateSuffix(scope: StyleScope): string {
  if (!scope.state || scope.state === "base") return "";
  return `:${scope.state}`;
}

function mediaQuery(scope: StyleScope, options: CompileOptions): string | undefined {
  if (!scope.breakpoint) return undefined;
  return options.breakpoints?.[scope.breakpoint] ?? DEFAULT_BREAKPOINTS[scope.breakpoint];
}

function styleCss(
  node: StrataNode,
  project: StrataProject,
  options: CompileOptions,
  warnings: CompileWarning[],
): string[] {
  const output: string[] = [];
  for (const rule of node.styleRules) {
    if (rule.scope.colorMode || rule.scope.variant) {
      warning(
        warnings,
        "UNSUPPORTED_SCOPE",
        "colorMode and variant style scopes are not supported by the DOM runtime",
        node.id,
      );
      continue;
    }
    const declarations: string[] = [];
    for (const [name, value] of Object.entries(rule.properties).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const propertyName = cssName(name);
      if (!/^(--[a-zA-Z0-9_-]+|[a-z][a-z0-9-]*)$/.test(propertyName)) {
        warning(
          warnings,
          "INVALID_STYLE_PROPERTY",
          `Invalid CSS property '${name}'`,
          node.id,
          name,
        );
        continue;
      }
      const serialized = serializeValue(value, {
        project,
        warnings,
        nodeId: node.id,
        property: name,
        tokenPrefix: options.tokenPrefix ?? "token",
        css: true,
      });
      if (serialized === undefined) continue;
      if (!safeCssValue(serialized)) {
        warning(
          warnings,
          "BLOCKED_CSS_VALUE",
          `Unsafe CSS value for '${name}' was blocked`,
          node.id,
          name,
        );
        continue;
      }
      declarations.push(`${propertyName}:${serialized}`);
    }
    if (declarations.length === 0) continue;
    const selector = `.${className(node.id)}${stateSuffix(rule.scope)}`;
    const body = `${selector}{${declarations.join(";")}}`;
    const media = mediaQuery(rule.scope, options);
    output.push(media ? `@media ${media}{${body}}` : body);
  }
  return output;
}

function safeTag(node: StrataNode, warnings: CompileWarning[]): string {
  const candidate = (node.tag ?? node.passthrough?.originalTag ?? "div").toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(candidate) || BLOCKED_TAGS.has(candidate)) {
    warning(warnings, "BLOCKED_TAG", `Tag '${candidate}' was replaced with div`, node.id);
    return "div";
  }
  return candidate;
}

function attributeEntries(
  node: StrataNode,
  project: StrataProject,
  options: CompileOptions,
  warnings: CompileWarning[],
): string[] {
  const values = new Map<string, StrataValue | string>();
  for (const [name, value] of Object.entries(node.passthrough?.unknownAttributes ?? {}))
    values.set(name, value);
  for (const [name, value] of Object.entries(node.attributes)) values.set(name, value);
  for (const [name, value] of Object.entries(node.accessibility.aria))
    values.set(name.startsWith("aria-") ? name : `aria-${name}`, value);
  if (node.accessibility.role) values.set("role", node.accessibility.role);

  const generatedClass = node.styleRules.length > 0 ? className(node.id) : undefined;
  const authoredClass = values.get("class");
  values.delete("class");
  const output = [`data-strata-node-id="${escapeHtml(node.id)}"`];
  if (generatedClass || authoredClass !== undefined) {
    const authored =
      typeof authoredClass === "string"
        ? authoredClass
        : authoredClass
          ? serializeValue(authoredClass, {
              project,
              warnings,
              nodeId: node.id,
              property: "class",
              tokenPrefix: options.tokenPrefix ?? "token",
              css: false,
            })
          : undefined;
    const combined = [authored, generatedClass].filter(Boolean).join(" ");
    if (combined) output.push(`class="${escapeHtml(combined)}"`);
  }
  for (const [originalName, value] of [...values.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const name = originalName.toLowerCase();
    if (!/^[a-z_:][a-z0-9:._-]*$/.test(name)) {
      warning(
        warnings,
        "INVALID_ATTRIBUTE",
        `Invalid attribute '${originalName}'`,
        node.id,
        originalName,
      );
      continue;
    }
    if (name.startsWith("on") || name === "srcdoc") {
      warning(
        warnings,
        "BLOCKED_ATTRIBUTE",
        `Active attribute '${name}' was blocked`,
        node.id,
        name,
      );
      continue;
    }
    const serialized =
      typeof value === "string"
        ? value
        : serializeValue(value, {
            project,
            warnings,
            nodeId: node.id,
            property: name,
            tokenPrefix: options.tokenPrefix ?? "token",
            css: false,
          });
    if (serialized === undefined) continue;
    if (URL_ATTRIBUTES.has(name) && !safeUrl(serialized)) {
      warning(warnings, "BLOCKED_URL", `Unsafe URL in '${name}' was blocked`, node.id, name);
      continue;
    }
    if (typeof value !== "string" && value.kind === "literal" && value.value === false) continue;
    if (typeof value !== "string" && value.kind === "literal" && value.value === true) {
      output.push(name);
      continue;
    }
    output.push(`${name}="${escapeHtml(serialized)}"`);
  }
  return output;
}

function contentText(
  node: StrataNode,
  project: StrataProject,
  options: CompileOptions,
  warnings: CompileWarning[],
): string {
  if (!node.content) return "";
  const serialized = serializeValue(node.content, {
    project,
    warnings,
    nodeId: node.id,
    property: "content",
    tokenPrefix: options.tokenPrefix ?? "token",
    css: false,
  });
  return serialized === undefined ? "" : escapeHtml(serialized);
}

function renderNode(
  node: StrataNode,
  document: StrataDocument,
  project: StrataProject,
  options: CompileOptions,
  warnings: CompileWarning[],
): string {
  if (node.kind === "text") return contentText(node, project, options, warnings);
  if (node.kind !== "element" && node.kind !== "unknown")
    warning(
      warnings,
      "UNSUPPORTED_NODE_KIND",
      `Node kind '${node.kind}' is rendered as a neutral element`,
      node.id,
    );
  const tag = safeTag(node, warnings);
  const attributes = attributeEntries(node, project, options, warnings);
  const opening = `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  if (VOID_ELEMENTS.has(tag)) return opening;
  const children = node.children
    .map((childId) => document.nodes[childId])
    .filter((child): child is StrataNode => child !== undefined)
    .map((child) => renderNode(child, document, project, options, warnings))
    .join("");
  return `${opening}${contentText(node, project, options, warnings)}${children}</${tag}>`;
}

export function compileDocument(
  input: StrataProject,
  documentId?: string,
  options: CompileOptions = {},
): CompiledDocument {
  const project = parseProject(input);
  const selectedId = documentId ?? project.activeDocumentId;
  const document = project.documents[selectedId];
  if (!document) throw new Error(`Unknown document '${selectedId}'`);
  const warnings: CompileWarning[] = [];
  const html = document.rootNodeIds
    .map((rootId) => document.nodes[rootId])
    .filter((node): node is StrataNode => node !== undefined)
    .map((node) => renderNode(node, document, project, options, warnings))
    .join("");
  const css = document.rootNodeIds
    .flatMap((rootId) => collectNodes(document, rootId))
    .flatMap((node) => styleCss(node, project, options, warnings))
    .join("\n");
  return { html, css, warnings };
}

function collectNodes(document: StrataDocument, rootId: string): StrataNode[] {
  const output: StrataNode[] = [];
  const visit = (nodeId: string) => {
    const node = document.nodes[nodeId];
    if (!node) return;
    output.push(node);
    for (const childId of node.children) visit(childId);
  };
  visit(rootId);
  return output;
}

export function buildStageDocument(
  project: StrataProject,
  documentId?: string,
  options: StageDocumentOptions = {},
): string {
  const compiled = compileDocument(project, documentId, options);
  return buildStageDocumentFromCompiled(compiled, options);
}

/**
 * Wraps an existing deterministic compilation in the inert Stage shell. Studio callers use this
 * entry point when they also need the compilation warnings, avoiding a second compiler pass.
 */
export function buildStageDocumentFromCompiled(
  compiled: CompiledDocument,
  options: StageShellOptions = {},
): string {
  const title = escapeHtml(options.title ?? "Strata Stage");
  const csp =
    "default-src 'none'; img-src data: blob: http: https:; media-src data: blob: http: https:; font-src data: blob: http: https:; style-src 'unsafe-inline'; connect-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const stageReset = "html,body{margin:0;min-height:100%;}";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${stageReset}${compiled.css}</style></head><body>${compiled.html}</body></html>`;
}
