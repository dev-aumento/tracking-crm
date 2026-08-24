import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { GripVertical, Plus, Loader2, Calendar, Clock, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EdgeScrollArea } from "@/components/shared/EdgeScrollArea";
import {
  formatDueLabel,
  isTaskDueToday,
  isTaskOverdue,
  trackedSecondsFromHours,
} from "@/lib/task-deadline";
import { formatDurationClock } from "@/lib/utils";
import { invalidateProjectStats } from "@/lib/project-stats";
import { applyOptimisticTaskUpdate } from "@/lib/task-cache";
import { refreshDashboardStats } from "@/lib/dashboard-refresh";
import { taskLocateHighlightClass } from "@/hooks/useLocateTaskInView";
import { cn } from "@/lib/utils";
import {
  PROJECT_PIPELINE_STAGES,
  contrastingTextOnColor,
  isPipelineStageDeletable,
  tasksForPipelineColumn,
  withOrphanPipelineStages,
  type PipelineStageDef,
  type ProjectPipelineStageKey,
} from "@/lib/task-kanban";

type KanbanTask = {
  id: number;
  title: string;
  status: string;
  stage?: string | null;
  priority: string;
  dueDate?: string | Date | null;
  estimatedHours?: string | number | null;
  actualHours?: string | number | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

function formatKanbanDeadline(dueDate: string | Date) {
  return formatDueLabel(dueDate, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatKanbanHours(
  estimated?: string | number | null,
  actual?: string | number | null,
) {
  const trackedSeconds = trackedSecondsFromHours(
    actual != null ? String(actual) : null,
  );
  if (trackedSeconds > 0) {
    return formatDurationClock(trackedSeconds);
  }

  const estimatedHours = parseFloat(String(estimated ?? "0"));
  if (!Number.isNaN(estimatedHours) && estimatedHours > 0) {
    const rounded = Number.isInteger(estimatedHours)
      ? String(estimatedHours)
      : estimatedHours.toFixed(1);
    return `${rounded}h est`;
  }

  return "0h";
}

function KanbanTaskCard({
  task,
  draggedTask,
  isHighlighted,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  task: KanbanTask;
  draggedTask: number | null;
  isHighlighted?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const overdue = isTaskOverdue(task);
  const dueToday = isTaskDueToday(task);
  const hoursLabel = formatKanbanHours(task.estimatedHours, task.actualHours);

  const borderClass = overdue
    ? "border-red-500 hover:border-red-600 hover:shadow-md shadow-sm shadow-red-100"
    : dueToday
      ? "border-amber-500 hover:border-amber-600 hover:shadow-md shadow-sm shadow-amber-100"
      : "border-gray-200 hover:shadow-md";

  const deadlineClass = overdue
    ? "text-red-600 font-medium"
    : dueToday
      ? "text-amber-600 font-medium"
      : task.dueDate
        ? "text-gray-600"
        : "text-gray-400";

  return (
    <motion.div
      draggable
      data-task-locate-id={task.id}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg p-3.5 cursor-grab active:cursor-grabbing transition-shadow border-2",
        borderClass,
        draggedTask === task.id && "opacity-50",
        isHighlighted && taskLocateHighlightClass,
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 pointer-events-none" />
        <span className="text-sm font-medium text-[#1F2937] leading-snug">{task.title}</span>
      </div>

      <div className="flex items-center gap-2 mb-2.5">
        <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} size="sm" />
      </div>

      <div className="flex items-center gap-2 mb-2.5 min-h-[22px]">
        {task.assignee ? (
          <>
            <UserAvatar name={task.assignee.name} avatar={task.assignee.avatar} size={22} />
            <span className="text-xs text-gray-600 truncate">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-[11px] text-gray-400">Unassigned</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-gray-100 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar size={12} className="shrink-0 text-gray-400" />
          <span className={`truncate ${deadlineClass}`}>
            {task.dueDate ? formatKanbanDeadline(task.dueDate) : "No deadline"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <Clock size={12} className="shrink-0 text-gray-400" />
          <span className="font-mono tabular-nums text-gray-600 truncate">{hoursLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}

type TaskListQueryInput = {
  limit: number;
  projectId?: number;
  assigneeId?: number;
};

interface TaskKanbanBoardProps {
  tasks: KanbanTask[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
  canCreate?: boolean;
  projectId?: number;
  listQueryInput?: TaskListQueryInput;
  onCreateClick?: (stage: ProjectPipelineStageKey) => void;
  highlightedTaskId?: number | null;
  /** Pipeline columns (defaults + project custom sections). */
  stages?: PipelineStageDef[];
  /** Show "New section" column (project board only). */
  canAddSection?: boolean;
  onAddSection?: (label: string) => Promise<void> | void;
  addingSection?: boolean;
  /** Rename column label only (stage key stays the same). */
  canRenameSection?: boolean;
  onRenameSection?: (key: string, label: string) => Promise<void> | void;
  renamingSection?: boolean;
  canDeleteSection?: boolean;
  onDeleteSection?: (key: string) => Promise<void> | void;
  deletingSection?: boolean;
  canReorderSection?: boolean;
  onReorderSection?: (key: string, direction: "left" | "right") => Promise<void> | void;
  reorderingSection?: boolean;
}

export function TaskKanbanBoard({
  tasks,
  isLoading,
  onTaskClick,
  canCreate = true,
  projectId,
  listQueryInput,
  onCreateClick,
  highlightedTaskId = null,
  stages = PROJECT_PIPELINE_STAGES.map((s) => ({ ...s })),
  canAddSection = false,
  onAddSection,
  addingSection = false,
  canRenameSection = false,
  onRenameSection,
  renamingSection = false,
  canDeleteSection = false,
  onDeleteSection,
  deletingSection = false,
  canReorderSection = false,
  onReorderSection,
  reorderingSection = false,
}: TaskKanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const didDragRef = useRef(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState("");
  const newSectionInputRef = useRef<HTMLInputElement>(null);
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const listInput =
    listQueryInput ?? (projectId ? { projectId, limit: 200 } : { limit: 200 });

  const updateMutation = trpc.task.update.useMutation({
    onMutate: async (input) => {
      const current = tasks.find((task) => task.id === input.id);
      if (!current) return {};
      const previous = utils.task.list.getData(listInput);
      await applyOptimisticTaskUpdate(utils, current, input);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.task.list.setData(listInput, context.previous);
      }
      void refreshDashboardStats(utils);
    },
    onSettled: async () => {
      await Promise.all([
        utils.task.list.invalidate(),
        utils.task.getById.invalidate(),
        refreshDashboardStats(utils),
      ]);
      invalidateProjectStats(utils, projectId);
    },
  });

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.stopPropagation();
    didDragRef.current = true;
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDragOverColumn(columnKey);
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    if (draggedTask) {
      updateMutation.mutate({
        id: draggedTask,
        stage: columnKey,
      });
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
    requestAnimationFrame(() => {
      didDragRef.current = false;
    });
  };

  const submitNewSection = async () => {
    const label = newSectionLabel.trim();
    if (!label || !onAddSection || addingSection) return;
    await onAddSection(label);
    setNewSectionLabel("");
    setIsAddingSection(false);
  };

  const beginRename = (column: PipelineStageDef) => {
    if (!canRenameSection || !onRenameSection || renamingSection) return;
    setEditingColumnKey(column.key);
    setEditingLabel(column.label);
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const cancelRename = () => {
    setEditingColumnKey(null);
    setEditingLabel("");
  };

  const tasksByColumn = (columnKey: string) => tasksForPipelineColumn(tasks, columnKey);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const boardHeightClass = "h-[calc(100vh-12.5rem)] !overflow-y-hidden";
  const columns = withOrphanPipelineStages(stages, tasks);

  const submitRename = async () => {
    if (!editingColumnKey || !onRenameSection || renamingSection) return;
    const label = editingLabel.trim();
    const current = columns.find((c) => c.key === editingColumnKey);
    if (!label || !current || label === current.label) {
      cancelRename();
      return;
    }
    await onRenameSection(editingColumnKey, label);
    cancelRename();
  };

  const handleDeleteSection = async (column: PipelineStageDef) => {
    if (!canDeleteSection || !onDeleteSection || deletingSection) return;
    if (!isPipelineStageDeletable(column.key)) return;
    const count = tasksByColumn(column.key).length;
    const message =
      count > 0
        ? `Delete "${column.label}"? ${count} task(s) in this section will move to To Do.`
        : `Delete "${column.label}"?`;
    if (!window.confirm(message)) return;
    await onDeleteSection(column.key);
  };

  const handleReorderSection = async (
    column: PipelineStageDef,
    direction: "left" | "right",
  ) => {
    if (!canReorderSection || !onReorderSection || reorderingSection) return;
    await onReorderSection(column.key, direction);
  };

  return (
    <EdgeScrollArea className={boardHeightClass} showScrollbar>
      <div className="flex gap-3 w-max min-w-full pb-2 items-stretch h-full">
      {columns.map((column, columnIndex) => {
        const columnTasks = tasksByColumn(column.key);
        const isDragOver = dragOverColumn === column.key;
        const headerTextColor = contrastingTextOnColor(column.color);
        const countBadgeClass =
          headerTextColor === "#FFFFFF"
            ? "bg-white/25 text-white"
            : "bg-black/10 text-gray-800";
        const canMoveLeft = canReorderSection && onReorderSection && columnIndex > 0;
        const canMoveRight =
          canReorderSection && onReorderSection && columnIndex < columns.length - 1;
        const showReorderControls = Boolean(canReorderSection && onReorderSection);

        return (
            <div
              key={column.key}
              className={`w-[260px] shrink-0 bg-gray-50/80 border-2 rounded-xl flex flex-col h-full overflow-hidden transition-colors ${
                isDragOver ? "border-[#2563EB]/40 bg-blue-50/50" : "border-dashed border-gray-200"
              }`}
              onDragOver={(e) => handleDragOver(e, column.key)}
              onDrop={(e) => handleDrop(e, column.key)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverColumn(null);
                }
              }}
            >
            <div
              className={cn(
                "group/header flex items-center justify-between px-3 py-3 shrink-0 gap-1",
              )}
              style={{ backgroundColor: column.color }}
            >
              {showReorderControls ? (
                <button
                  type="button"
                  onClick={() => void handleReorderSection(column, "left")}
                  disabled={!canMoveLeft || reorderingSection}
                  className={cn(
                    "shrink-0 p-1 rounded-md transition-opacity",
                    "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
                    canMoveLeft && !reorderingSection
                      ? "hover:bg-black/10"
                      : "group-hover/header:opacity-35 cursor-not-allowed",
                  )}
                  aria-label={`Move ${column.label} left`}
                  title="Move left"
                >
                  <ChevronLeft size={14} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {editingColumnKey === column.key ? (
                  <input
                    ref={renameInputRef}
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void submitRename()}
                    disabled={renamingSection}
                    className="h-7 min-w-0 flex-1 rounded-md border border-white/40 bg-white/95 px-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-white/60"
                    aria-label="Rename section"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => beginRename(column)}
                    disabled={!canRenameSection || !onRenameSection}
                    title={canRenameSection ? "Click to rename" : undefined}
                    className={cn(
                      "text-sm font-semibold truncate text-left min-w-0",
                      canRenameSection && onRenameSection
                        ? "hover:underline decoration-white/50 cursor-text"
                        : "cursor-default",
                    )}
                    style={{ color: headerTextColor }}
                  >
                    {column.label}
                  </button>
                )}
                <span
                  className={`text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shrink-0 ${countBadgeClass}`}
                >
                  {columnTasks.length}
                </span>
              </div>
              {canRenameSection && onRenameSection && editingColumnKey !== column.key ? (
                <button
                  type="button"
                  onClick={() => beginRename(column)}
                  className="shrink-0 p-1 rounded-md opacity-80 hover:opacity-100 hover:bg-black/10"
                  aria-label={`Rename ${column.label}`}
                  title="Rename section"
                >
                  <Pencil size={12} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              {canDeleteSection &&
              onDeleteSection &&
              isPipelineStageDeletable(column.key) &&
              editingColumnKey !== column.key ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteSection(column)}
                  disabled={deletingSection}
                  className="shrink-0 p-1 rounded-md opacity-80 hover:opacity-100 hover:bg-black/10"
                  aria-label={`Delete ${column.label}`}
                  title="Delete section"
                >
                  <Trash2 size={12} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              {showReorderControls ? (
                <button
                  type="button"
                  onClick={() => void handleReorderSection(column, "right")}
                  disabled={!canMoveRight || reorderingSection}
                  className={cn(
                    "shrink-0 p-1 rounded-md transition-opacity",
                    "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
                    canMoveRight && !reorderingSection
                      ? "hover:bg-black/10"
                      : "group-hover/header:opacity-35 cursor-not-allowed",
                  )}
                  aria-label={`Move ${column.label} right`}
                  title="Move right"
                >
                  <ChevronRight size={14} style={{ color: headerTextColor }} />
                </button>
              ) : null}
            </div>

            {canCreate && onCreateClick && (
              <div className="shrink-0 px-2.5 pt-2 pb-1 border-b border-gray-200/80 bg-white/60">
                <button
                  type="button"
                  onClick={() => onCreateClick(column.key)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-[#2563EB] hover:bg-blue-50/80 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Task
                </button>
              </div>
            )}

            <div className="flex-1 flex flex-col p-2.5 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-thin">
              <div className="space-y-2.5">
              <AnimatePresence mode="sync">
                {columnTasks.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    draggedTask={draggedTask}
                    isHighlighted={highlightedTaskId === task.id}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (!didDragRef.current) onTaskClick(task.id);
                    }}
                  />
                ))}
              </AnimatePresence>

              {columnTasks.length === 0 && isDragOver && (
                <p className="text-xs text-[#2563EB] text-center py-8">Drop here</p>
              )}
              </div>
            </div>
          </div>
        );
      })}

      {canAddSection && onAddSection ? (
        <div className="w-[260px] shrink-0 rounded-xl border-2 border-dashed border-[#2563EB]/45 bg-blue-50/40 flex flex-col h-full min-h-[220px] overflow-hidden">
          <div className="px-3 py-3 shrink-0 bg-[#2563EB] text-white">
            <span className="text-sm font-semibold">New Section</span>
          </div>
          {isAddingSection ? (
            <div className="p-3 flex flex-col gap-2 bg-white/80 flex-1">
              <input
                ref={newSectionInputRef}
                autoFocus
                value={newSectionLabel}
                onChange={(e) => setNewSectionLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitNewSection();
                  }
                  if (e.key === "Escape") {
                    setIsAddingSection(false);
                    setNewSectionLabel("");
                  }
                }}
                placeholder="Section name"
                disabled={addingSection}
                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitNewSection()}
                  disabled={!newSectionLabel.trim() || addingSection}
                  className="h-8 px-3 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {addingSection ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSection(false);
                    setNewSectionLabel("");
                  }}
                  disabled={addingSection}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAddingSection(true);
                requestAnimationFrame(() => newSectionInputRef.current?.focus());
              }}
              className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 text-[#2563EB] hover:bg-blue-50 transition-colors bg-white/70"
            >
              <Plus size={22} />
              <span className="text-sm font-semibold">Add New Section</span>
              <span className="text-[11px] text-gray-500 text-center px-2">
                Creates a status column for this project
              </span>
            </button>
          )}
        </div>
      ) : null}
      </div>
    </EdgeScrollArea>
  );
}
