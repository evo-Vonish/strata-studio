import {
  applyTransaction,
  type ProjectOperation,
  type StrataProject,
  safeParseProject,
} from "@strata/project-model";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "strata-studio.project.v0.1";

interface ProjectHistoryEntry {
  label: string;
  forward: ProjectOperation[];
  inverse: ProjectOperation[];
  selectionBefore?: string | null;
  selectionAfter?: string | null;
}

export interface ProjectHistoryContext {
  selectionBefore?: string | null;
  selectionAfter?: string | null;
}

export interface ProjectHistoryResult {
  label: string;
  selectionId?: string | null;
}

function loadProject(fallback: () => StrataProject): StrataProject {
  if (typeof window === "undefined") return fallback();
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (!serialized) return fallback();
    const parsed = safeParseProject(JSON.parse(serialized));
    return parsed.success ? parsed.data : fallback();
  } catch {
    return fallback();
  }
}

export function useProjectStore(initialProject: () => StrataProject) {
  const [project, setProject] = useState<StrataProject>(() => loadProject(initialProject));
  const [historyCursor, setHistoryCursor] = useState(0);
  const [historyLength, setHistoryLength] = useState(0);
  const projectRef = useRef(project);
  const historyRef = useRef<ProjectHistoryEntry[]>([]);
  const cursorRef = useRef(0);

  useEffect(() => {
    projectRef.current = project;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // Persistence is a convenience; the in-memory project remains authoritative.
    }
  }, [project]);

  const applyOperations = useCallback(
    (
      operations: ProjectOperation[],
      label: string,
      context: ProjectHistoryContext = {},
    ): StrataProject => {
      if (operations.length === 0) return projectRef.current;
      const forward = structuredClone(operations);
      const result = applyTransaction(projectRef.current, forward);
      const history = historyRef.current.slice(0, cursorRef.current);
      history.push({
        label,
        forward,
        inverse: structuredClone(result.inverse),
        ...context,
      });
      historyRef.current = history;
      cursorRef.current = history.length;
      projectRef.current = result.project;
      setProject(result.project);
      setHistoryCursor(history.length);
      setHistoryLength(history.length);
      return result.project;
    },
    [],
  );

  const undo = useCallback((): ProjectHistoryResult | null => {
    if (cursorRef.current === 0) return null;
    const entry = historyRef.current[cursorRef.current - 1];
    if (!entry) return null;
    const result = applyTransaction(projectRef.current, entry.inverse);
    cursorRef.current -= 1;
    projectRef.current = result.project;
    setProject(result.project);
    setHistoryCursor(cursorRef.current);
    return {
      label: entry.label,
      ...(entry.selectionBefore !== undefined ? { selectionId: entry.selectionBefore } : {}),
    };
  }, []);

  const redo = useCallback((): ProjectHistoryResult | null => {
    const entry = historyRef.current[cursorRef.current];
    if (!entry) return null;
    const result = applyTransaction(projectRef.current, entry.forward);
    cursorRef.current += 1;
    projectRef.current = result.project;
    setProject(result.project);
    setHistoryCursor(cursorRef.current);
    return {
      label: entry.label,
      ...(entry.selectionAfter !== undefined ? { selectionId: entry.selectionAfter } : {}),
    };
  }, []);

  const reset = useCallback(() => {
    const next = initialProject();
    projectRef.current = next;
    historyRef.current = [];
    cursorRef.current = 0;
    setProject(next);
    setHistoryCursor(0);
    setHistoryLength(0);
  }, [initialProject]);

  return {
    project,
    applyOperations,
    undo,
    redo,
    reset,
    historyCursor,
    historyLength,
    canUndo: historyCursor > 0,
    canRedo: historyCursor < historyLength,
  };
}
