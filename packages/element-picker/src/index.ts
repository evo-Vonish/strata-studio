export interface ElementBounds {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface ElementPickerOptions {
  root?: Document | ShadowRoot;
  container?: Element;
  ignore?: (candidate: Element) => boolean;
  allowDocumentRoots?: boolean;
}

const OVERLAY_ATTRIBUTE = "data-strata-overlay";

function getComposedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function isInsideComposedTree(element: Element, ancestor: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current === ancestor) return true;
    current = getComposedParent(current);
  }
  return false;
}

function belongsToOverlay(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute(OVERLAY_ATTRIBUTE)) return true;
    current = getComposedParent(current);
  }
  return false;
}

export function isElementPickable(
  element: Element,
  options: Omit<ElementPickerOptions, "root"> = {},
): boolean {
  if (
    !options.allowDocumentRoots &&
    (element === element.ownerDocument.documentElement || element === element.ownerDocument.body)
  ) {
    return false;
  }
  if (belongsToOverlay(element)) return false;
  if (options.container && !isInsideComposedTree(element, options.container)) return false;
  if (options.ignore?.(element)) return false;

  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;

  const view = element.ownerDocument.defaultView;
  if (view) {
    const style = view.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }
  }

  return true;
}

function rootElementsFromPoint(root: Document | ShadowRoot, x: number, y: number): Element[] {
  if (typeof root.elementsFromPoint !== "function") return [];
  return root.elementsFromPoint(x, y);
}

function collectDeepCandidates(
  element: Element,
  x: number,
  y: number,
  output: Element[],
  seen: Set<Element>,
): void {
  if (element instanceof HTMLIFrameElement) {
    try {
      const frameDocument = element.contentDocument;
      if (frameDocument) {
        const frameBounds = element.getBoundingClientRect();
        collectCandidates(frameDocument, x - frameBounds.left, y - frameBounds.top, output, seen);
      }
    } catch {
      // A cross-origin iframe is an opaque selectable boundary.
    }
  }

  if (element.shadowRoot) {
    collectCandidates(element.shadowRoot, x, y, output, seen);
  }

  if (!seen.has(element)) {
    seen.add(element);
    output.push(element);
  }
}

function collectCandidates(
  root: Document | ShadowRoot,
  x: number,
  y: number,
  output: Element[],
  seen: Set<Element>,
): void {
  for (const element of rootElementsFromPoint(root, x, y)) {
    collectDeepCandidates(element, x, y, output, seen);
  }
}

export function getElementsAtPoint(
  clientX: number,
  clientY: number,
  options: ElementPickerOptions = {},
): Element[] {
  const root = options.root ?? document;
  const candidates: Element[] = [];
  collectCandidates(root, clientX, clientY, candidates, new Set());
  return candidates.filter((candidate) => isElementPickable(candidate, options));
}

export function getElementAtPoint(
  clientX: number,
  clientY: number,
  options: ElementPickerOptions = {},
): Element | null {
  return getElementsAtPoint(clientX, clientY, options)[0] ?? null;
}

export function getElementBounds(element: Element): ElementBounds {
  const initial = element.getBoundingClientRect();
  let left = initial.left;
  let top = initial.top;
  let width = initial.width;
  let height = initial.height;
  let currentView: Window | null = element.ownerDocument.defaultView;

  while (currentView?.frameElement) {
    try {
      const frame = currentView.frameElement as HTMLElement;
      const frameBounds = frame.getBoundingClientRect();
      const scaleX = frame.offsetWidth > 0 ? frameBounds.width / frame.offsetWidth : 1;
      const scaleY = frame.offsetHeight > 0 ? frameBounds.height / frame.offsetHeight : 1;
      left = frameBounds.left + frame.clientLeft * scaleX + left * scaleX;
      top = frameBounds.top + frame.clientTop * scaleY + top * scaleY;
      width *= scaleX;
      height *= scaleY;
      currentView = currentView.parent;
    } catch {
      break;
    }
  }

  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
  };
}

function escapeCss(value: string): string {
  const css = globalThis.CSS;
  if (css && typeof css.escape === "function") return css.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function queryCount(root: Document | ShadowRoot, selector: string): number {
  try {
    return root.querySelectorAll(selector).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function localSelector(element: Element, root: Document | ShadowRoot): string {
  const strataId = element.getAttribute("data-strata-id");
  if (strataId) return `[data-strata-id="${escapeCss(strataId)}"]`;

  if (element.id) {
    const selector = `#${escapeCss(element.id)}`;
    if (queryCount(root, selector) === 1) return selector;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    const classes = [...current.classList]
      .filter((className) => !className.startsWith("strata-"))
      .slice(0, 2)
      .map((className) => `.${escapeCss(className)}`)
      .join("");
    const classSelector = `${tag}${classes}`;
    if (classes && queryCount(root, classSelector) === 1) {
      segments.unshift(classSelector);
      return segments.join(" > ");
    }

    const parentElement: Element | null = current.parentElement;
    if (!parentElement) {
      segments.unshift(tag);
      break;
    }
    const currentTagName = current.tagName;
    const sameTagSiblings = [...parentElement.children].filter(
      (sibling) => sibling.tagName === currentTagName,
    );
    const position = sameTagSiblings.indexOf(current) + 1;
    segments.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${position})` : tag);
    current = parentElement;
  }
  return segments.join(" > ");
}

export function getElementSelector(element: Element): string {
  const root = element.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot)) {
    throw new Error("Element is not attached to a selectable document or shadow root");
  }

  const selector = localSelector(element, root);
  if (root instanceof ShadowRoot) {
    return `${getElementSelector(root.host)} >>> ${selector}`;
  }

  const frame = element.ownerDocument.defaultView?.frameElement;
  if (frame) {
    return `${getElementSelector(frame)} >>iframe>> ${selector}`;
  }
  return selector;
}

export function getPickableParent(
  element: Element,
  options: Omit<ElementPickerOptions, "root"> = {},
): Element | null {
  let current = getComposedParent(element);
  while (current) {
    if (isElementPickable(current, options)) return current;
    current = getComposedParent(current);
  }
  return null;
}
