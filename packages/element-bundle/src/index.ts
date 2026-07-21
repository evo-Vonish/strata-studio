import { z } from "zod";

export const STRATA_ELEMENT_BUNDLE_VERSION = "0.1" as const;

const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const stringMapSchema = z.record(z.string(), z.string());

export const viewportSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    devicePixelRatio: finiteNumberSchema.positive(),
  })
  .strict();

export const sourceSnapshotSchema = z
  .object({
    url: z.string().url(),
    title: z.string().optional(),
    capturedAt: z.string().datetime({ offset: true }),
    viewport: viewportSchema,
    userAgent: z.string().optional(),
  })
  .strict();

export const elementRootSchema = z
  .object({
    id: z.string().min(1),
    selector: z.string().min(1),
    tagName: z.string().min(1),
    html: z.string().min(1),
    contextHtml: z.string().min(1).optional(),
    textContent: z.string().nullable().optional(),
  })
  .strict();

export const styleConditionSchema = z
  .object({
    type: z.enum(["media", "supports", "container", "layer", "scope", "unknown"]),
    text: z.string().min(1),
  })
  .strict();

export const matchedStyleRuleSchema = z
  .object({
    cssText: z.string().min(1),
    selectorText: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    conditions: z.array(styleConditionSchema).default([]),
  })
  .strict();

export const pseudoElementSnapshotSchema = z
  .object({
    elementId: z.string().min(1),
    pseudo: z.enum(["::before", "::after"]),
    content: z.string(),
    declarations: stringMapSchema,
  })
  .strict();

export const styleSnapshotSchema = z
  .object({
    matchedRules: z.array(matchedStyleRuleSchema),
    computedFallback: stringMapSchema,
    variables: stringMapSchema,
    pseudoElements: z.array(pseudoElementSnapshotSchema),
    fontFaces: z.array(z.string().min(1)),
    keyframes: z.array(z.string().min(1)),
  })
  .strict();

export const elementAssetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["image", "font", "stylesheet", "video", "audio", "other"]),
    originalUrl: z.string().min(1),
    resolvedUrl: z.string().url(),
    mimeType: z.string().min(1).optional(),
    dataUrl: z.string().min(1).optional(),
    status: z.enum(["external", "inlined", "blocked", "failed"]),
  })
  .strict();

export const elementGeometrySchema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    top: finiteNumberSchema,
    right: finiteNumberSchema,
    bottom: finiteNumberSchema,
    left: finiteNumberSchema,
    width: nonNegativeNumberSchema,
    height: nonNegativeNumberSchema,
  })
  .strict()
  .superRefine((geometry, context) => {
    const tolerance = 0.5;
    if (Math.abs(geometry.right - geometry.left - geometry.width) > tolerance) {
      context.addIssue({
        code: "custom",
        message: "right - left must equal width within 0.5 CSS pixels",
        path: ["width"],
      });
    }
    if (Math.abs(geometry.bottom - geometry.top - geometry.height) > tolerance) {
      context.addIssue({
        code: "custom",
        message: "bottom - top must equal height within 0.5 CSS pixels",
        path: ["height"],
      });
    }
  });

export const extractionWarningSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    source: z.string().optional(),
  })
  .strict();

export const fidelityCheckSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(["passed", "warning", "failed", "not-run"]),
    detail: z.string().optional(),
  })
  .strict();

export const fidelityReportSchema = z
  .object({
    status: z.enum(["exact", "partial", "unsupported"]),
    score: finiteNumberSchema.min(0).max(1),
    checks: z.array(fidelityCheckSchema),
  })
  .strict();

export const strataElementBundleSchema = z
  .object({
    version: z.literal(STRATA_ELEMENT_BUNDLE_VERSION),
    id: z.string().min(1),
    source: sourceSnapshotSchema,
    root: elementRootSchema,
    styles: styleSnapshotSchema,
    assets: z.array(elementAssetSchema),
    geometry: elementGeometrySchema,
    warnings: z.array(extractionWarningSchema),
    fidelity: fidelityReportSchema,
  })
  .strict();

export type Viewport = z.infer<typeof viewportSchema>;
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
export type ElementRoot = z.infer<typeof elementRootSchema>;
export type StyleCondition = z.infer<typeof styleConditionSchema>;
export type MatchedStyleRule = z.infer<typeof matchedStyleRuleSchema>;
export type PseudoElementSnapshot = z.infer<typeof pseudoElementSnapshotSchema>;
export type StyleSnapshot = z.infer<typeof styleSnapshotSchema>;
export type ElementAsset = z.infer<typeof elementAssetSchema>;
export type ElementGeometry = z.infer<typeof elementGeometrySchema>;
export type ExtractionWarning = z.infer<typeof extractionWarningSchema>;
export type FidelityReport = z.infer<typeof fidelityReportSchema>;
export type StrataElementBundle = z.infer<typeof strataElementBundleSchema>;

export function parseElementBundle(input: unknown): StrataElementBundle {
  return strataElementBundleSchema.parse(input);
}

export function safeParseElementBundle(input: unknown) {
  return strataElementBundleSchema.safeParse(input);
}
