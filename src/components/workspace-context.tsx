"use client";
import { createContext, useContext } from "react";
import type { WorkspaceAction, WorkspaceSnapshot } from "@/lib/contracts";
export type WorkspaceContextValue = {
  data: WorkspaceSnapshot;
  busy: boolean;
  mutate: (action: WorkspaceAction, success?: string) => Promise<boolean>;
  openLead: (id: string) => void;
  discover: () => void;
  importCsv: () => void;
};
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace unavailable");
  return value;
}
