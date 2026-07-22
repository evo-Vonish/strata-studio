"use client";

import { buildStageDocument } from "@strata/dom-runtime";
import type { StrataElementBundle } from "@strata/element-bundle";
import { buildPreviewDocument, extractElement } from "@strata/element-extractor";
import { getElementBounds } from "@strata/element-picker";
import type {
  ProjectOperation,
  StrataNode,
  StrataProject,
  StrataValue,
  StyleScope,
} from "@strata/project-model";
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
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AddElementPanel, type InsertableElementType } from "./add-element-panel";
import { createElementNode } from "./element-factory";
import {
  createElementId,
  type InsertionPlacement,
  resolveInsertionTarget,
} from "./element-insertion";
import { ModelInspector } from "./model-inspector";
import {
  createStudioProject,
  selectedNode as findSelectedNode,
  INITIAL_SELECTED_NODE_ID,
} from "./studio-project";
import { useProjectStore } from "./use-project-store";

type WorkspaceMode = "stage" | "blueprint" | "agent";
type ActivityTool = "hierarchy" | "blocks" | "assets" | "search";
type InspectorTab = "design" | "content" | "interactions" | "bundle";
type BottomTab = "operations" | "console" | "problems";
type DeviceMode = "desktop" | "tablet" | "mobile";
type StyleState = "base" | "hover" | "focus" | "focus-visible" | "active" | "disabled";
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

interface OperationItem {
  id: number;
  label: string;
  value: string;
  time: string;
  tone: "edit" | "system" | "agent";
}

interface LayerNode {
  id: string;
  label: string;
  detail: string;
  depth: number;
  icon: LucideIcon;
  expanded: boolean;
}

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

function cssValue(value: string): StrataValue | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const dimensionMatch = trimmed.match(/^(-?(?:\d+|\d*\.\d+))(px|%|em|rem|vw|vh|vmin|vmax)$/i);
  if (dimensionMatch?.[1] && dimensionMatch[2]) {
    return {
      kind: "dimension",
      value: Number(dimensionMatch[1]),
      unit: dimensionMatch[2].toLowerCase(),
    };
  }
  if (/^#[\da-f]{3,8}$/i.test(trimmed)) return { kind: "color", value: trimmed };
  if (/^-?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
    return { kind: "literal", value: Number(trimmed) };
  }
  return { kind: "raw", cssText: trimmed };
}

function modelScope(device: DeviceMode, state: StyleState): StyleScope {
  return {
    ...(device === "desktop" ? {} : { breakpoint: device }),
    ...(state === "base" ? {} : { state }),
  };
}

function projectionFor(document: Document | null, nodeId: string | null): Element | null {
  if (!document || !nodeId) return null;
  return (
    [...document.querySelectorAll("[data-strata-node-id]")].find(
      (element) => element.getAttribute("data-strata-node-id") === nodeId,
    ) ?? null
  );
}

function iconForNode(node: StrataNode, depth: number): LucideIcon {
  if (depth === 0) return Globe2;
  if (node.type === "Text") return Type;
  if (node.type === "Image") return ImageIcon;
  if (node.type === "Button" || node.type === "Input") return ComponentIcon;
  return Box;
}

function projectLayers(project: StrataProject): LayerNode[] {
  const document = project.documents[project.activeDocumentId];
  if (!document) return [];
  const layers: LayerNode[] = [];
  const visit = (nodeId: string, depth: number) => {
    const current = document.nodes[nodeId];
    if (!current) return;
    layers.push({
      id: current.id,
      label: current.editor.name ?? current.type,
      detail: current.tag ?? current.kind,
      depth,
      icon: iconForNode(current, depth),
      expanded: current.children.length > 0,
    });
    for (const childId of current.children) visit(childId, depth + 1);
  };
  for (const rootId of document.rootNodeIds) visit(rootId, 0);
  return layers;
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

function NavigatorPanel({
  tool,
  project,
  selectedNodeId,
  onAdd,
  onSelect,
}: {
  tool: ActivityTool;
  project: StrataProject;
  selectedNodeId: string | null;
  onAdd: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const title = {
    hierarchy: "Hierarchy",
    blocks: "Block Library",
    assets: "Assets",
    search: "Search",
  }[tool];
  const layers = useMemo(() => projectLayers(project), [project]);
  const document = project.documents[project.activeDocumentId];

  return (
    <aside className="navigator-panel" data-studio-ui>
      <div className="panel-heading">
        <span>{title}</span>
        <div>
          <IconButton icon={Plus} label="Add element" onClick={onAdd} />
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
            <span>
              {project.name ?? "Strata Project"} / {document?.name ?? "Document"}
            </span>
            <small>{layers.length}</small>
          </div>
          <div className="layer-tree" role="tree" aria-label="Page hierarchy">
            {layers.map((node) => {
              const active = selectedNodeId === node.id;
              const Icon = node.icon;
              return (
                <button
                  key={node.id}
                  className={`layer-row${active ? " active" : ""}`}
                  type="button"
                  role="treeitem"
                  aria-selected={active}
                  style={{ "--depth": node.depth } as CSSProperties}
                  onClick={() => onSelect(node.id)}
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
              <strong>Model synchronized</strong>
              <small>{layers.length} nodes · compiled stage</small>
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
            <strong>Primary action</strong>
            <code>primary-action</code>
          </div>
          <Check size={14} />
        </div>
        <div className="operation-preview">
          <span>SetStyle</span>
          <code>width → 208px</code>
        </div>
        <div className="operation-preview">
          <span>SetStyle</span>
          <code>font-weight → 760</code>
        </div>
        <div className="operation-preview">
          <span>SetStateStyle</span>
          <code>:hover translateY → -3px</code>
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
  const runtimeFrameRef = useRef<HTMLIFrameElement>(null);
  const runtimeCleanupRef = useRef<(() => void) | null>(null);
  const selectModeRef = useRef(true);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
  const {
    project,
    applyOperations,
    undo: undoProject,
    redo: redoProject,
    canUndo,
    canRedo,
  } = useProjectStore(createStudioProject);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("stage");
  const [activeTool, setActiveTool] = useState<ActivityTool>("hierarchy");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [bottomTab, setBottomTab] = useState<BottomTab>("operations");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [styleState, setStyleState] = useState<StyleState>("base");
  const [schemaInspector, setSchemaInspector] = useState(true);
  const [zoom, setZoom] = useState(74);
  const [selectMode, setSelectMode] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(INITIAL_SELECTED_NODE_ID);
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
  const [addElementOpen, setAddElementOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const viewportSignature = `${device}:${zoom}`;
  const [operations, setOperations] = useState<OperationItem[]>([
    {
      id: 0,
      label: "Project runtime connected",
      value: "Project Model → DOM Runtime → Stage",
      time: "--:--:--",
      tone: "system",
    },
  ]);
  const modelNode = findSelectedNode(project, selectedNodeId);
  const stageDocument = useMemo(
    () =>
      buildStageDocument(
        project,
        project.activeDocumentId,
        project.name ? { title: project.name } : {},
      ),
    [project],
  );
  const selectionPath = useMemo(() => {
    const document = project.documents[project.activeDocumentId];
    const path: StrataNode[] = [];
    let current: StrataNode | null | undefined = modelNode;
    while (current && path.length <= Object.keys(document?.nodes ?? {}).length) {
      path.unshift(current);
      current = current.parentId && document ? document.nodes[current.parentId] : undefined;
    }
    return path;
  }, [modelNode, project]);

  selectModeRef.current = selectMode;

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

  const captureElement = useCallback(
    (element: Element, options: { quiet?: boolean } = {}) => {
      setSelected(element);
      setSelectedNodeId(element.getAttribute("data-strata-node-id"));
      setHovered(null);
      syncProperties(element);
      setRevision((value) => value + 1);
      try {
        const nextBundle = extractElement(element);
        setBundle(nextBundle);
        setError(null);
        if (!options.quiet) addOperation("SelectNode", elementLabel(element));
      } catch (caught) {
        setBundle(null);
        setError(caught instanceof Error ? caught.message : "The element could not be selected");
      }
    },
    [addOperation, syncProperties],
  );

  useEffect(() => {
    if (modelNode) return;
    const document = project.documents[project.activeDocumentId];
    setSelectedNodeId(document?.rootNodeIds[0] ?? null);
  }, [modelNode, project]);

  const connectRuntimeFrame = useCallback(() => {
    runtimeCleanupRef.current?.();
    const document = runtimeFrameRef.current?.contentDocument;
    if (!document) return;
    const root = document.documentElement;
    root.style.cursor = selectModeRef.current ? "default" : "grab";

    const targetFor = (event: Event): Element | null => {
      const target = event.target as Element | null;
      return target?.closest?.("[data-strata-node-id]") ?? null;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!selectModeRef.current) return;
      setHovered(targetFor(event));
    };
    const onPointerLeave = () => setHovered(null);
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      if (!selectModeRef.current) return;
      const target = targetFor(event);
      if (!target) return;
      event.stopPropagation();
      captureElement(target);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("click", onClick, true);
    runtimeCleanupRef.current = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("click", onClick, true);
    };

    const current = projectionFor(document, selectedNodeId);
    if (current) captureElement(current, { quiet: true });
  }, [captureElement, selectedNodeId]);

  useEffect(() => () => runtimeCleanupRef.current?.(), []);

  useEffect(() => {
    const root = runtimeFrameRef.current?.contentDocument?.documentElement;
    if (root) root.style.cursor = selectMode ? "default" : "grab";
  }, [selectMode]);

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
      "--overlay-viewport": viewportSignature,
    } as CSSProperties);
  }, [hovered, revision, selectMode, selected, viewportSignature, workspaceMode]);

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
    const frameElement = runtimeFrameRef.current;
    if (frameElement) frameElement.dataset.device = device;
    const frame = window.requestAnimationFrame(() => {
      if (selected?.isConnected) syncProperties(selected);
      setRevision((value) => value + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [device, selected, syncProperties]);

  useEffect(() => {
    if (!paletteOpen) return;
    const frame = window.requestAnimationFrame(() => paletteInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [paletteOpen]);

  const applyModelOperations = useCallback(
    (nextOperations: ProjectOperation[], label: string, tone: OperationItem["tone"] = "edit") => {
      if (nextOperations.length === 0) return;
      applyOperations(nextOperations, label);
      addOperation(
        nextOperations.length === 1 ? (nextOperations[0]?.type ?? "Operation") : "Transaction",
        `${label} · ${nextOperations.length} operation${nextOperations.length === 1 ? "" : "s"}`,
        tone,
      );
    },
    [addOperation, applyOperations],
  );

  const insertElement = useCallback(
    (type: InsertableElementType, placement: InsertionPlacement) => {
      const document = project.documents[project.activeDocumentId];
      if (!document) return;
      try {
        const target = resolveInsertionTarget(project, selectedNodeId, placement, type);
        const nodeId = createElementId(document, type);
        const node = createElementNode({ type, nodeId, parentId: target.parentId });
        applyModelOperations(
          [
            {
              type: "InsertNode",
              source: "human",
              documentId: document.id,
              node,
              descendants: [],
              parentId: target.parentId,
              index: target.index,
            },
          ],
          `Insert ${type}`,
        );
        setSelectedNodeId(nodeId);
        setSelected(null);
        setHovered(null);
        setWorkspaceMode("stage");
        setActiveTool("hierarchy");
        setAddElementOpen(false);
        setError(null);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : `Could not insert ${type}`;
        setError(message);
        addOperation("Insert failed", message, "system");
      }
    },
    [addOperation, applyModelOperations, project, selectedNodeId],
  );

  const undo = useCallback(() => {
    const label = undoProject();
    if (label) addOperation("Undo", label, "system");
  }, [addOperation, undoProject]);

  const redo = useCallback(() => {
    const label = redoProject();
    if (label) addOperation("Redo", label, "system");
  }, [addOperation, redoProject]);

  const commitStyles = useCallback(
    (styles: Array<[string, string]>, label: string) => {
      if (!selectedNodeId) return;
      const scope = modelScope(device, styleState);
      const nextOperations = styles.map(([name, serialized]): ProjectOperation => {
        const value = cssValue(serialized);
        const base: ProjectOperation = {
          type: "SetStyle",
          source: "inspector",
          documentId: project.activeDocumentId,
          nodeId: selectedNodeId,
          scope,
          name,
        };
        return value ? { ...base, value } : base;
      });
      applyModelOperations(nextOperations, label);
    },
    [applyModelOperations, device, project.activeDocumentId, selectedNodeId, styleState],
  );

  const commitText = useCallback(
    (value: string) => {
      if (!selectedNodeId) return;
      const content = value.trim();
      const operation: ProjectOperation = {
        type: "SetContent",
        source: "inspector",
        documentId: project.activeDocumentId,
        nodeId: selectedNodeId,
        value: { kind: "literal", value: content },
      };
      applyModelOperations([operation], "Text content");
    },
    [applyModelOperations, project.activeDocumentId, selectedNodeId],
  );

  const selectFromTree = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const element = projectionFor(runtimeFrameRef.current?.contentDocument ?? null, nodeId);
    if (element) captureElement(element);
    setWorkspaceMode("stage");
  };

  const selectWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === "blueprint") setActiveTool("blocks");
    if (mode === "stage" && activeTool === "blocks") setActiveTool("hierarchy");
  };

  const openAddElement = useCallback(() => {
    setWorkspaceMode("stage");
    setActiveTool("hierarchy");
    setLeftOpen(true);
    setError(null);
    setAddElementOpen(true);
  }, []);

  const openCommandPalette = useCallback(() => {
    paletteReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaletteOpen(true);
    setPaletteIndex(0);
  }, []);

  const closeCommandPalette = useCallback(() => {
    const returnTarget = paletteReturnFocusRef.current;
    setPaletteOpen(false);
    setPaletteQuery("");
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
    });
  }, []);

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
      const target = event.target;
      const isEditing =
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable);
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
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
      } else if (event.key.toLowerCase() === "p" && !modifier && !event.altKey && !isEditing) {
        setSelectMode((value) => !value);
      } else if (event.key === "Escape") {
        if (paletteOpen) closeCommandPalette();
        else setAddElementOpen(false);
        setHovered(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeCommandPalette, openCommandPalette, paletteOpen, redo, undo]);

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
    const documentId = project.activeDocumentId;
    if (!project.documents[documentId]?.nodes[INITIAL_SELECTED_NODE_ID]) {
      addOperation(
        "Agent plan blocked",
        `Target ${INITIAL_SELECTED_NODE_ID} is not present in the active document`,
        "system",
      );
      return;
    }
    const operations: ProjectOperation[] = [
      {
        type: "SetStyle",
        source: "agent",
        documentId,
        nodeId: INITIAL_SELECTED_NODE_ID,
        scope: {},
        name: "width",
        value: { kind: "dimension", value: 208, unit: "px" },
      },
      {
        type: "SetStyle",
        source: "agent",
        documentId,
        nodeId: INITIAL_SELECTED_NODE_ID,
        scope: {},
        name: "font-weight",
        value: { kind: "literal", value: 760 },
      },
      {
        type: "SetStyle",
        source: "agent",
        documentId,
        nodeId: INITIAL_SELECTED_NODE_ID,
        scope: { state: "hover" },
        name: "transform",
        value: { kind: "literal", value: "translateY(-3px)" },
      },
    ];
    setSelectedNodeId(INITIAL_SELECTED_NODE_ID);
    applyModelOperations(operations, "Agent plan · Primary action", "agent");
    setWorkspaceMode("stage");
  };

  const paletteCommands = [
    {
      label: "Add element",
      hint: "",
      icon: Plus,
      action: openAddElement,
    },
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

  const runPaletteCommand = (index: number) => {
    const item = paletteCommands[index];
    if (!item) return;
    setPaletteOpen(false);
    setPaletteQuery("");
    item.action();
  };

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
            <span>{project.name ?? "Strata Project"}</span>
            <ChevronRight size={11} />
            <em>home.strata</em>
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
          <button className="command-trigger" type="button" onClick={openCommandPalette}>
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
                setAddElementOpen(false);
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
                setAddElementOpen(false);
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
                setAddElementOpen(false);
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
                setAddElementOpen(false);
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

        {addElementOpen ? (
          <AddElementPanel
            selectedNode={modelNode}
            error={error}
            onClose={() => setAddElementOpen(false)}
            onInsert={insertElement}
          />
        ) : (
          <NavigatorPanel
            tool={activeTool}
            project={project}
            selectedNodeId={selectedNodeId}
            onAdd={openAddElement}
            onSelect={selectFromTree}
          />
        )}
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
                    ? "PrimaryAction.blueprint"
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
                  onPointerLeave={() => setHovered(null)}
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
                          <Globe2 size={10} /> strata-model.local
                        </span>
                        <em>Model Runtime</em>
                      </div>
                      <iframe
                        ref={runtimeFrameRef}
                        className="model-stage-frame"
                        title={`${project.name ?? "Strata Project"} stage`}
                        sandbox="allow-same-origin"
                        srcDoc={stageDocument}
                        onLoad={connectRuntimeFrame}
                      />
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
                  <span>strata</span> Project Store connected
                </p>
                <p>
                  <span>runtime</span> Project Model → isolated DOM projection ready
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
                <span>Property schema, operations and stage render are valid.</span>
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
              <strong>{modelNode?.editor.name ?? "No model selection"}</strong>
              <code>{modelNode ? `${modelNode.type} · ${modelNode.id}` : "—"}</code>
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
            <span>
              {selectionPath
                .slice(0, -1)
                .map((node) => node.editor.name ?? node.type)
                .join(" / ") ||
                project.documents[project.activeDocumentId]?.name ||
                "Document"}
            </span>
            <ChevronRight size={10} />
            <strong>{modelNode?.editor.name ?? "—"}</strong>
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

          <fieldset
            className={`inspector-source-switch${
              inspectorTab === "design" || inspectorTab === "content" ? "" : " is-status"
            }`}
            aria-label="Inspector source"
          >
            {inspectorTab === "design" || inspectorTab === "content" ? (
              <>
                <button
                  className={schemaInspector ? "active" : ""}
                  type="button"
                  onClick={() => setSchemaInspector(true)}
                >
                  Schema
                </button>
                <button
                  className={!schemaInspector ? "active" : ""}
                  type="button"
                  onClick={() => setSchemaInspector(false)}
                >
                  Quick
                </button>
              </>
            ) : null}
            <span>{inspectorTab === "bundle" ? "Runtime Projection" : "Project Model"}</span>
          </fieldset>

          <div className="inspector-scroll">
            {(inspectorTab === "design" || inspectorTab === "content") && schemaInspector && (
              <ModelInspector
                mode={inspectorTab}
                node={modelNode}
                assets={project.assets}
                documentId={project.activeDocumentId}
                device={device}
                styleState={styleState}
                onStyleStateChange={setStyleState}
                onApply={applyModelOperations}
              />
            )}

            {inspectorTab === "design" && !schemaInspector && (
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

            {inspectorTab === "content" && !schemaInspector && (
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
          <span>Stage: Project Model</span>
          <span>{modelNode?.editor.name ?? "No selection"}</span>
          <span>
            <Activity size={11} /> 60 FPS
          </span>
          <span className="status-ready">
            <i /> Canonical operations ready
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
            if (event.target === event.currentTarget) closeCommandPalette();
          }}
        >
          <section className="command-palette">
            <div className="palette-input">
              <Command size={16} />
              <input
                ref={paletteInputRef}
                aria-label="Search commands"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-results"
                aria-activedescendant={
                  paletteCommands[paletteIndex] ? `command-result-${paletteIndex}` : undefined
                }
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.currentTarget.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPaletteIndex((index) =>
                      Math.min(index + 1, Math.max(0, paletteCommands.length - 1)),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPaletteIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    runPaletteCommand(paletteIndex);
                  }
                }}
                placeholder="Type a command or search…"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-label">Commands</div>
            <div className="palette-results" id="command-results">
              {paletteCommands.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    id={`command-result-${index}`}
                    className={index === paletteIndex ? "active" : ""}
                    type="button"
                    key={item.label}
                    onMouseEnter={() => setPaletteIndex(index)}
                    onClick={() => runPaletteCommand(index)}
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
