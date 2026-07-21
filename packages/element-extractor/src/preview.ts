import type { StrataElementBundle } from "@strata/element-bundle";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeStyleBoundary(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function declarationsToCss(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .filter(([property]) => /^(?:--)?[-a-zA-Z0-9]+$/.test(property))
    .map(([property, value]) => `${property}: ${escapeStyleBoundary(value)};`)
    .join("\n");
}

export function buildPreviewDocument(bundle: StrataElementBundle): string {
  const variables = declarationsToCss(bundle.styles.variables);
  const fallback = declarationsToCss(bundle.styles.computedFallback);
  const authorCss = bundle.styles.matchedRules.map((rule) => rule.cssText).join("\n");
  const supportingCss = [...bundle.styles.fontFaces, ...bundle.styles.keyframes].join("\n");
  const rootSelector = `[data-strata-id="${escapeAttribute(bundle.root.id)}"]`;
  const body = bundle.root.contextHtml ?? bundle.root.html;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob: http: https:; media-src data: blob: http: https:; font-src data: blob: http: https:; style-src 'unsafe-inline';"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${escapeAttribute(bundle.source.url)}">
    <style>
      :root {
        color-scheme: light;
        ${variables}
      }
      * { box-sizing: border-box; pointer-events: none !important; }
      html, body { min-height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        padding: 32px;
        overflow: auto;
        background:
          linear-gradient(rgba(67, 74, 96, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(67, 74, 96, 0.08) 1px, transparent 1px),
          #f5f6fa;
        background-size: 20px 20px;
      }
      ${escapeStyleBoundary(supportingCss)}
      ${escapeStyleBoundary(authorCss)}
      ${rootSelector} {
        ${fallback}
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}
