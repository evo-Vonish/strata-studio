import type { StrataElementBundle } from "@strata/element-bundle";
import { buildPreviewDocument, extractElement } from "@strata/element-extractor";
import { getElementAtPoint, getElementBounds } from "@strata/element-picker";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type InspectorTab = "preview" | "bundle";
const WAVE_BAR_IDS = "abcdefghijklmnopqrstuv".split("");

function elementLabel(element: Element | null): string {
  if (!element) return "Nothing selected";
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList]
    .slice(0, 2)
    .map((className) => `.${className}`)
    .join("");
  return `${tag}${id}${classes}`;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DemoPage() {
  return (
    <div className="demo-page">
      <header className="demo-header">
        <a className="demo-brand" href="#atlas" aria-label="Orbit Atlas home">
          <span className="demo-brand-mark">OA</span>
          <span>Orbit Atlas</span>
        </a>
        <nav className="demo-nav" aria-label="Demo navigation">
          <a href="#missions">Missions</a>
          <a href="#signals">Signals</a>
          <button type="button">Open map</button>
        </nav>
      </header>

      <main className="demo-main">
        <section className="demo-copy">
          <p className="demo-kicker">
            <span /> Live constellation index
          </p>
          <h1>Chart the quiet signals between worlds.</h1>
          <p className="demo-lede">
            A living field guide to deep-space missions, faint transmissions, and the people tracing
            their way home.
          </p>
          <div className="demo-actions">
            <button className="demo-primary" type="button">
              Explore signals <span>↗</span>
            </button>
            <button className="demo-secondary" type="button">
              View field notes
            </button>
          </div>
          <div className="demo-proof">
            <div className="demo-avatars" role="img" aria-label="Three contributors">
              <span>AK</span>
              <span>LN</span>
              <span>Q</span>
            </div>
            <p>
              <strong>48 observers</strong>
              <br />
              mapping the night right now
            </p>
          </div>
        </section>

        <article className="signal-card">
          <div className="signal-card-head">
            <div>
              <span className="signal-index">Signal 04 / 12</span>
              <h2>Kepler Echo</h2>
            </div>
            <span className="signal-live">
              <i /> Receiving
            </span>
          </div>

          <div className="orbit-visual" aria-hidden="true">
            <div className="orbit orbit-one">
              <span />
            </div>
            <div className="orbit orbit-two">
              <span />
            </div>
            <div className="orbit orbit-three">
              <span />
            </div>
            <div className="orbit-core">
              <span>452b</span>
            </div>
            <span className="coordinate coordinate-a">19h 44m</span>
            <span className="coordinate coordinate-b">+44° 16′</span>
          </div>

          <div className="signal-wave" aria-hidden="true">
            {WAVE_BAR_IDS.map((id) => (
              <i key={id} style={{ "--wave": (id.charCodeAt(0) % 7) + 2 } as React.CSSProperties} />
            ))}
          </div>

          <footer className="signal-stats">
            <div>
              <span>Distance</span>
              <strong>1,243 ly</strong>
            </div>
            <div>
              <span>Clarity</span>
              <strong>87.4%</strong>
            </div>
            <div>
              <span>Last pulse</span>
              <strong>12 sec</strong>
            </div>
          </footer>
        </article>
      </main>

      <footer className="demo-footer">
        <span>Field log 2026—07</span>
        <span className="demo-scroll">
          Scroll to navigate <i>↓</i>
        </span>
      </footer>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="empty-inspector">
      <div className="empty-orbit" aria-hidden="true">
        <i />
        <i />
        <span />
      </div>
      <p className="eyebrow">Awaiting a specimen</p>
      <h2>
        Pick anything
        <br />
        on the stage.
      </h2>
      <p>
        We’ll preserve its DOM, matching CSS, assets, geometry, and enough ancestry to rebuild it.
      </p>
      <div className="empty-hint">
        <kbd>P</kbd>
        <span>toggle picker</span>
        <kbd>Esc</kbd>
        <span>cancel</span>
      </div>
    </div>
  );
}

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pickMode, setPickMode] = useState(true);
  const [hovered, setHovered] = useState<Element | null>(null);
  const [selected, setSelected] = useState<Element | null>(null);
  const [bundle, setBundle] = useState<StrataElementBundle | null>(null);
  const [tab, setTab] = useState<InspectorTab>("preview");
  const [error, setError] = useState<string | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({ display: "none" });

  const findElement = useCallback((clientX: number, clientY: number): Element | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const demoPage = stage.querySelector(".demo-page");
    if (!demoPage) return null;
    const candidate = getElementAtPoint(clientX, clientY, {
      container: demoPage,
    });
    return candidate;
  }, []);

  const syncOverlay = useCallback(() => {
    const target = pickMode ? hovered : selected;
    if (!target?.isConnected) {
      setOverlayStyle({ display: "none" });
      return;
    }
    const bounds = getElementBounds(target);
    setOverlayStyle({
      display: "block",
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    });
  }, [hovered, pickMode, selected]);

  useEffect(() => {
    syncOverlay();
    window.addEventListener("resize", syncOverlay);
    window.addEventListener("scroll", syncOverlay, true);
    return () => {
      window.removeEventListener("resize", syncOverlay);
      window.removeEventListener("scroll", syncOverlay, true);
    };
  }, [syncOverlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setPickMode((active) => !active);
      }
      if (event.key === "Escape") {
        setPickMode(false);
        setHovered(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pickMode) return;
    setHovered(findElement(event.clientX, event.clientY));
  };

  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!pickMode) return;
    event.preventDefault();
    event.stopPropagation();
    const candidate = findElement(event.clientX, event.clientY);
    if (!candidate) return;
    try {
      const nextBundle = extractElement(candidate);
      setSelected(candidate);
      setHovered(null);
      setBundle(nextBundle);
      setError(null);
      setTab("preview");
      setPickMode(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The element could not be extracted");
    }
  };

  const previewDocument = useMemo(() => (bundle ? buildPreviewDocument(bundle) : ""), [bundle]);

  const downloadBundle = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bundle.id}.strata-element.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="studio-shell">
      <header className="studio-toolbar" data-studio-ui>
        <div className="studio-logo">
          <span>S</span>
          <div>
            <strong>Strata</strong>
            <small>Studio / E0</small>
          </div>
        </div>
        <nav className="layer-rail" aria-label="Product layers">
          <span className="active">
            <i>1</i> Stage
          </span>
          <b>—</b>
          <span>
            <i>2</i> Bundle
          </span>
          <b>—</b>
          <span>
            <i>3</i> Agent
          </span>
        </nav>
        <div className="toolbar-actions">
          <span className="local-state">
            <i /> Local capture
          </span>
          <button
            className={pickMode ? "picker-button active" : "picker-button"}
            type="button"
            onClick={() => setPickMode((active) => !active)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 3 11 6-5 1-2 5L4 3Z" />
            </svg>
            {pickMode ? "Picking…" : "Pick element"}
            <kbd>P</kbd>
          </button>
        </div>
      </header>

      <main className="studio-main">
        <section className="workbench">
          <div className="workbench-bar" data-studio-ui>
            <div>
              <span className="status-dot" /> canvas.local / controlled fixture
            </div>
            <div className="workbench-scale">
              <button type="button">−</button>
              <span>82%</span>
              <button type="button">＋</button>
            </div>
          </div>
          <div
            ref={stageRef}
            className={pickMode ? "stage-canvas is-picking" : "stage-canvas"}
            data-demo-surface
            onPointerMove={onStagePointerMove}
            onPointerLeave={() => setHovered(null)}
            onClickCapture={onStageClick}
          >
            <div className="stage-grid" aria-hidden="true" />
            <div className="browser-viewport">
              <div className="browser-chrome" data-studio-ui>
                <div className="browser-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="browser-address">
                  <span>⌁</span> orbit-atlas.demo
                </div>
                <span className="browser-lock">⌘</span>
              </div>
              <DemoPage />
            </div>
            <div className="stage-caption" data-studio-ui>
              <span>
                {pickMode
                  ? "Move across the page, then click to capture"
                  : "Stage interaction unlocked"}
              </span>
              <span>1440 × 900</span>
            </div>
          </div>
        </section>

        <aside className="inspector" data-studio-ui>
          <div className="inspector-titlebar">
            <div>
              <span>Element Bundle</span>
              <strong>{bundle ? "v0.1" : "Idle"}</strong>
            </div>
            {bundle && (
              <button type="button" onClick={downloadBundle} title="Download bundle">
                ↓
              </button>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}
          {!bundle ? (
            <EmptyInspector />
          ) : (
            <div className="bundle-inspector">
              <div className="selection-summary">
                <div className="selection-icon">&lt;/&gt;</div>
                <div>
                  <span>Captured node</span>
                  <strong>{elementLabel(selected)}</strong>
                </div>
                <span className={`fidelity fidelity-${bundle.fidelity.status}`}>
                  {Math.round(bundle.fidelity.score * 100)}%
                </span>
              </div>
              <code className="selector-readout">{bundle.root.selector}</code>
              <div className="metrics-grid">
                <Metric label="Rules" value={bundle.styles.matchedRules.length} />
                <Metric label="Assets" value={bundle.assets.length} />
                <Metric
                  label="Nodes"
                  value={(bundle.root.html.match(/data-strata-id=/g) ?? []).length}
                />
                <Metric label="Warnings" value={bundle.warnings.length} />
              </div>

              <div className="inspector-tabs" role="tablist">
                <button
                  className={tab === "preview" ? "active" : ""}
                  type="button"
                  onClick={() => setTab("preview")}
                >
                  Preview
                </button>
                <button
                  className={tab === "bundle" ? "active" : ""}
                  type="button"
                  onClick={() => setTab("bundle")}
                >
                  Bundle JSON
                </button>
              </div>

              <div className="inspector-content">
                {tab === "preview" ? (
                  <iframe
                    className="preview-frame"
                    title="Isolated element preview"
                    sandbox=""
                    srcDoc={previewDocument}
                  />
                ) : (
                  <pre className="bundle-json">{JSON.stringify(bundle, null, 2)}</pre>
                )}
              </div>

              {bundle.warnings.length > 0 && (
                <details className="warning-list">
                  <summary>
                    {bundle.warnings.length} extraction note
                    {bundle.warnings.length === 1 ? "" : "s"}
                  </summary>
                  {bundle.warnings.map((warning) => (
                    <p key={`${warning.code}-${warning.message}-${warning.source ?? ""}`}>
                      <code>{warning.code}</code>
                      {warning.message}
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}
        </aside>
      </main>

      <div
        className={pickMode ? "element-overlay is-hover" : "element-overlay is-selected"}
        data-strata-overlay
        style={overlayStyle}
      >
        <span>{elementLabel(pickMode ? hovered : selected)}</span>
      </div>
    </div>
  );
}
