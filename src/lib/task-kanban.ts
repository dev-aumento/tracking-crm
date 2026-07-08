export const PROJECT_PIPELINE_STAGES = [
  { key: "new", label: "To Do", color: "#6B7280" },
  { key: "in_designing", label: "In Designing", color: "#8B5CF6" },
  { key: "in_developing", label: "In Developing", color: "#2563EB" },
  { key: "in_qa_1st_round", label: "In QA (1st Round)", color: "#D97706" },
  { key: "backlog", label: "Backlog", color: "#9CA3AF" },
  { key: "client_1st_round", label: "Client (1st Round)", color: "#0EA5E9" },
  { key: "backlog_from_client", label: "Backlog from Client", color: "#64748B" },
  { key: "client_2nd_round", label: "Client (2nd Round)", color: "#0284C7" },
  { key: "publish_live", label: "Publish Live", color: "#059669" },
  { key: "finished", label: "Finished", color: "#10B981" },
] as const;

export type ProjectPipelineStageKey = (typeof PROJECT_PIPELINE_STAGES)[number]["key"];

export const PROJECT_PIPELINE_STAGE_KEYS = PROJECT_PIPELINE_STAGES.map((s) => s.key);

/** @deprecated Use PROJECT_PIPELINE_STAGES */
export const KANBAN_STAGES = PROJECT_PIPELINE_STAGES;

export type KanbanStageKey = ProjectPipelineStageKey;

export function pipelineStageLabel(stage?: string | null): string {
  if (!stage) return "To Do";
  return PROJECT_PIPELINE_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export function pipelineStageColor(stage?: string | null): string {
  if (!stage) return "#6B7280";
  return PROJECT_PIPELINE_STAGES.find((s) => s.key === stage)?.color ?? "#6B7280";
}

export function contrastingTextOnColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1F2937" : "#FFFFFF";
}

export const kanbanStageLabel = pipelineStageLabel;
export const kanbanStageColor = pipelineStageColor;

export function normalizeTaskStage(stage?: string | null): ProjectPipelineStageKey {
  if (stage && PROJECT_PIPELINE_STAGES.some((s) => s.key === stage)) {
    return stage as ProjectPipelineStageKey;
  }
  return "new";
}

export function legacyStatusToStage(status: string): ProjectPipelineStageKey {
  switch (status) {
    case "in_progress":
      return "in_developing";
    case "review":
      return "in_qa_1st_round";
    case "done":
      return "finished";
    default:
      return "new";
  }
}

export function taskPipelineStage(task: { stage?: string | null; status?: string }): ProjectPipelineStageKey {
  if (task.stage) return normalizeTaskStage(task.stage);
  return legacyStatusToStage(task.status ?? "todo");
}
