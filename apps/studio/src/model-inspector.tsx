import type {
  ProjectOperation,
  StrataNode,
  StrataProject,
  StrataValue,
  StyleScope,
} from "@strata/project-model";
import {
  createDefaultPropertySchemaRegistry,
  type PropertyDefinition,
} from "@strata/property-schema";
import { useEffect, useMemo, useState } from "react";

type DeviceMode = "desktop" | "tablet" | "mobile";
type StyleState = "base" | "hover" | "focus" | "focus-visible" | "active" | "disabled";

interface ModelInspectorProps {
  mode: "design" | "content";
  node: StrataNode | null;
  assets: StrataProject["assets"];
  documentId: string;
  device: DeviceMode;
  styleState: StyleState;
  onStyleStateChange: (state: StyleState) => void;
  onApply: (operations: ProjectOperation[], label: string) => void;
}

const registry = createDefaultPropertySchemaRegistry();
const STYLE_STATES: StyleState[] = [
  "base",
  "hover",
  "focus",
  "focus-visible",
  "active",
  "disabled",
];

function scopeFor(device: DeviceMode, state: StyleState): StyleScope {
  return {
    ...(device === "desktop" ? {} : { breakpoint: device }),
    ...(state === "base" ? {} : { state }),
  };
}

function sameScope(left: StyleScope, right: StyleScope): boolean {
  return (
    left.breakpoint === right.breakpoint &&
    left.state === right.state &&
    left.colorMode === right.colorMode &&
    left.variant === right.variant
  );
}

function propertyValue(
  node: StrataNode,
  definition: PropertyDefinition,
  scope: StyleScope,
): StrataValue | undefined {
  if (definition.target === "content") return node.content;
  if (definition.target === "tag")
    return node.tag ? { kind: "literal", value: node.tag } : undefined;
  const key = definition.storageKey ?? definition.id;
  if (definition.target === "attribute") return node.attributes[key];
  if (definition.target === "style")
    return node.styleRules.find((rule) => sameScope(rule.scope, scope))?.properties[key];
  if (definition.target === "aria") return node.accessibility.aria[key];
  return undefined;
}

function valueText(value: StrataValue | undefined): string {
  if (!value || value.kind === "unset") return "";
  if (value.kind === "literal") return value.value === null ? "" : String(value.value);
  if (value.kind === "dimension") return String(value.value);
  if (value.kind === "color") return value.value;
  if (value.kind === "asset") return value.assetId;
  if (value.kind === "reference") return value.nodeId;
  if (value.kind === "token") return value.tokenId;
  if (value.kind === "binding") return value.expression;
  return value.cssText;
}

function toValue(
  definition: PropertyDefinition,
  text: string,
  unit: string,
  assetIds: ReadonlySet<string>,
): StrataValue | undefined {
  if (text === "" && definition.target !== "content") return undefined;
  if (definition.valueType === "dimension") {
    const value = Number(text);
    return Number.isFinite(value)
      ? { kind: "dimension", value, unit }
      : { kind: "raw", cssText: text };
  }
  if (definition.valueType === "number") {
    const value = Number(text);
    return Number.isFinite(value) ? { kind: "literal", value } : undefined;
  }
  if (definition.valueType === "boolean") return { kind: "literal", value: text === "true" };
  if (definition.valueType === "color") return { kind: "color", value: text };
  if (definition.valueType === "asset") {
    return assetIds.has(text) ? { kind: "asset", assetId: text } : { kind: "literal", value: text };
  }
  if (definition.valueType === "token") return { kind: "token", tokenId: text };
  if (definition.valueType === "binding") return { kind: "binding", expression: text };
  if (definition.valueType === "raw") return { kind: "raw", cssText: text };
  return { kind: "literal", value: text };
}

function DraftField({
  definition,
  value,
  assetIds,
  onCommit,
}: {
  definition: PropertyDefinition;
  value: StrataValue | undefined;
  assetIds: ReadonlySet<string>;
  onCommit: (value: StrataValue | undefined) => void;
}) {
  const initialUnit = value?.kind === "dimension" ? value.unit : (definition.units?.[0] ?? "px");
  const [draft, setDraft] = useState(() => valueText(value));
  const [unit, setUnit] = useState(initialUnit);

  useEffect(() => {
    setDraft(valueText(value));
    setUnit(value?.kind === "dimension" ? value.unit : (definition.units?.[0] ?? "px"));
  }, [definition.units, value]);

  if (definition.control === "toggle") {
    const checked = value?.kind === "literal" && value.value === true;
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCommit({ kind: "literal", value: event.currentTarget.checked })}
      />
    );
  }

  if (definition.control === "select" || definition.control === "segmented") {
    return (
      <select
        value={draft}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          onCommit(toValue(definition, next, unit, assetIds));
        }}
      >
        <option value="">Inherit / unset</option>
        {definition.options?.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (definition.control === "color") {
    const color = /^#[\da-f]{6}$/i.test(draft) ? draft : "#000000";
    return (
      <span className="schema-color-control">
        <input
          type="color"
          value={color}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft(next);
            onCommit({ kind: "color", value: next });
          }}
        />
        <code>{draft || "unset"}</code>
      </span>
    );
  }

  const inputType =
    definition.control === "number" ||
    (definition.control === "dimension" && (!value || value.kind === "dimension"))
      ? "number"
      : "text";
  const commit = () => onCommit(toValue(definition, draft, unit, assetIds));

  if (definition.control === "textarea" || definition.control === "code") {
    return (
      <textarea
        value={draft}
        rows={definition.control === "code" ? 4 : 3}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
      />
    );
  }

  return (
    <span className="schema-input-control">
      <input
        type={inputType}
        value={draft}
        min={definition.min}
        max={definition.max}
        step={definition.step ?? (inputType === "number" ? "any" : undefined)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {definition.control === "dimension" && inputType === "number" && (
        <select
          aria-label={`${definition.label} unit`}
          value={unit}
          onChange={(event) => {
            const nextUnit = event.currentTarget.value;
            setUnit(nextUnit);
            onCommit(toValue(definition, draft, nextUnit, assetIds));
          }}
        >
          {definition.units?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

export function ModelInspector({
  mode,
  node,
  assets,
  documentId,
  device,
  styleState,
  onStyleStateChange,
  onApply,
}: ModelInspectorProps) {
  const scope = useMemo(() => scopeFor(device, styleState), [device, styleState]);
  const assetIds = useMemo(() => new Set(Object.keys(assets)), [assets]);
  const definitions = useMemo(() => {
    if (!node) return [];
    if (!registry.findElement(node.type)) return [];
    const all = registry.getPropertiesForElement(node.type);
    const context = Object.fromEntries(
      all.map((definition) => [definition.id, propertyValue(node, definition, scope)]),
    );
    return all.filter(
      (definition) =>
        (mode === "design" ? definition.target === "style" : definition.target !== "style") &&
        registry.isVisible(definition, node.type, context),
    );
  }, [mode, node, scope]);

  const groups = useMemo(() => {
    const result = new Map<string, PropertyDefinition[]>();
    for (const definition of definitions) {
      const current = result.get(definition.group) ?? [];
      current.push(definition);
      result.set(definition.group, current);
    }
    return [...result.entries()];
  }, [definitions]);

  if (!node) {
    return <div className="schema-empty">Select a model node to inspect its schema.</div>;
  }

  const commitProperty = (definition: PropertyDefinition, value: StrataValue | undefined) => {
    const key = definition.storageKey ?? definition.id;
    let operation: ProjectOperation;
    if (definition.target === "content") {
      operation = {
        type: "SetContent",
        source: "inspector",
        documentId,
        nodeId: node.id,
        value,
      };
    } else if (definition.target === "tag") {
      operation = {
        type: "SetTag",
        source: "inspector",
        documentId,
        nodeId: node.id,
        tag: value?.kind === "literal" ? String(value.value ?? "") || undefined : undefined,
      };
    } else if (definition.target === "style") {
      operation = {
        type: "SetStyle",
        source: "inspector",
        documentId,
        nodeId: node.id,
        scope,
        name: key,
        value,
      };
    } else if (definition.target === "attribute") {
      operation = value
        ? {
            type: "SetAttribute",
            source: "inspector",
            documentId,
            nodeId: node.id,
            name: key,
            value,
          }
        : {
            type: "RemoveAttribute",
            source: "inspector",
            documentId,
            nodeId: node.id,
            name: key,
          };
    } else {
      return;
    }
    onApply([operation], `${definition.label} · ${node.editor.name ?? node.id}`);
  };

  return (
    <div className="schema-inspector">
      {mode === "design" && (
        <div className="schema-scope-bar">
          <div>
            {STYLE_STATES.map((state) => (
              <button
                className={styleState === state ? "active" : ""}
                key={state}
                type="button"
                onClick={() => onStyleStateChange(state)}
              >
                {state}
              </button>
            ))}
          </div>
          <code>{device === "desktop" ? "base" : device}</code>
        </div>
      )}
      {groups.map(([group, properties]) => (
        <section className="schema-section" key={group}>
          <header>
            <strong>{group}</strong>
            <span>{properties.length}</span>
          </header>
          <div>
            {properties.map((definition) => {
              const value = propertyValue(node, definition, scope);
              return (
                <div
                  className="schema-property"
                  data-property-id={definition.id}
                  key={definition.id}
                >
                  <span>
                    {definition.label}
                    {definition.responsive && <small>R</small>}
                    {definition.stateful && <small>S</small>}
                  </span>
                  <DraftField
                    definition={definition}
                    value={value}
                    assetIds={assetIds}
                    onCommit={(next) => commitProperty(definition, next)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
