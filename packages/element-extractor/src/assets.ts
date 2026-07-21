import type { ElementAsset, ExtractionWarning } from "@strata/element-bundle";

const ALLOWED_RESOURCE_PROTOCOLS = new Set(["http:", "https:", "data:", "blob:"]);

export interface ResolvedAsset {
  safeUrl: string | null;
  asset: ElementAsset | null;
}

function inferAssetKind(url: string): ElementAsset["kind"] {
  const pathname = url.toLowerCase().split(/[?#]/, 1)[0] ?? "";
  if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/.test(pathname)) return "image";
  if (/\.(?:eot|otf|ttf|woff2?)$/.test(pathname)) return "font";
  if (/\.(?:mp4|mpeg|mov|webm)$/.test(pathname)) return "video";
  if (/\.(?:aac|flac|m4a|mp3|ogg|wav)$/.test(pathname)) return "audio";
  if (/\.css$/.test(pathname)) return "stylesheet";
  return "other";
}

export class AssetCollector {
  readonly #assets = new Map<string, ElementAsset>();
  readonly #warnings: ExtractionWarning[];

  constructor(warnings: ExtractionWarning[]) {
    this.#warnings = warnings;
  }

  add(originalUrl: string, baseUrl: string, kind?: ElementAsset["kind"]): ResolvedAsset {
    const trimmedUrl = originalUrl.trim();
    if (!trimmedUrl || trimmedUrl.startsWith("#")) {
      return { safeUrl: trimmedUrl || null, asset: null };
    }

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(trimmedUrl, baseUrl);
    } catch {
      this.#warnings.push({
        code: "ASSET_URL_INVALID",
        message: `Could not resolve resource URL: ${trimmedUrl}`,
        severity: "warning",
        source: trimmedUrl,
      });
      return { safeUrl: null, asset: null };
    }

    const isAllowed = ALLOWED_RESOURCE_PROTOCOLS.has(resolvedUrl.protocol);
    const key = resolvedUrl.href;
    const existing = this.#assets.get(key);
    if (existing) {
      return { safeUrl: isAllowed ? key : null, asset: existing };
    }

    const status: ElementAsset["status"] = isAllowed
      ? resolvedUrl.protocol === "data:"
        ? "inlined"
        : "external"
      : "blocked";
    const asset: ElementAsset = {
      id: `asset-${this.#assets.size + 1}`,
      kind: kind ?? inferAssetKind(key),
      originalUrl: trimmedUrl,
      resolvedUrl: key,
      status,
      ...(resolvedUrl.protocol === "data:" ? { dataUrl: key } : {}),
    };
    this.#assets.set(key, asset);

    if (!isAllowed) {
      this.#warnings.push({
        code: "ASSET_PROTOCOL_BLOCKED",
        message: `Blocked a resource using the ${resolvedUrl.protocol} protocol`,
        severity: "warning",
        source: trimmedUrl,
      });
    }

    return { safeUrl: isAllowed ? key : null, asset };
  }

  values(): ElementAsset[] {
    return [...this.#assets.values()];
  }
}

export function absolutizeCssUrls(
  cssText: string,
  baseUrl: string,
  assets: AssetCollector,
  kind?: ElementAsset["kind"],
): string {
  return cssText.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (_match, _quote, rawUrl: string) => {
    const resolved = assets.add(rawUrl, baseUrl, kind);
    if (resolved.safeUrl === null) return 'url("")';
    const escaped = resolved.safeUrl.replaceAll('"', "%22");
    return `url("${escaped}")`;
  });
}
