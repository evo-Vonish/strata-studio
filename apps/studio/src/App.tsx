"use client";

import type { StrataElementBundle } from "@strata/element-bundle";
import { buildPreviewDocument, extractElement } from "@strata/element-extractor";
import { getElementAtPoint, getElementBounds } from "@strata/element-picker";
import {
  Activity,
  Bot,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Component as ComponentIcon,
  Download,
  Eye,
  FileCode2,
  FileJson2,
  FolderTree,
  Globe2,
  Hand,
  Image as ImageIcon,
  Layers3,
  Library,
  type LucideIcon,
  Maximize2,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  PanelBottomClose,
  PanelLeftClose,
  PanelRightClose,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal,
  Type,
  Undo2,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type WorkspaceMode = "stage" | "blueprint" | "agent";
type ActivityTool = "hierarchy" | "blocks" | "assets" | "search";
type InspectorTab = "design" | "content" | "interactions" | "bundle";
type BottomTab = "operations" | "console" | "problems";
type DeviceMode = "desktop" | "tablet" | "mobile";
type ResizeTarget = "left" | "right" | "bottom";

interface ElementProperties {
  text: string;
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  radius: number;
  fontSize: number;
  fontWeight: string;
  background: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: string;
  opacity: number;
}

interface StyleChange {
  property: string;
  before: string;
  after: string;
}

type HistoryEntry =
  | {
      id: number;
      kind: "style";
      element: HTMLElement | SVGElement;
      changes: StyleChange[];
      label: string;
    }
  | {
      id: number;
      kind: "text";
      element: Element;
      before: string;
      after: string;
      label: string;
    };

interface OperationItem {
  id: number;
  label: string;
  value: string;
  time: string;
  tone: "edit" | "system" | "agent";
}

interface LayerNode {
  label: string;
  detail: string;
  selector: string;
  depth: number;
  icon: LucideIcon;
  expanded?: boolean;
}

const WAVE_BAR_IDS = "abcdefghijklmnopqrstuv".split("");
const DEFAULT_PROPERTIES: ElementProperties = {
  text: "",
  width: 0,
  height: 0,
  paddingX: 0,
  paddingY: 0,
  radius: 0,
  fontSize: 14,
  fontWeight: "400",
  background: "#000000",
  color: "#ffffff",
  borderColor: "#000000",
  borderWidth: 0,
  borderStyle: "none",
  opacity: 100,
};

const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1080,
  tablet: 768,
  mobile: 390,
};

const DEVICE_HEIGHTS: Record<DeviceMode, number> = {
  desktop: 690,
  tablet: 860,
  mobile: 844,
};

const LAYER_NODES: LayerNode[] = [
  {
    label: "Orbit Atlas",
    detail: "Page",
    selector: ".demo-page",
    depth: 0,
    icon: Globe2,
    expanded: true,
  },
  {
    label: "Header",
    detail: "header",
    selector: ".demo-header",
    depth: 1,
    icon: Box,
    expanded: true,
  },
  { label: "Brand", detail: "a", selector: ".demo-brand", depth: 2, icon: ComponentIcon },
  { label: "Navigation", detail: "nav", selector: ".demo-nav", depth: 2, icon: Layers3 },
  { label: "Main", detail: "main", selector: ".demo-main", depth: 1, icon: Box, expanded: true },
  {
    label: "Hero copy",
    detail: "section",
    selector: ".demo-copy",
    depth: 2,
    icon: Type,
    expanded: true,
  },
  { label: "Heading", detail: "h1", selector: ".demo-copy h1", depth: 3, icon: Type },
  {
    label: "Actions",
    detail: "div",
    selector: ".demo-actions",
    depth: 3,
    icon: Layers3,
    expanded: true,
  },
  {
    label: "Explore signals",
    detail: "button",
    selector: ".demo-primary",
    depth: 4,
    icon: ComponentIcon,
  },
  {
    label: "Signal card",
    detail: "article",
    selector: ".signal-card",
    depth: 2,
    icon: ComponentIcon,
    expanded: true,
  },
  { label: "Orbit visual", detail: "div", selector: ".orbit-visual", depth: 3, icon: Activity },
  { label: "Stats", detail: "footer", selector: ".signal-stats", depth: 3, icon: Layers3 },
  { label: "Footer", detail: "footer", selector: ".demo-footer", depth: 1, icon: Box },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function numeric(value: string | null | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function colorToHex(value: string): string {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  const match = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) return "#000000";
  return `#${[match[1], match[2], match[3]]
    .map((channel) => clamp(Number(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function getEditableTextNode(element: Element): Text | null {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim()) return node as Text;
    node = walker.nextNode();
  }
  return null;
}

function getElementText(element: Element): string {
  return getEditableTextNode(element)?.textContent?.trim() ?? "";
}

function setElementText(element: Element, value: string): void {
  const node = getEditableTextNode(element);
  if (node) {
    const leading = node.textContent?.match(/^\s*/)?.[0] ?? "";
    const trailing = node.textContent?.match(/\s*$/)?.[0] ?? "";
    node.textContent = `${leading}${value}${trailing || " "}`;
    return;
  }
  element.textContent = value;
}

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

function readElementProperties(element: Element): ElementProperties {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  if (!style)
    return {
      ...DEFAULT_PROPERTIES,
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  return {
    text: getElementText(element),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    paddingX: Math.round((numeric(style.paddingLeft) + numeric(style.paddingRight)) / 2),
    paddingY: Math.round((numeric(style.paddingTop) + numeric(style.paddingBottom)) / 2),
    radius: Math.round(numeric(style.borderTopLeftRadius)),
    fontSize: Math.round(numeric(style.fontSize, 14)),
    fontWeight: style.fontWeight || "400",
    background: colorToHex(style.backgroundColor),
    color: colorToHex(style.color),
    borderColor: colorToHex(style.borderTopColor),
    borderWidth: Math.round(numeric(style.borderTopWidth)),
    borderStyle: style.borderTopStyle || "none",
    opacity: Math.round(numeric(style.opacity, 1) * 100),
  };
}

function canStyle(element: Element | null): element is HTMLElement | SVGElement {
  return Boolean(element && (element instanceof HTMLElement || element instanceof SVGElement));
}

function timeLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function IconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`icon-button${active ? " active" : ""}`}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={1.8} />
    </button>
  );
}

function NumberField({
  label,
  value,
  unit = "px",
  min = 0,
  max = 2000,
  onDraft,
  onCommit,
}: {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  onDraft: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="property-row">
      <span>{label}</span>
      <span className="unit-input">
        <input
          type="number"
          min={min}
          max={max}
          value={Math.round(value * 10) / 10}
          onChange={(event) => onDraft(clamp(numeric(event.currentTarget.value), min, max))}
          onBlur={(event) => onCommit(clamp(numeric(event.currentTarget.value), min, max))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function PanelSection({
  title,
  children,
  badge,
}: {
  title: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <details className="property-section" open>
      <summary>
        <span>
          <ChevronRight size={13} /> {title}
        </span>
        {badge && <em>{badge}</em>}
      </summary>
      <div className="property-section-body">{children}</div>
    </details>
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
              <i key={id} style={{ "--wave": (id.charCodeAt(0) % 7) + 2 } as CSSProperties} />
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

function NavigatorPanel({
  tool,
  selected,
  onSelect,
}: {
  tool: ActivityTool;
  selected: Element | null;
  onSelect: (selector: string) => void;
}) {
  const title = {
    hierarchy: "Hierarchy",
    blocks: "Block Library",
    assets: "Assets",
    search: "Search",
  }[tool];

  return (
    <aside className="navigator-panel" data-studio-ui>
      <div className="panel-heading">
        <span>{title}</span>
        <div>
          <IconButton icon={Plus} label="Add" />
          <IconButton icon={MoreHorizontal} label="More actions" />
        </div>
      </div>

      {tool === "hierarchy" && (
        <>
          <div className="navigator-search">
            <Search size={13} />
            <input aria-label="Filter hierarchy" placeholder="Filter scene…" />
          </div>
          <div className="panel-subheading">
            <span>Orbit Atlas / index</span>
            <small>13</small>
          </div>
          <div className="layer-tree" role="tree" aria-label="Page hierarchy">
            {LAYER_NODES.map((node) => {
              const active = Boolean(selected?.matches(node.selector));
              const Icon = node.icon;
              return (
                <button
                  key={node.selector}
                  className={`layer-row${active ? " active" : ""}`}
                  type="button"
                  role="treeitem"
                  aria-selected={active}
                  style={{ "--depth": node.depth } as CSSProperties}
                  onClick={() => onSelect(node.selector)}
                >
                  <span className="layer-expander">
                    {node.expanded ? (
                      <ChevronDown size={12} />
                    ) : node.depth < 3 ? (
                      <ChevronRight size={12} />
                    ) : null}
                  </span>
                  <Icon size={13} strokeWidth={1.65} />
                  <span>{node.label}</span>
                  <em>{node.detail}</em>
                </button>
              );
            })}
          </div>
          <div className="navigator-footer-card">
            <span className="tiny-status" />
            <div>
              <strong>DOM synchronized</strong>
              <small>13 nodes · live stage</small>
            </div>
          </div>
        </>
      )}

      {tool === "blocks" && (
        <div className="block-library">
          <div className="navigator-search">
            <Search size={13} />
            <input aria-label="Search blocks" placeholder="Search blocks…" />
          </div>
          <div className="block-categories">
            <button className="active" type="button">
              <i className="event" /> Events
            </button>
            <button type="button">
              <i className="layout" /> Layout
            </button>
            <button type="button">
              <i className="style" /> Style
            </button>
            <button type="button">
              <i className="logic" /> Logic
            </button>
            <button type="button">
              <i className="data" /> Data
            </button>
          </div>
          <div className="library-blocks">
            <button className="mini-block event" type="button">
              when <b>clicked</b>
            </button>
            <button className="mini-block event" type="button">
              when <b>visible</b>
            </button>
            <button className="mini-block event" type="button">
              on <b>page ready</b>
            </button>
            <button className="mini-block logic" type="button">
              if <b>condition</b> then
            </button>
            <button className="mini-block data" type="button">
              set <b>variable</b> to
            </button>
          </div>
          <p className="library-tip">
            Drag blocks into the blueprint canvas. Human and Agent edits compile to the same
            operation graph.
          </p>
        </div>
      )}

      {tool === "assets" && (
        <div className="asset-browser">
          <div className="navigator-search">
            <Search size={13} />
            <input aria-label="Search assets" placeholder="Search assets…" />
          </div>
          <div className="asset-grid">
            <button type="button">
              <span className="asset-swatch violet" />
              <strong>Deep space</strong>
              <small>#231B42</small>
            </button>
            <button type="button">
              <span className="asset-swatch pink" />
              <strong>Signal</strong>
              <small>#EE4D9B</small>
            </button>
            <button type="button">
              <span className="asset-swatch acid" />
              <strong>Live</strong>
              <small>#A9FA66</small>
            </button>
            <button type="button">
              <span className="asset-font">Aa</span>
              <strong>Manrope</strong>
              <small>Variable</small>
            </button>
          </div>
          <div className="asset-drop">
            <ImageIcon size={20} />
            <span>Drop images or fonts</span>
            <small>SVG, PNG, WOFF2</small>
          </div>
        </div>
      )}

      {tool === "search" && (
        <div className="global-search">
          <div className="global-search-input">
            <Search size={14} />
            <input aria-label="Search project" placeholder="Search nodes, styles, blocks…" />
          </div>
          <label>
            <input type="checkbox" defaultChecked /> Match whole blueprint
          </label>
          <div className="search-empty">
            <Search size={28} />
            <strong>Search across every layer</strong>
            <span>DOM, Blueprint operations and Agent history share stable node IDs.</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function BlueprintWorkspace() {
  return (
    <div className="blueprint-workspace">
      <div className="blueprint-toolbar">
        <div>
          <Workflow size={14} />
          <span>ExploreButton / Interaction Graph</span>
        </div>
        <div>
          <button type="button">Compile</button>
          <IconButton icon={Maximize2} label="Frame all" />
        </div>
      </div>
      <div className="blueprint-canvas">
        <div className="blueprint-guide horizontal" />
        <div className="blueprint-guide vertical" />
        <div className="blueprint-stack">
          <div className="logic-block event-block">
            <span>
              <MousePointer2 size={14} /> when <strong>ExploreButton</strong> clicked
            </span>
            <i />
          </div>
          <div className="logic-connector" />
          <div className="logic-block style-block">
            <span>
              <Sparkles size={14} /> animate <strong>opacity</strong>
            </span>
            <div className="block-value">
              from <b>100%</b> to <b>72%</b>
            </div>
            <i />
          </div>
          <div className="logic-connector" />
          <div className="logic-block data-block">
            <span>
              <Braces size={14} /> set <strong>selectedSignal</strong>
            </span>
            <div className="block-value">
              value <b>&quot;kepler-452b&quot;</b>
            </div>
            <i />
          </div>
          <div className="logic-connector" />
          <div className="logic-block action-block">
            <span>
              <Globe2 size={14} /> navigate to <strong>/signals</strong>
            </span>
            <i />
          </div>
        </div>
        <div className="blueprint-minimap">
          <div>
            <i />
            <i />
            <i />
            <i />
          </div>
          <span>Graph 1:1</span>
        </div>
      </div>
    </div>
  );
}

function AgentWorkspace({ onApply }: { onApply: () => void }) {
  return (
    <div className="agent-workspace">
      <section className="agent-conversation">
        <div className="agent-header">
          <div>
            <span className="agent-avatar">
              <Sparkles size={15} />
            </span>
            <span>
              <strong>Strata Agent</strong>
              <small>Blueprint-aware design partner</small>
            </span>
          </div>
          <button type="button">
            <RefreshCw size={13} /> New thread
          </button>
        </div>
        <div className="agent-thread">
          <div className="agent-message user-message">
            Make the primary action feel more confident without changing the visual language.
          </div>
          <div className="agent-message assistant-message">
            <span className="agent-avatar">
              <Sparkles size={14} />
            </span>
            <div>
              <p>
                I’ll preserve the rounded geometry and deep-space palette. I propose a slightly
                wider action, stronger weight, and a restrained hover lift.
              </p>
              <div className="agent-change-card">
                <span>3 structured operations</span>
                <code>ExploreButton · Base + Hover</code>
              </div>
            </div>
          </div>
        </div>
        <div className="agent-composer">
          <textarea
            aria-label="Ask Strata Agent"
            placeholder="Describe a change, or reference the selected element…"
          />
          <div>
            <span>
              <kbd>⌘</kbd>
              <kbd>↵</kbd> send
            </span>
            <button type="button">
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      </section>
      <aside className="agent-plan">
        <div className="panel-heading">
          <span>Proposed Changes</span>
          <strong>3</strong>
        </div>
        <div className="plan-target">
          <ComponentIcon size={15} />
          <div>
            <strong>ExploreButton</strong>
            <code>node_hero_primary</code>
          </div>
          <Check size={14} />
        </div>
        <div className="operation-preview">
          <span>SetStyle</span>
          <code>width → 156px</code>
        </div>
        <div className="operation-preview">
          <span>SetStyle</span>
          <code>font-weight → 600</code>
        </div>
        <div className="operation-preview">
          <span>SetStateStyle</span>
          <code>:hover translateY → -2px</code>
        </div>
        <div className="agent-plan-footer">
          <button type="button">Reject</button>
          <button className="primary" type="button" onClick={onApply}>
            <Play size={13} /> Apply plan
          </button>
        </div>
      </aside>
    </div>
  );
}

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyCursorRef = useRef(0);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("stage");
  const [activeTool, setActiveTool] = useState<ActivityTool>("hierarchy");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [bottomTab, setBottomTab] = useState<BottomTab>("operations");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [zoom, setZoom] = useState(74);
  const [selectMode, setSelectMode] = useState(true);
  const [hovered, setHovered] = useState<Element | null>(null);
  const [selected, setSelected] = useState<Element | null>(null);
  const [bundle, setBundle] = useState<StrataElementBundle | null>(null);
  const [properties, setProperties] = useState<ElementProperties>(DEFAULT_PROPERTIES);
  const [error, setError] = useState<string | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties>({ display: "none" });
  const [revision, setRevision] = useState(0);
  const [leftWidth, setLeftWidth] = useState(248);
  const [rightWidth, setRightWidth] = useState(334);
  const [bottomHeight, setBottomHeight] = useState(170);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [historyCursor, setHistoryCursor] = useState(0);
  const [historyLength, setHistoryLength] = useState(0);
  const [operations, setOperations] = useState<OperationItem[]>([
    {
      id: 0,
      label: "Stage renderer connected",
      value: "DOM and Blueprint bridge ready",
      time: "--:--:--",
      tone: "system",
    },
  ]);

  const syncProperties = useCallback((element: Element | null) => {
    if (element) setProperties(readElementProperties(element));
  }, []);

  const addOperation = useCallback(
    (label: string, value: string, tone: OperationItem["tone"] = "edit") => {
      const id = makeId();
      setOperations((current) =>
        [{ id, label, value, time: timeLabel(), tone }, ...current].slice(0, 80),
      );
    },
    [],
  );

  const pushHistory = useCallback((entry: HistoryEntry) => {
    const next = historyRef.current.slice(0, historyCursorRef.current);
    next.push(entry);
    historyRef.current = next;
    historyCursorRef.current = next.length;
    setHistoryCursor(next.length);
    setHistoryLength(next.length);
  }, []);

  const captureElement = useCallback(
    (element: Element, options: { quiet?: boolean } = {}) => {
      try {
        const nextBundle = extractElement(element);
        setSelected(element);
        setHovered(null);
        setBundle(nextBundle);
        setError(null);
        syncProperties(element);
        setRevision((value) => value + 1);
        if (!options.quiet) addOperation("SelectNode", elementLabel(element));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The element could not be selected");
      }
    },
    [addOperation, syncProperties],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const initial = stageRef.current?.querySelector(".demo-primary");
      if (initial) captureElement(initial, { quiet: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [captureElement]);

  const findElement = useCallback((clientX: number, clientY: number): Element | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const demoPage = stage.querySelector(".demo-page");
    if (!demoPage) return null;
    return getElementAtPoint(clientX, clientY, { container: demoPage });
  }, []);

  const syncOverlay = useCallback(() => {
    const target = selectMode && hovered ? hovered : selected;
    if (!target?.isConnected || workspaceMode !== "stage") {
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
      "--overlay-revision": revision,
    } as CSSProperties);
  }, [hovered, revision, selectMode, selected, workspaceMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncOverlay);
    window.addEventListener("resize", syncOverlay);
    window.addEventListener("scroll", syncOverlay, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncOverlay);
      window.removeEventListener("scroll", syncOverlay, true);
    };
  }, [syncOverlay]);

  useEffect(() => {
    if (!paletteOpen) return;
    const frame = window.requestAnimationFrame(() => paletteInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [paletteOpen]);

  const undo = useCallback(() => {
    if (historyCursorRef.current <= 0) return;
    const entry = historyRef.current[historyCursorRef.current - 1];
    if (!entry) return;
    if (entry.kind === "style") {
      for (const change of entry.changes) {
        if (change.before) entry.element.style.setProperty(change.property, change.before);
        else entry.element.style.removeProperty(change.property);
      }
    } else {
      setElementText(entry.element, entry.before);
    }
    historyCursorRef.current -= 1;
    setHistoryCursor(historyCursorRef.current);
    syncProperties(selected);
    setRevision((value) => value + 1);
    addOperation("Undo", entry.label, "system");
  }, [addOperation, selected, syncProperties]);

  const redo = useCallback(() => {
    if (historyCursorRef.current >= historyRef.current.length) return;
    const entry = historyRef.current[historyCursorRef.current];
    if (!entry) return;
    if (entry.kind === "style") {
      for (const change of entry.changes) {
        if (change.after) entry.element.style.setProperty(change.property, change.after);
        else entry.element.style.removeProperty(change.property);
      }
    } else {
      setElementText(entry.element, entry.after);
    }
    historyCursorRef.current += 1;
    setHistoryCursor(historyCursorRef.current);
    syncProperties(selected);
    setRevision((value) => value + 1);
    addOperation("Redo", entry.label, "system");
  }, [addOperation, selected, syncProperties]);

  const commitStyles = useCallback(
    (styles: Array<[string, string]>, label: string) => {
      if (!canStyle(selected)) return;
      const changes = styles.map(([property, after]) => ({
        property,
        before: selected.style.getPropertyValue(property),
        after,
      }));
      for (const change of changes) {
        if (change.after) selected.style.setProperty(change.property, change.after);
        else selected.style.removeProperty(change.property);
      }
      pushHistory({ id: makeId(), kind: "style", element: selected, changes, label });
      addOperation(
        "SetStyle",
        `${label} · ${styles.map(([key, value]) => `${key}: ${value}`).join(", ")}`,
      );
      syncProperties(selected);
      setRevision((value) => value + 1);
    },
    [addOperation, pushHistory, selected, syncProperties],
  );

  const commitText = useCallback(
    (value: string) => {
      if (!selected) return;
      const before = getElementText(selected);
      if (before === value.trim()) return;
      setElementText(selected, value.trim());
      pushHistory({
        id: makeId(),
        kind: "text",
        element: selected,
        before,
        after: value.trim(),
        label: "Text content",
      });
      addOperation("SetText", `“${value.trim()}”`);
      syncProperties(selected);
      setRevision((current) => current + 1);
    },
    [addOperation, pushHistory, selected, syncProperties],
  );

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectMode) return;
    setHovered(findElement(event.clientX, event.clientY));
  };

  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!selectMode) return;
    const candidate = findElement(event.clientX, event.clientY);
    if (!candidate) return;
    event.preventDefault();
    event.stopPropagation();
    captureElement(candidate);
  };

  const selectFromTree = (selector: string) => {
    const element = stageRef.current?.querySelector(selector);
    if (!element) return;
    captureElement(element);
    setWorkspaceMode("stage");
  };

  const selectWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === "blueprint") setActiveTool("blocks");
    if (mode === "stage" && activeTool === "blocks") setActiveTool("hierarchy");
  };

  const resetLayout = useCallback(() => {
    setLeftWidth(248);
    setRightWidth(334);
    setBottomHeight(170);
    setLeftOpen(true);
    setRightOpen(true);
    setBottomOpen(true);
    addOperation("Workspace", "Panel layout reset", "system");
  }, [addOperation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (modifier && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setLeftOpen((value) => !value);
      } else if (modifier && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setBottomOpen((value) => !value);
      } else if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "p" && !modifier && !event.altKey) {
        setSelectMode((value) => !value);
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
        setHovered(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const startResize = (target: ResizeTarget, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = leftWidth;
    const initialRight = rightWidth;
    const initialBottom = bottomHeight;
    document.body.classList.add(target === "bottom" ? "is-resizing-row" : "is-resizing-column");
    const onMove = (pointerEvent: PointerEvent) => {
      if (target === "left")
        setLeftWidth(clamp(initialLeft + pointerEvent.clientX - startX, 196, 360));
      if (target === "right")
        setRightWidth(clamp(initialRight + startX - pointerEvent.clientX, 286, 480));
      if (target === "bottom")
        setBottomHeight(clamp(initialBottom + startY - pointerEvent.clientY, 104, 310));
    };
    const onUp = () => {
      document.body.classList.remove("is-resizing-row", "is-resizing-column");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const previewDocument = useMemo(() => (bundle ? buildPreviewDocument(bundle) : ""), [bundle]);
  const overlayTarget = selectMode && hovered ? hovered : selected;
  const overlayIsHover = Boolean(selectMode && hovered && hovered !== selected);
  const canUndo = historyCursor > 0;
  const canRedo = historyCursor < historyLength;

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

  const applyAgentPlan = () => {
    const target = stageRef.current?.querySelector(".demo-primary");
    if (!target) return;
    captureElement(target, { quiet: true });
    window.requestAnimationFrame(() => {
      if (canStyle(target)) {
        const changes: StyleChange[] = (
          [
            ["width", target.style.getPropertyValue("width"), "156px"],
            ["font-weight", target.style.getPropertyValue("font-weight"), "600"],
          ] as const
        ).map(([property, before, after]) => ({ property, before, after }));
        for (const change of changes) target.style.setProperty(change.property, change.after);
        pushHistory({ id: makeId(), kind: "style", element: target, changes, label: "Agent plan" });
        addOperation("Agent applied", "2 base styles + 1 hover state queued", "agent");
        syncProperties(target);
        setRevision((value) => value + 1);
        setWorkspaceMode("stage");
      }
    });
  };

  const paletteCommands = [
    {
      label: "Toggle element selector",
      hint: "P",
      icon: MousePointer2,
      action: () => setSelectMode((value) => !value),
    },
    {
      label: "Open Stage workspace",
      hint: "1",
      icon: Monitor,
      action: () => selectWorkspaceMode("stage"),
    },
    {
      label: "Open Blueprint workspace",
      hint: "2",
      icon: Workflow,
      action: () => selectWorkspaceMode("blueprint"),
    },
    {
      label: "Open Agent workspace",
      hint: "3",
      icon: Sparkles,
      action: () => selectWorkspaceMode("agent"),
    },
    {
      label: "Toggle Navigator",
      hint: "⌘B",
      icon: PanelLeftClose,
      action: () => setLeftOpen((value) => !value),
    },
    {
      label: "Toggle Operations panel",
      hint: "⌘J",
      icon: PanelBottomClose,
      action: () => setBottomOpen((value) => !value),
    },
    { label: "Reset workspace layout", hint: "", icon: RefreshCw, action: resetLayout },
  ].filter((item) => item.label.toLowerCase().includes(paletteQuery.toLowerCase()));

  const shellStyle = {
    "--navigator-width": leftOpen ? `${leftWidth}px` : "0px",
    "--inspector-width": rightOpen ? `${rightWidth}px` : "0px",
    "--bottom-height": bottomOpen ? `${bottomHeight}px` : "0px",
  } as CSSProperties;
  const stageScale = zoom / 100;
  const viewportWidth = DEVICE_WIDTHS[device];
  const viewportHeight = DEVICE_HEIGHTS[device];
  const stageStyle = {
    "--stage-scale": stageScale,
    "--viewport-width": `${viewportWidth}px`,
    "--viewport-height": `${viewportHeight}px`,
    "--viewport-scaled-width": `${viewportWidth * stageScale}px`,
    "--viewport-scaled-height": `${viewportHeight * stageScale}px`,
  } as CSSProperties;

  return (
    <div className="strata-studio" style={shellStyle}>
      <header className="title-bar" data-studio-ui>
        <div className="title-left">
          <div className="strata-mark">
            <span />
            <span />
            <span />
          </div>
          <strong>STRATA</strong>
          <nav className="app-menu" aria-label="Application menu">
            <button type="button">File</button>
            <button type="button">Edit</button>
            <button type="button">View</button>
            <button type="button">Build</button>
            <button type="button">Help</button>
          </nav>
          <div className="project-breadcrumb">
            <span>Orbit Atlas</span>
            <ChevronRight size={11} />
            <em>index.strata</em>
          </div>
        </div>

        <div className="workspace-switcher" role="tablist" aria-label="Workspace mode">
          <button
            className={workspaceMode === "stage" ? "active" : ""}
            type="button"
            onClick={() => selectWorkspaceMode("stage")}
          >
            <Monitor size={13} /> Stage
          </button>
          <button
            className={workspaceMode === "blueprint" ? "active" : ""}
            type="button"
            onClick={() => selectWorkspaceMode("blueprint")}
          >
            <Workflow size={13} /> Blueprint
          </button>
          <button
            className={workspaceMode === "agent" ? "active" : ""}
            type="button"
            onClick={() => selectWorkspaceMode("agent")}
          >
            <Sparkles size={13} /> Agent
          </button>
        </div>

        <div className="title-actions">
          <button className="command-trigger" type="button" onClick={() => setPaletteOpen(true)}>
            <Search size={13} />
            <span>Command</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className="save-state">
            <i /> Saved
          </span>
          <button className="run-button" type="button">
            <Play size={13} fill="currentColor" /> Preview
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <nav className="activity-rail" aria-label="Studio tools" data-studio-ui>
          <div>
            <button
              className={activeTool === "hierarchy" ? "active" : ""}
              type="button"
              title="Hierarchy"
              onClick={() => {
                setActiveTool("hierarchy");
                setLeftOpen(true);
              }}
            >
              <FolderTree size={20} />
            </button>
            <button
              className={activeTool === "blocks" ? "active" : ""}
              type="button"
              title="Blocks"
              onClick={() => {
                setActiveTool("blocks");
                setLeftOpen(true);
                setWorkspaceMode("blueprint");
              }}
            >
              <ComponentIcon size={20} />
            </button>
            <button
              className={activeTool === "assets" ? "active" : ""}
              type="button"
              title="Assets"
              onClick={() => {
                setActiveTool("assets");
                setLeftOpen(true);
              }}
            >
              <Library size={20} />
            </button>
            <button
              className={activeTool === "search" ? "active" : ""}
              type="button"
              title="Search"
              onClick={() => {
                setActiveTool("search");
                setLeftOpen(true);
              }}
            >
              <Search size={20} />
            </button>
            <button type="button" title="Agent" onClick={() => setWorkspaceMode("agent")}>
              <Bot size={20} />
            </button>
          </div>
          <div>
            <button type="button" title="Settings">
              <Settings size={20} />
            </button>
            <span className="profile-dot">V</span>
          </div>
        </nav>

        <NavigatorPanel tool={activeTool} selected={selected} onSelect={selectFromTree} />
        <div
          className="panel-resizer vertical left-resizer"
          onPointerDown={(event) => startResize("left", event)}
        />

        <main className="editor-center">
          <div className="document-tabs" data-studio-ui>
            <div className="document-tab active">
              <FileCode2 size={13} />
              <span>
                {workspaceMode === "stage"
                  ? "index.html"
                  : workspaceMode === "blueprint"
                    ? "ExploreButton.blueprint"
                    : "Agent Session"}
              </span>
              <i />
            </div>
            {workspaceMode === "stage" && (
              <div className="document-tab">
                <FileJson2 size={13} />
                <span>element.bundle</span>
              </div>
            )}
            <button type="button">
              <Plus size={14} />
            </button>
            <div className="document-spacer" />
            <IconButton
              icon={PanelLeftClose}
              label="Toggle navigator"
              active={leftOpen}
              onClick={() => setLeftOpen((value) => !value)}
            />
            <IconButton
              icon={PanelBottomClose}
              label="Toggle bottom panel"
              active={bottomOpen}
              onClick={() => setBottomOpen((value) => !value)}
            />
            <IconButton
              icon={PanelRightClose}
              label="Toggle inspector"
              active={rightOpen}
              onClick={() => setRightOpen((value) => !value)}
            />
          </div>

          <div className="workspace-content">
            {workspaceMode === "stage" && (
              <div className="stage-workspace">
                <div className="viewport-toolbar" data-studio-ui>
                  <div className="tool-group">
                    <IconButton
                      icon={MousePointer2}
                      label="Select (P)"
                      active={selectMode}
                      onClick={() => setSelectMode(true)}
                    />
                    <IconButton
                      icon={Hand}
                      label="Pan"
                      active={!selectMode}
                      onClick={() => setSelectMode(false)}
                    />
                    <span className="toolbar-divider" />
                    <IconButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={undo} />
                    <IconButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={redo} />
                  </div>
                  <div className="device-switcher">
                    <button
                      className={device === "desktop" ? "active" : ""}
                      type="button"
                      onClick={() => setDevice("desktop")}
                    >
                      <Monitor size={13} /> Desktop
                    </button>
                    <button
                      className={device === "tablet" ? "active" : ""}
                      type="button"
                      onClick={() => setDevice("tablet")}
                      title="Tablet"
                    >
                      <Tablet size={13} />
                    </button>
                    <button
                      className={device === "mobile" ? "active" : ""}
                      type="button"
                      onClick={() => setDevice("mobile")}
                      title="Mobile"
                    >
                      <Smartphone size={13} />
                    </button>
                    <span>
                      {viewportWidth} × {viewportHeight}
                    </span>
                  </div>
                  <div className="zoom-control">
                    <IconButton
                      icon={ZoomOut}
                      label="Zoom out"
                      onClick={() => setZoom((value) => clamp(value - 5, 30, 120))}
                    />
                    <input
                      aria-label="Stage zoom"
                      type="range"
                      min="30"
                      max="120"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.currentTarget.value))}
                    />
                    <span>{zoom}%</span>
                    <IconButton
                      icon={ZoomIn}
                      label="Zoom in"
                      onClick={() => setZoom((value) => clamp(value + 5, 30, 120))}
                    />
                    <IconButton
                      icon={Maximize2}
                      label="Fit viewport"
                      onClick={() =>
                        setZoom(device === "desktop" ? 74 : device === "tablet" ? 68 : 82)
                      }
                    />
                  </div>
                </div>
                <div
                  ref={stageRef}
                  className={`strata-stage ${selectMode ? "is-selecting" : "is-panning"}`}
                  style={stageStyle}
                  onPointerMove={onStagePointerMove}
                  onPointerLeave={() => setHovered(null)}
                  onClickCapture={onStageClick}
                >
                  <div className="stage-grid" />
                  <div className="stage-rulers">
                    <span className="ruler-corner" />
                    <div className="ruler-horizontal" />
                    <div className="ruler-vertical" />
                  </div>
                  <div className="stage-viewport-space">
                    <div className={`stage-browser device-${device}`}>
                      <div className="stage-browser-chrome" data-studio-ui>
                        <div>
                          <i />
                          <i />
                          <i />
                        </div>
                        <span>
                          <Globe2 size={10} /> orbit-atlas.local
                        </span>
                        <em>Live DOM</em>
                      </div>
                      <DemoPage />
                    </div>
                    <div className="viewport-caption">
                      <span>
                        <i /> {device.charAt(0).toUpperCase() + device.slice(1)} / Base
                      </span>
                      <code>{viewportWidth} px</code>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {workspaceMode === "blueprint" && <BlueprintWorkspace />}
            {workspaceMode === "agent" && <AgentWorkspace onApply={applyAgentPlan} />}
          </div>

          <div
            className="panel-resizer horizontal bottom-resizer"
            onPointerDown={(event) => startResize("bottom", event)}
          />
          <section className="bottom-panel" data-studio-ui>
            <div className="bottom-tabs">
              <button
                className={bottomTab === "operations" ? "active" : ""}
                type="button"
                onClick={() => setBottomTab("operations")}
              >
                Operations <span>{operations.filter((item) => item.tone !== "system").length}</span>
              </button>
              <button
                className={bottomTab === "console" ? "active" : ""}
                type="button"
                onClick={() => setBottomTab("console")}
              >
                Console
              </button>
              <button
                className={bottomTab === "problems" ? "active" : ""}
                type="button"
                onClick={() => setBottomTab("problems")}
              >
                Problems <span>0</span>
              </button>
              <div />
              <button
                type="button"
                title="Clear"
                onClick={() => setOperations((items) => items.filter((item) => item.id === 0))}
              >
                <X size={13} />
              </button>
              <button type="button" title="Collapse" onClick={() => setBottomOpen(false)}>
                <ChevronDown size={14} />
              </button>
            </div>
            {bottomTab === "operations" && (
              <div className="operations-list">
                {operations.map((operation) => (
                  <div className={`operation-row ${operation.tone}`} key={operation.id}>
                    <span>
                      {operation.tone === "agent" ? (
                        <Sparkles size={12} />
                      ) : operation.tone === "system" ? (
                        <Terminal size={12} />
                      ) : (
                        <Braces size={12} />
                      )}
                    </span>
                    <strong>{operation.label}</strong>
                    <code>{operation.value}</code>
                    <time>{operation.time}</time>
                  </div>
                ))}
              </div>
            )}
            {bottomTab === "console" && (
              <div className="console-view">
                <p>
                  <span>strata</span> Stage renderer connected
                </p>
                <p>
                  <span>bridge</span> DOM ↔ Blueprint node map ready
                </p>
                <p>
                  <span>extractor</span>{" "}
                  {bundle
                    ? `${bundle.styles.matchedRules.length} matched CSS rules indexed`
                    : "waiting for selection"}
                </p>
                <div>
                  <em>›</em>
                  <input aria-label="Console command" placeholder="Run a Strata command…" />
                </div>
              </div>
            )}
            {bottomTab === "problems" && (
              <div className="problems-empty">
                <Check size={20} />
                <strong>No problems detected</strong>
                <span>Blueprint schema, DOM bridge and stage render are valid.</span>
              </div>
            )}
          </section>
        </main>

        <div
          className="panel-resizer vertical right-resizer"
          onPointerDown={(event) => startResize("right", event)}
        />

        <aside className="details-inspector" data-studio-ui>
          <div className="panel-heading inspector-heading">
            <span>Details</span>
            <div>
              <IconButton
                icon={RefreshCw}
                label="Refresh values"
                onClick={() => syncProperties(selected)}
              />
              <IconButton icon={MoreHorizontal} label="More" />
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="selected-object">
            <span className="selected-object-icon">
              <ComponentIcon size={17} />
            </span>
            <div>
              <strong>
                {selected
                  ? getElementText(selected) || selected.tagName.toLowerCase()
                  : "No selection"}
              </strong>
              <code>{elementLabel(selected)}</code>
            </div>
            <button
              type="button"
              title="Locate in hierarchy"
              onClick={() => {
                setActiveTool("hierarchy");
                setLeftOpen(true);
              }}
            >
              <Eye size={14} />
            </button>
          </div>
          <div className="selection-path">
            <span>Page</span>
            <ChevronRight size={10} />
            <span>Hero</span>
            <ChevronRight size={10} />
            <strong>{selected?.tagName.toLowerCase() ?? "—"}</strong>
          </div>
          <div className="inspector-tabbar" role="tablist">
            <button
              className={inspectorTab === "design" ? "active" : ""}
              type="button"
              onClick={() => setInspectorTab("design")}
            >
              Design
            </button>
            <button
              className={inspectorTab === "content" ? "active" : ""}
              type="button"
              onClick={() => setInspectorTab("content")}
            >
              Content
            </button>
            <button
              className={inspectorTab === "interactions" ? "active" : ""}
              type="button"
              onClick={() => setInspectorTab("interactions")}
            >
              Actions
            </button>
            <button
              className={inspectorTab === "bundle" ? "active" : ""}
              type="button"
              onClick={() => setInspectorTab("bundle")}
            >
              Bundle
            </button>
          </div>

          <div className="inspector-scroll">
            {inspectorTab === "design" && (
              <>
                <div className="style-scope">
                  <button className="active" type="button">
                    <i /> Local
                  </button>
                  <button type="button">
                    <Plus size={11} /> Token
                  </button>
                  <span>
                    Base <ChevronDown size={11} />
                  </span>
                </div>
                <PanelSection title="Layout" badge="Flex child">
                  <div className="segmented-property">
                    <span>Position</span>
                    <div>
                      <button className="active" type="button">
                        Auto
                      </button>
                      <button type="button">Relative</button>
                      <button type="button">Absolute</button>
                    </div>
                  </div>
                  <div className="property-grid">
                    <NumberField
                      label="W"
                      value={properties.width}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, width: value }))
                      }
                      onCommit={(value) => commitStyles([["width", `${value}px`]], "Width")}
                    />
                    <NumberField
                      label="H"
                      value={properties.height}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, height: value }))
                      }
                      onCommit={(value) => commitStyles([["height", `${value}px`]], "Height")}
                    />
                  </div>
                  <div className="property-grid">
                    <NumberField
                      label="Padding X"
                      value={properties.paddingX}
                      max={320}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, paddingX: value }))
                      }
                      onCommit={(value) =>
                        commitStyles([["padding-inline", `${value}px`]], "Horizontal padding")
                      }
                    />
                    <NumberField
                      label="Padding Y"
                      value={properties.paddingY}
                      max={320}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, paddingY: value }))
                      }
                      onCommit={(value) =>
                        commitStyles([["padding-block", `${value}px`]], "Vertical padding")
                      }
                    />
                  </div>
                  <div className="alignment-control">
                    <span>Align self</span>
                    <div>
                      <button type="button">↤</button>
                      <button className="active" type="button">
                        ↔
                      </button>
                      <button type="button">↦</button>
                      <button type="button">⤢</button>
                    </div>
                  </div>
                </PanelSection>
                <PanelSection title="Shape">
                  <div className="shape-presets">
                    <button
                      className={properties.radius === 0 ? "active" : ""}
                      type="button"
                      onClick={() => commitStyles([["border-radius", "0px"]], "Square shape")}
                    >
                      <i className="square" />
                      Square
                    </button>
                    <button
                      className={properties.radius > 0 && properties.radius < 99 ? "active" : ""}
                      type="button"
                      onClick={() => commitStyles([["border-radius", "12px"]], "Rounded shape")}
                    >
                      <i className="rounded" />
                      Round
                    </button>
                    <button
                      className={properties.radius >= 99 ? "active" : ""}
                      type="button"
                      onClick={() => commitStyles([["border-radius", "999px"]], "Pill shape")}
                    >
                      <i className="pill" />
                      Pill
                    </button>
                  </div>
                  <NumberField
                    label="Corner radius"
                    value={properties.radius}
                    max={999}
                    onDraft={(value) => setProperties((current) => ({ ...current, radius: value }))}
                    onCommit={(value) =>
                      commitStyles([["border-radius", `${value}px`]], "Corner radius")
                    }
                  />
                </PanelSection>
                <PanelSection title="Fill & Border">
                  <label className="property-row color-row">
                    <span>Fill</span>
                    <span>
                      <input
                        type="color"
                        value={properties.background}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setProperties((current) => ({ ...current, background: value }));
                          commitStyles([["background-color", value]], "Fill color");
                        }}
                      />
                      <code>{properties.background.toUpperCase()}</code>
                    </span>
                  </label>
                  <label className="property-row color-row">
                    <span>Border</span>
                    <span>
                      <input
                        type="color"
                        value={properties.borderColor}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setProperties((current) => ({ ...current, borderColor: value }));
                          commitStyles([["border-color", value]], "Border color");
                        }}
                      />
                      <code>{properties.borderColor.toUpperCase()}</code>
                    </span>
                  </label>
                  <div className="property-grid">
                    <NumberField
                      label="Width"
                      value={properties.borderWidth}
                      max={24}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, borderWidth: value }))
                      }
                      onCommit={(value) =>
                        commitStyles([["border-width", `${value}px`]], "Border width")
                      }
                    />
                    <label className="property-row">
                      <span>Style</span>
                      <select
                        value={properties.borderStyle}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setProperties((current) => ({ ...current, borderStyle: value }));
                          commitStyles([["border-style", value]], "Border style");
                        }}
                      >
                        <option value="none">None</option>
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                        <option value="double">Double</option>
                      </select>
                    </label>
                  </div>
                  <NumberField
                    label="Opacity"
                    value={properties.opacity}
                    unit="%"
                    max={100}
                    onDraft={(value) =>
                      setProperties((current) => ({ ...current, opacity: value }))
                    }
                    onCommit={(value) =>
                      commitStyles([["opacity", String(value / 100)]], "Opacity")
                    }
                  />
                </PanelSection>
                <PanelSection title="Typography">
                  <label className="property-row color-row">
                    <span>Text</span>
                    <span>
                      <input
                        type="color"
                        value={properties.color}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setProperties((current) => ({ ...current, color: value }));
                          commitStyles([["color", value]], "Text color");
                        }}
                      />
                      <code>{properties.color.toUpperCase()}</code>
                    </span>
                  </label>
                  <div className="property-grid">
                    <NumberField
                      label="Size"
                      value={properties.fontSize}
                      max={160}
                      onDraft={(value) =>
                        setProperties((current) => ({ ...current, fontSize: value }))
                      }
                      onCommit={(value) => commitStyles([["font-size", `${value}px`]], "Font size")}
                    />
                    <label className="property-row">
                      <span>Weight</span>
                      <select
                        value={properties.fontWeight}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setProperties((current) => ({ ...current, fontWeight: value }));
                          commitStyles([["font-weight", value]], "Font weight");
                        }}
                      >
                        <option value="300">Light</option>
                        <option value="400">Regular</option>
                        <option value="500">Medium</option>
                        <option value="600">Semibold</option>
                        <option value="700">Bold</option>
                        <option value="800">Heavy</option>
                      </select>
                    </label>
                  </div>
                </PanelSection>
              </>
            )}

            {inspectorTab === "content" && (
              <>
                <PanelSection title="Content">
                  <label className="textarea-property">
                    <span>Text</span>
                    <textarea
                      value={properties.text}
                      onChange={(event) =>
                        setProperties((current) => ({
                          ...current,
                          text: event.currentTarget.value,
                        }))
                      }
                      onBlur={(event) => commitText(event.currentTarget.value)}
                    />
                  </label>
                  <label className="property-row">
                    <span>Tag</span>
                    <select value={selected?.tagName.toLowerCase() ?? "div"} disabled>
                      <option>{selected?.tagName.toLowerCase() ?? "div"}</option>
                    </select>
                  </label>
                </PanelSection>
                <PanelSection title="Attributes">
                  <label className="property-row">
                    <span>ID</span>
                    <input value={selected?.id ?? ""} placeholder="No ID" readOnly />
                  </label>
                  <label className="textarea-property">
                    <span>Classes</span>
                    <textarea value={selected ? [...selected.classList].join(" ") : ""} readOnly />
                  </label>
                  <button className="add-property-button" type="button">
                    <Plus size={13} /> Add attribute
                  </button>
                </PanelSection>
                <PanelSection title="Accessibility">
                  <label className="property-row">
                    <span>Role</span>
                    <input value={selected?.getAttribute("role") ?? "Automatic"} readOnly />
                  </label>
                  <label className="property-row">
                    <span>Label</span>
                    <input
                      value={selected?.getAttribute("aria-label") ?? ""}
                      placeholder="Not set"
                      readOnly
                    />
                  </label>
                </PanelSection>
              </>
            )}

            {inspectorTab === "interactions" && (
              <>
                <PanelSection title="States">
                  <div className="state-chips">
                    <button className="active" type="button">
                      Base
                    </button>
                    <button type="button">:hover</button>
                    <button type="button">:focus</button>
                    <button type="button">:active</button>
                    <button type="button">
                      <Plus size={11} />
                    </button>
                  </div>
                  <p className="section-note">
                    Choose a state, then edit its visual properties in Design. State operations
                    remain separate in the Blueprint.
                  </p>
                </PanelSection>
                <PanelSection title="Events" badge="1">
                  <div className="event-card">
                    <span className="event-icon">
                      <MousePointer2 size={15} />
                    </span>
                    <div>
                      <strong>On Click</strong>
                      <code>Navigate · /signals</code>
                    </div>
                    <button type="button">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <button
                    className="add-property-button"
                    type="button"
                    onClick={() => setWorkspaceMode("blueprint")}
                  >
                    <Plus size={13} /> Add interaction
                  </button>
                </PanelSection>
                <PanelSection title="Transitions">
                  <label className="property-row">
                    <span>Duration</span>
                    <span className="unit-input">
                      <input type="number" defaultValue="180" />
                      <em>ms</em>
                    </span>
                  </label>
                  <label className="property-row">
                    <span>Easing</span>
                    <select defaultValue="ease-out">
                      <option>ease-out</option>
                      <option>ease-in-out</option>
                      <option>linear</option>
                    </select>
                  </label>
                </PanelSection>
              </>
            )}

            {inspectorTab === "bundle" && (
              <div className="bundle-tab">
                <div className="bundle-summary">
                  <div>
                    <span>Element Bundle</span>
                    <strong>{bundle ? `v${bundle.version}` : "—"}</strong>
                  </div>
                  <button type="button" disabled={!bundle} onClick={downloadBundle}>
                    <Download size={13} /> Export
                  </button>
                </div>
                {bundle ? (
                  <>
                    <div className="bundle-metrics">
                      <div>
                        <span>Rules</span>
                        <strong>{bundle.styles.matchedRules.length}</strong>
                      </div>
                      <div>
                        <span>Assets</span>
                        <strong>{bundle.assets.length}</strong>
                      </div>
                      <div>
                        <span>Nodes</span>
                        <strong>{(bundle.root.html.match(/data-strata-id=/g) ?? []).length}</strong>
                      </div>
                      <div>
                        <span>Fidelity</span>
                        <strong>{Math.round(bundle.fidelity.score * 100)}%</strong>
                      </div>
                    </div>
                    <code className="bundle-selector">{bundle.root.selector}</code>
                    <iframe
                      className="bundle-preview"
                      title="Isolated element preview"
                      sandbox=""
                      srcDoc={previewDocument}
                    />
                    <details className="bundle-json-details">
                      <summary>Bundle JSON</summary>
                      <pre>{JSON.stringify(bundle, null, 2)}</pre>
                    </details>
                  </>
                ) : (
                  <div className="bundle-empty">
                    <FileJson2 size={24} />
                    <span>Select an element to create its bundle.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="status-bar" data-studio-ui>
        <div>
          <span>
            <Code2 size={12} /> main
          </span>
          <span>
            <RefreshCw size={11} /> 0
          </span>
          <span>
            <Check size={11} /> 0 problems
          </span>
        </div>
        <div>
          <span>Stage: React DOM</span>
          <span>{selected ? elementLabel(selected) : "No selection"}</span>
          <span>
            <Activity size={11} /> 60 FPS
          </span>
          <span className="status-ready">
            <i /> Blueprint bridge ready
          </span>
        </div>
      </footer>

      <div
        className={`element-overlay ${overlayIsHover ? "is-hover" : "is-selected"}`}
        data-strata-overlay
        style={overlayStyle}
      >
        <span>{elementLabel(overlayTarget)}</span>
        <i className="handle nw" />
        <i className="handle ne" />
        <i className="handle sw" />
        <i className="handle se" />
      </div>

      {paletteOpen && (
        <div
          className="command-palette-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
        >
          <section className="command-palette">
            <div className="palette-input">
              <Command size={16} />
              <input
                ref={paletteInputRef}
                aria-label="Search commands"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.currentTarget.value)}
                placeholder="Type a command or search…"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-label">Commands</div>
            <div className="palette-results">
              {paletteCommands.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    className={index === 0 ? "active" : ""}
                    type="button"
                    key={item.label}
                    onClick={() => {
                      item.action();
                      setPaletteOpen(false);
                      setPaletteQuery("");
                    }}
                  >
                    <Icon size={14} />
                    <span>{item.label}</span>
                    {item.hint && <kbd>{item.hint}</kbd>}
                  </button>
                );
              })}
            </div>
            <footer>
              <span>
                <kbd>↑↓</kbd> navigate
              </span>
              <span>
                <kbd>↵</kbd> run
              </span>
              <span>Strata Command Center</span>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
