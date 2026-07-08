export type WorkflowState =
  | "not_started"
  | "in_progress"
  | "paused"
  | "deferred"
  | "complete";

export type DbTaskStatus = "todo" | "in_progress" | "review" | "done";

export const WORKFLOW_LABELS: Record<WorkflowState, string> = {
  not_started: "Not started",
  in_progress: "In Progress",
  paused: "Pause",
  deferred: "Defer",
  complete: "Complete",
};

export function resolveWorkflowState(
  taskStatus: string,
  isDeferred: boolean,
): WorkflowState {
  if (taskStatus === "done") return "complete";
  if (isDeferred) return "deferred";
  if (taskStatus === "in_progress") return "in_progress";
  if (taskStatus === "review") return "paused";
  return "not_started";
}

export function workflowStateToDb(state: WorkflowState): {
  status: DbTaskStatus;
  deferred: boolean;
} {
  switch (state) {
    case "in_progress":
      return { status: "in_progress", deferred: false };
    case "paused":
      return { status: "review", deferred: false };
    case "deferred":
      return { status: "review", deferred: true };
    case "complete":
      return { status: "done", deferred: false };
    default:
      return { status: "todo", deferred: false };
  }
}

/** Options shown in the status dropdown for the current workflow state. */
export function getWorkflowTransitions(
  state: WorkflowState,
): { value: WorkflowState; label: string }[] {
  switch (state) {
    case "not_started":
      return [{ value: "in_progress", label: WORKFLOW_LABELS.in_progress }];
    case "in_progress":
      return [
        { value: "paused", label: WORKFLOW_LABELS.paused },
        { value: "deferred", label: WORKFLOW_LABELS.deferred },
      ];
    case "paused":
      return [
        { value: "in_progress", label: WORKFLOW_LABELS.in_progress },
        { value: "complete", label: WORKFLOW_LABELS.complete },
      ];
    case "deferred":
      return [{ value: "in_progress", label: WORKFLOW_LABELS.in_progress }];
    case "complete":
      return [{ value: "in_progress", label: WORKFLOW_LABELS.in_progress }];
  }
}

export function workflowLabel(state: WorkflowState): string {
  return WORKFLOW_LABELS[state];
}
