import {
  type ExtractionWarning,
  type FidelityReport,
  parseElementBundle,
  STRATA_ELEMENT_BUNDLE_VERSION,
  type StrataElementBundle,
} from "@strata/element-bundle";
import { getElementBounds, getElementSelector } from "@strata/element-picker";
import { AssetCollector } from "./assets";
import { cloneElementForBundle } from "./sanitize";
import { collectStyleSnapshot } from "./styles";

export { buildPreviewDocument } from "./preview";

export interface ExtractElementOptions {
  now?: () => Date;
  idFactory?: () => string;
  maxContextDepth?: number;
}

let fallbackId = 0;

function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  fallbackId += 1;
  return `${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

function createFidelityReport(warnings: ExtractionWarning[]): FidelityReport {
  const errors = warnings.filter((warning) => warning.severity === "error").length;
  const materialWarnings = warnings.filter((warning) => warning.severity === "warning").length;
  const styleBlocked = warnings.some((warning) => warning.code === "STYLESHEET_BLOCKED");
  const activeContentRemoved = warnings.some((warning) =>
    ["ACTIVE_ROOT_REPLACED", "ACTIVE_DESCENDANTS_REMOVED"].includes(warning.code),
  );
  const score = Math.max(0.35, Math.min(0.92, 0.92 - errors * 0.2 - materialWarnings * 0.05));

  return {
    status: errors > 0 ? "unsupported" : "partial",
    score,
    checks: [
      { name: "DOM clone", status: activeContentRemoved ? "warning" : "passed" },
      { name: "Readable CSSOM", status: styleBlocked ? "warning" : "passed" },
      { name: "Schema validation", status: "passed" },
      {
        name: "Visual pixel comparison",
        status: "not-run",
        detail: "Pixel-level verification is planned for the next extractor milestone",
      },
    ],
  };
}

export function extractElement(
  element: Element,
  options: ExtractElementOptions = {},
): StrataElementBundle {
  const document = element.ownerDocument;
  const view = document.defaultView;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;
  const warnings: ExtractionWarning[] = [];
  const assets = new AssetCollector(warnings);
  const bundleId = `bundle-${idFactory()}`;
  const rootId = `element-${idFactory()}`;
  const cloned = cloneElementForBundle(
    element,
    rootId,
    options.maxContextDepth ?? 5,
    assets,
    warnings,
  );
  const styles = collectStyleSnapshot(element, cloned.elementIds, assets, warnings);
  const bounds = getElementBounds(element);

  let selector: string;
  try {
    selector = getElementSelector(element);
  } catch {
    selector = element.tagName.toLowerCase();
    warnings.push({
      code: "SELECTOR_FALLBACK_USED",
      message: "The element is detached, so a tag-name selector was used",
      severity: "warning",
    });
  }

  const bundle: StrataElementBundle = {
    version: STRATA_ELEMENT_BUNDLE_VERSION,
    id: bundleId,
    source: {
      url: document.URL,
      ...(document.title ? { title: document.title } : {}),
      capturedAt: now().toISOString(),
      viewport: {
        width: Math.max(
          1,
          Math.round(view?.innerWidth ?? document.documentElement.clientWidth ?? 1),
        ),
        height: Math.max(
          1,
          Math.round(view?.innerHeight ?? document.documentElement.clientHeight ?? 1),
        ),
        devicePixelRatio: view?.devicePixelRatio ?? 1,
      },
      ...(view?.navigator.userAgent ? { userAgent: view.navigator.userAgent } : {}),
    },
    root: {
      id: rootId,
      selector,
      tagName: element.tagName.toLowerCase(),
      html: cloned.html,
      contextHtml: cloned.contextHtml,
      textContent: element.textContent,
    },
    styles,
    assets: assets.values(),
    geometry: bounds,
    warnings,
    fidelity: createFidelityReport(warnings),
  };

  return parseElementBundle(bundle);
}
