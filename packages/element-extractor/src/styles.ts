import type {
  ExtractionWarning,
  MatchedStyleRule,
  PseudoElementSnapshot,
  StyleCondition,
  StyleSnapshot,
} from "@strata/element-bundle";
import { type AssetCollector, absolutizeCssUrls } from "./assets";

const COMPUTED_FALLBACK_PROPERTIES = [
  "align-items",
  "background-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "box-sizing",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "height",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "text-align",
  "text-decoration",
  "text-transform",
  "transform",
  "width",
] as const;

const PSEUDO_PROPERTIES = [
  "align-items",
  "background",
  "border",
  "border-radius",
  "bottom",
  "box-shadow",
  "color",
  "display",
  "font",
  "height",
  "inset",
  "justify-content",
  "left",
  "opacity",
  "position",
  "right",
  "top",
  "transform",
  "width",
] as const;

interface RuleWithChildren extends CSSRule {
  cssRules: CSSRuleList;
}

interface RuleWithSelector extends CSSRule {
  selectorText: string;
}

function hasChildren(rule: CSSRule): rule is RuleWithChildren {
  return "cssRules" in rule && (rule as Partial<RuleWithChildren>).cssRules !== undefined;
}

function hasSelector(rule: CSSRule): rule is RuleWithSelector {
  return (
    "selectorText" in rule && typeof (rule as Partial<RuleWithSelector>).selectorText === "string"
  );
}

function getCondition(rule: CSSRule): StyleCondition | null {
  const cssText = rule.cssText.trimStart().toLowerCase();
  const record = rule as unknown as Record<string, unknown>;
  const conditionText = typeof record.conditionText === "string" ? record.conditionText : undefined;
  if (cssText.startsWith("@media") && conditionText) return { type: "media", text: conditionText };
  if (cssText.startsWith("@supports") && conditionText) {
    return { type: "supports", text: conditionText };
  }
  if (cssText.startsWith("@container")) {
    return {
      type: "container",
      text: conditionText ?? rule.cssText.slice(0, rule.cssText.indexOf("{")),
    };
  }
  if (cssText.startsWith("@layer")) {
    const name = typeof record.name === "string" ? record.name : "anonymous";
    return { type: "layer", text: name };
  }
  if (cssText.startsWith("@scope")) {
    return { type: "scope", text: rule.cssText.slice(0, rule.cssText.indexOf("{")) };
  }
  return null;
}

function conditionIsActive(condition: StyleCondition, view: Window | null): boolean {
  if (condition.type === "media" && view && typeof view.matchMedia === "function") {
    return view.matchMedia(condition.text).matches;
  }
  if (condition.type === "supports") {
    const css = (view as (Window & { CSS?: typeof CSS }) | null)?.CSS;
    if (css && typeof css.supports === "function") return css.supports(condition.text);
  }
  return true;
}

function selectorMatchesAny(selectorText: string, candidates: Element[]): boolean {
  const elementSelector = selectorText.replace(/::(?:before|after)\b/gi, "");
  return candidates.some((candidate) => candidate.matches(elementSelector));
}

function stylesheetUrl(sheet: CSSStyleSheet, fallbackUrl: string): string {
  if (!sheet.href) return fallbackUrl;
  try {
    return new URL(sheet.href, fallbackUrl).href;
  } catch {
    return fallbackUrl;
  }
}

function styleDeclarationMap(style: CSSStyleDeclaration, properties: readonly string[]) {
  const declarations: Record<string, string> = {};
  for (const property of properties) {
    const value = style.getPropertyValue(property);
    if (value) declarations[property] = value;
  }
  return declarations;
}

function collectVariables(element: Element): Record<string, string> {
  const variables: Record<string, string> = {};
  const view = element.ownerDocument.defaultView;
  if (!view) return variables;

  let current: Element | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    for (let index = 0; index < style.length; index += 1) {
      const property = style.item(index);
      if (property.startsWith("--") && !(property in variables)) {
        const value = style.getPropertyValue(property).trim();
        if (value) variables[property] = value;
      }
    }
    current = current.parentElement;
  }
  return variables;
}

function collectPseudoElements(elementIds: Map<Element, string>): PseudoElementSnapshot[] {
  const snapshots: PseudoElementSnapshot[] = [];
  for (const [element, elementId] of elementIds) {
    const view = element.ownerDocument.defaultView;
    if (!view) continue;
    if (view.navigator.userAgent.toLowerCase().includes("jsdom")) continue;
    for (const pseudo of ["::before", "::after"] as const) {
      try {
        const style = view.getComputedStyle(element, pseudo);
        const content = style.getPropertyValue("content");
        if (!content || content === "none" || content === "normal") continue;
        snapshots.push({
          elementId,
          pseudo,
          content,
          declarations: styleDeclarationMap(style, PSEUDO_PROPERTIES),
        });
      } catch {
        // Some DOM implementations do not expose pseudo-element computed styles.
      }
    }
  }
  return snapshots;
}

export function collectStyleSnapshot(
  element: Element,
  elementIds: Map<Element, string>,
  assets: AssetCollector,
  warnings: ExtractionWarning[],
): StyleSnapshot {
  const document = element.ownerDocument;
  const sourceUrl = document.URL;
  const candidates = [element, ...element.querySelectorAll("*")];
  const matchedRules: MatchedStyleRule[] = [];
  const fontFaces: string[] = [];
  const keyframes: string[] = [];
  const seenSheets = new Set<CSSStyleSheet>();
  const seenRules = new Set<string>();
  const unsupportedSelectors = new Set<string>();

  const visitRules = (rules: CSSRuleList, baseUrl: string, conditions: StyleCondition[]): void => {
    for (const rule of [...rules]) {
      const cssText = rule.cssText.trimStart();
      const lowerCssText = cssText.toLowerCase();

      if (lowerCssText.startsWith("@font-face")) {
        fontFaces.push(absolutizeCssUrls(rule.cssText, baseUrl, assets, "font"));
        continue;
      }
      if (lowerCssText.startsWith("@keyframes") || lowerCssText.startsWith("@-webkit-keyframes")) {
        keyframes.push(rule.cssText);
        continue;
      }
      if (hasSelector(rule)) {
        try {
          if (!selectorMatchesAny(rule.selectorText, candidates)) continue;
        } catch {
          if (!unsupportedSelectors.has(rule.selectorText)) {
            unsupportedSelectors.add(rule.selectorText);
            warnings.push({
              code: "SELECTOR_UNSUPPORTED",
              message: "A stylesheet selector could not be evaluated by this browser",
              severity: "info",
              source: rule.selectorText,
            });
          }
          continue;
        }
        const normalizedCssText = absolutizeCssUrls(rule.cssText, baseUrl, assets);
        const key = `${baseUrl}\n${conditions.map((item) => item.text).join("\n")}\n${normalizedCssText}`;
        if (seenRules.has(key)) continue;
        seenRules.add(key);
        matchedRules.push({
          cssText: normalizedCssText,
          selectorText: rule.selectorText,
          sourceUrl: baseUrl,
          conditions: [...conditions],
        });
        continue;
      }
      if (hasChildren(rule)) {
        const condition = getCondition(rule);
        if (condition && !conditionIsActive(condition, document.defaultView)) continue;
        visitRules(rule.cssRules, baseUrl, condition ? [...conditions, condition] : conditions);
      }
    }
  };

  const visitSheet = (sheet: CSSStyleSheet, inheritedConditions: StyleCondition[] = []): void => {
    if (seenSheets.has(sheet)) return;
    seenSheets.add(sheet);
    const baseUrl = stylesheetUrl(sheet, sourceUrl);
    if (sheet.href) assets.add(sheet.href, sourceUrl, "stylesheet");
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      warnings.push({
        code: "STYLESHEET_BLOCKED",
        message: "The browser blocked access to a stylesheet, usually because it is cross-origin",
        severity: "warning",
        source: baseUrl,
      });
      return;
    }

    for (const rule of [...rules]) {
      const record = rule as unknown as Record<string, unknown>;
      if (rule.cssText.trimStart().toLowerCase().startsWith("@import") && record.styleSheet) {
        const media = record.media as MediaList | undefined;
        const condition = media?.mediaText
          ? { type: "media" as const, text: media.mediaText }
          : null;
        if (!condition || conditionIsActive(condition, document.defaultView)) {
          visitSheet(
            record.styleSheet as CSSStyleSheet,
            condition ? [...inheritedConditions, condition] : inheritedConditions,
          );
        }
      }
    }
    visitRules(rules, baseUrl, inheritedConditions);
  };

  for (const sheet of [...document.styleSheets]) visitSheet(sheet);

  const rootComputedStyle = document.defaultView?.getComputedStyle(element);
  return {
    matchedRules,
    computedFallback: rootComputedStyle
      ? styleDeclarationMap(rootComputedStyle, COMPUTED_FALLBACK_PROPERTIES)
      : {},
    variables: collectVariables(element),
    pseudoElements: collectPseudoElements(elementIds),
    fontFaces: [...new Set(fontFaces)],
    keyframes: [...new Set(keyframes)],
  };
}
