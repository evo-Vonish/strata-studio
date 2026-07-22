import type { StrataNode } from "@strata/project-model";
import { elementDefinitions } from "@strata/property-schema";
import {
  Box,
  Braces,
  Component,
  Image as ImageIcon,
  type LucideIcon,
  Search,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BasicElementType } from "./element-factory";
import { acceptsInsertedChildren, type InsertionPlacement } from "./element-insertion";

export type InsertableElementType = BasicElementType;

interface AddElementPanelProps {
  selectedNode: StrataNode | null;
  selectedIsRoot: boolean;
  error: string | null;
  onClose: () => void;
  onInsert: (type: InsertableElementType, placement: InsertionPlacement) => void;
}

interface PaletteItem {
  type: InsertableElementType;
  label: string;
  category: string;
  description: string;
  tag: string;
  icon: LucideIcon;
}

const elementIcons: Record<InsertableElementType, LucideIcon> = {
  Box,
  Text: Type,
  Button: Component,
  Image: ImageIcon,
  Input: Braces,
};

const descriptions: Record<InsertableElementType, string> = {
  Box: "Layout container for child elements",
  Text: "Paragraph, label, or heading content",
  Button: "Interactive action with editable text",
  Image: "Visual media with source and alt text",
  Input: "Editable form field and value control",
};

const insertableTypes = new Set<InsertableElementType>(["Box", "Text", "Button", "Image", "Input"]);

const paletteItems: PaletteItem[] = elementDefinitions
  .filter(
    (
      definition,
    ): definition is (typeof elementDefinitions)[number] & {
      type: InsertableElementType;
    } => insertableTypes.has(definition.type as InsertableElementType),
  )
  .map((definition) => ({
    type: definition.type,
    label: definition.label,
    category: definition.category,
    description: descriptions[definition.type],
    tag: definition.defaultTag,
    icon: elementIcons[definition.type],
  }));

function defaultPlacement(node: StrataNode | null): InsertionPlacement {
  return node?.type === "Box" ? "inside" : "after";
}

export function AddElementPanel({
  selectedNode,
  selectedIsRoot,
  error,
  onClose,
  onInsert,
}: AddElementPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<InsertionPlacement>(() =>
    defaultPlacement(selectedNode),
  );
  const insideAllowed = acceptsInsertedChildren(selectedNode);

  useEffect(() => {
    setPlacement(defaultPlacement(selectedNode));
  }, [selectedNode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return paletteItems;
    return paletteItems.filter((item) =>
      [item.label, item.category, item.description, item.tag]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  return (
    <aside className="navigator-panel add-element-panel" aria-label="Add element panel">
      <div className="panel-heading">
        <span>Add element</span>
        <button type="button" aria-label="Close add element panel" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="navigator-search add-element-search">
        <Search size={13} />
        <input
          ref={searchInputRef}
          aria-label="Search elements"
          placeholder="Search elements…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      <section className="insertion-target" aria-label="Insertion target">
        <span>Insert relative to</span>
        <strong>{selectedNode?.editor.name ?? selectedNode?.type ?? "Page root"}</strong>
        {selectedNode ? (
          <fieldset aria-label="Insertion placement">
            <button
              className={placement === "before" ? "active" : ""}
              type="button"
              disabled={selectedIsRoot}
              title={selectedIsRoot ? "Page-level roots cannot gain siblings" : "Insert before"}
              onClick={() => setPlacement("before")}
            >
              Before
            </button>
            <button
              className={placement === "inside" ? "active" : ""}
              type="button"
              disabled={!insideAllowed}
              title={
                insideAllowed ? "Insert as the last child" : "This element cannot contain children"
              }
              onClick={() => setPlacement("inside")}
            >
              Inside
            </button>
            <button
              className={placement === "after" ? "active" : ""}
              type="button"
              disabled={selectedIsRoot}
              title={selectedIsRoot ? "Page-level roots cannot gain siblings" : "Insert after"}
              onClick={() => setPlacement("after")}
            >
              After
            </button>
          </fieldset>
        ) : (
          <small>The element will be appended inside the protected page root.</small>
        )}
      </section>

      {error && (
        <div className="add-element-error" role="alert">
          <strong>Insertion blocked</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="element-palette-heading">
        <span>Primitives</span>
        <small>{matches.length}</small>
      </div>
      <div className="element-palette-list">
        {matches.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              type="button"
              data-element-type={item.type}
              aria-label={`Insert ${item.label}`}
              onClick={() => onInsert(item.type, selectedNode ? placement : "after")}
            >
              <span>
                <Icon size={16} />
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </div>
              <code>{`<${item.tag}>`}</code>
            </button>
          );
        })}
        {matches.length === 0 && (
          <div className="element-palette-empty">
            <Search size={17} />
            <strong>No elements found</strong>
            <small>Try a type, category, or HTML tag.</small>
          </div>
        )}
      </div>

      <footer className="add-element-footer">
        <span>Click to insert</span>
        <code>ProjectOperation / InsertNode</code>
      </footer>
    </aside>
  );
}
