import type { ExtractionWarning } from "@strata/element-bundle";
import { type AssetCollector, absolutizeCssUrls } from "./assets";

const BLOCKED_DESCENDANT_SELECTOR = "script,noscript,iframe,object,embed,base,meta,link,style";
const URL_ATTRIBUTES = new Set(["src", "poster", "background"]);
const REMOVED_ATTRIBUTES = new Set(["srcdoc", "action", "formaction"]);

export interface SanitizedElementClone {
  html: string;
  contextHtml: string;
  elementIds: Map<Element, string>;
}

function elementAssetKind(
  element: Element,
  attributeName: string,
): "image" | "video" | "audio" | "other" {
  const tagName = element.tagName.toLowerCase();
  if (attributeName === "poster" || tagName === "img" || tagName === "picture") return "image";
  if (tagName === "video") return "video";
  if (tagName === "audio") return "audio";
  return "other";
}

function sanitizeInlineStyle(
  element: HTMLElement | SVGElement,
  baseUrl: string,
  assets: AssetCollector,
  warnings: ExtractionWarning[],
): void {
  const declarations = [...element.style];
  for (const property of declarations) {
    const value = element.style.getPropertyValue(property).toLowerCase().replaceAll(/\s+/g, "");
    if (
      value.includes("expression(") ||
      value.includes("javascript:") ||
      property.toLowerCase() === "-moz-binding"
    ) {
      element.style.removeProperty(property);
      warnings.push({
        code: "UNSAFE_INLINE_STYLE_REMOVED",
        message: `Removed an unsafe inline ${property} declaration`,
        severity: "warning",
      });
    }
  }
  element.style.cssText = absolutizeCssUrls(element.style.cssText, baseUrl, assets);
}

function rewriteSrcset(value: string, baseUrl: string, assets: AssetCollector): string | null {
  const candidates: string[] = [];
  for (const candidate of value.split(/,(?=\s*[^,]+(?:\s|$))/)) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const firstWhitespace = trimmed.search(/\s/);
    const url = firstWhitespace === -1 ? trimmed : trimmed.slice(0, firstWhitespace);
    const descriptor = firstWhitespace === -1 ? "" : trimmed.slice(firstWhitespace).trim();
    const resolved = assets.add(url, baseUrl, "image");
    if (resolved.safeUrl) {
      candidates.push(`${resolved.safeUrl}${descriptor ? ` ${descriptor}` : ""}`);
    }
  }
  return candidates.length > 0 ? candidates.join(", ") : null;
}

function synchronizeRuntimeState(source: Element, clone: Element): void {
  if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.value = source.value;
    clone.toggleAttribute("checked", source.checked);
  } else if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
    clone.textContent = source.value;
  } else if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    for (const [index, option] of [...clone.options].entries()) {
      option.toggleAttribute("selected", source.options[index]?.selected ?? false);
    }
  }
}

function sanitizeAttributes(
  source: Element,
  clone: Element,
  baseUrl: string,
  assets: AssetCollector,
  warnings: ExtractionWarning[],
): void {
  synchronizeRuntimeState(source, clone);

  for (const attribute of [...clone.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on")) {
      clone.removeAttribute(attribute.name);
      warnings.push({
        code: "EVENT_HANDLER_REMOVED",
        message: `Removed executable ${attribute.name} attribute`,
        severity: "info",
      });
      continue;
    }
    if (REMOVED_ATTRIBUTES.has(name)) {
      clone.removeAttribute(attribute.name);
      warnings.push({
        code: "ACTIVE_ATTRIBUTE_REMOVED",
        message: `Removed active ${attribute.name} attribute`,
        severity: "info",
      });
      continue;
    }
    if (name === "srcset") {
      const rewritten = rewriteSrcset(attribute.value, baseUrl, assets);
      if (rewritten) clone.setAttribute(attribute.name, rewritten);
      else clone.removeAttribute(attribute.name);
      continue;
    }
    if (URL_ATTRIBUTES.has(name)) {
      const resolved = assets.add(attribute.value, baseUrl, elementAssetKind(source, name));
      if (resolved.safeUrl) clone.setAttribute(attribute.name, resolved.safeUrl);
      else clone.removeAttribute(attribute.name);
      continue;
    }
    if (name === "href" || name === "xlink:href") {
      if (source instanceof HTMLAnchorElement || source instanceof HTMLAreaElement) {
        clone.removeAttribute("target");
        if (/^\s*(?:javascript|vbscript):/i.test(attribute.value)) {
          assets.add(attribute.value, baseUrl, "other");
          clone.removeAttribute(attribute.name);
        }
      } else {
        const resolved = assets.add(attribute.value, baseUrl, "other");
        if (resolved.safeUrl) clone.setAttribute(attribute.name, resolved.safeUrl);
        else clone.removeAttribute(attribute.name);
      }
    }
  }

  if (clone instanceof HTMLElement || clone instanceof SVGElement) {
    sanitizeInlineStyle(clone, baseUrl, assets, warnings);
  }
}

function containsShadowTree(element: Element): boolean {
  if (element.shadowRoot) return true;
  return [...element.querySelectorAll("*")].some((descendant) => descendant.shadowRoot !== null);
}

export function cloneElementForBundle(
  element: Element,
  rootId: string,
  maxContextDepth: number,
  assets: AssetCollector,
  warnings: ExtractionWarning[],
): SanitizedElementClone {
  const sourceElements = [element, ...element.querySelectorAll("*")];
  let rootClone = element.cloneNode(true) as Element;
  const clonedElements = [rootClone, ...rootClone.querySelectorAll("*")];
  const elementIds = new Map<Element, string>();
  const baseUrl = element.ownerDocument.baseURI;

  if (sourceElements.length !== clonedElements.length) {
    throw new Error("Cloned element tree does not match its source tree");
  }

  for (const [index, source] of sourceElements.entries()) {
    const clone = clonedElements[index];
    if (!clone) continue;
    const id = index === 0 ? rootId : `${rootId}-${index}`;
    elementIds.set(source, id);
    clone.setAttribute("data-strata-id", id);
    sanitizeAttributes(source, clone, baseUrl, assets, warnings);
  }

  if (rootClone.matches(BLOCKED_DESCENDANT_SELECTOR)) {
    const placeholder = element.ownerDocument.createElement("div");
    placeholder.setAttribute("data-strata-id", rootId);
    placeholder.setAttribute("data-strata-unsupported-tag", element.tagName.toLowerCase());
    placeholder.textContent = `Unsupported <${element.tagName.toLowerCase()}> element`;
    rootClone = placeholder;
    warnings.push({
      code: "ACTIVE_ROOT_REPLACED",
      message: `Replaced active <${element.tagName.toLowerCase()}> root with an inert placeholder`,
      severity: "warning",
    });
  } else {
    const blockedDescendants = [...rootClone.querySelectorAll(BLOCKED_DESCENDANT_SELECTOR)];
    for (const blocked of blockedDescendants) blocked.remove();
    if (blockedDescendants.length > 0) {
      warnings.push({
        code: "ACTIVE_DESCENDANTS_REMOVED",
        message: `Removed ${blockedDescendants.length} active descendant element(s)`,
        severity: "warning",
      });
    }
  }

  if (containsShadowTree(element)) {
    warnings.push({
      code: "SHADOW_DOM_NOT_CAPTURED",
      message: "Open or closed shadow DOM content is not captured in Element Bundle v0.1",
      severity: "warning",
    });
  }
  if (element.matches("canvas") || element.querySelector("canvas")) {
    warnings.push({
      code: "CANVAS_PIXELS_NOT_CAPTURED",
      message: "Canvas bitmap pixels are not captured yet",
      severity: "warning",
    });
  }

  const html = rootClone.outerHTML;
  let contextRoot = rootClone;
  let sourceAncestor = element.parentElement;
  let depth = 0;
  while (
    sourceAncestor &&
    sourceAncestor !== element.ownerDocument.body &&
    sourceAncestor !== element.ownerDocument.documentElement &&
    depth < maxContextDepth
  ) {
    const ancestorClone = sourceAncestor.cloneNode(false) as Element;
    ancestorClone.setAttribute("data-strata-context", String(depth + 1));
    sanitizeAttributes(sourceAncestor, ancestorClone, baseUrl, assets, warnings);
    ancestorClone.append(contextRoot);
    contextRoot = ancestorClone;
    sourceAncestor = sourceAncestor.parentElement;
    depth += 1;
  }

  if (
    sourceAncestor &&
    sourceAncestor !== element.ownerDocument.body &&
    sourceAncestor !== element.ownerDocument.documentElement
  ) {
    warnings.push({
      code: "CONTEXT_DEPTH_LIMIT_REACHED",
      message: `Stopped ancestor context capture after ${maxContextDepth} levels`,
      severity: "info",
    });
  }

  return { html, contextHtml: contextRoot.outerHTML, elementIds };
}
