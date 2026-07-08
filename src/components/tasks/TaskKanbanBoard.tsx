import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { GripVertical, Plus, Loader2, Calendar, Clock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EdgeScrollArea } from "@/components/shared/EdgeScrollArea";
import {
  isTaskDueToday,
  isTaskOverdue,
  trackedSecondsFromHours,
} from "@/lib/task-deadline";
import { formatDurationClock } from "@/lib/utils";
import { invalidateProjectStats } from "@/lib/project-stats";
import {
  PROJECT_PIPELINE_STAGES,
  type ProjectPipelineStageKey,
  contrastingTextOnColor,
  taskPipelineStage,
} from "@/lib/task-kanban";

const COLUMNS = PROJECT_PIPELINE_STAGES;

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
  return new Date(dueDate).toLocaleString("en-US", {
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
  onDragStart,
  onDragEnd,
  onClick,
}: {
  task: KanbanTask;
  draggedTask: number | null;
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
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`bg-white rounded-lg p-3.5 cursor-grab active:cursor-grabbing transition-shadow border-2 ${borderClass} ${
        draggedTask === task.id ? "opacity-50" : ""
      }`}
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

interface TaskKanbanBoardProps {
  tasks: KanbanTask[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
  canCreate?: boolean;
  projectId?: number;
  onCreateClick?: (stage: ProjectPipelineStageKey) => void;
}

export function TaskKanbanBoard({
  tasks,
  isLoading,
  onTaskClick,
  canCreate = true,
  projectId,
  onCreateClick,
}: TaskKanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const didDragRef = useRef(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const listInput = projectId ? { projectId, limit: 200 } : { limit: 200 };

  const updateMutation = trpc.task.update.useMutation({
    onMutate: async ({ id, stage }) => {
      if (!stage) return {};
      await utils.task.list.cancel(listInput);
      const previous = utils.task.list.getData(listInput);
      if (previous) {
        utils.task.list.setData(listInput, {
          ...previous,
          tasks: previous.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  stage,
                  status: stage === "finished" ? "done" : t.status === "done" ? "in_progress" : t.status,
                }
              : t,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.task.list.setData(listInput, context.previous);
      }
    },
    onSettled: () => {
      utils.task.list.invalidate();
      utils.task.getById.invalidate();
      utils.dashboard.getStats.invalidate();
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
        stage: columnKey as ProjectPipelineStageKey,
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

  const tasksByColumn = (columnKey: string) =>
    tasks.filter((t) => taskPipelineStage(t) === columnKey);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const boardMinHeight = "min-h-[calc(100vh-15rem)]";

  return (
    <EdgeScrollArea className={boardMinHeight}>
      <div className={`flex gap-3 w-max min-w-full pb-1 items-stretch ${boardMinHeight}`}>
      {COLUMNS.map((column) => {
        const columnTasks = tasksByColumn(column.key);
        const isDragOver = dragOverColumn === column.key;
        const headerTextColor = contrastingTextOnColor(column.color);
        const countBadgeClass =
          headerTextColor === "#FFFFFF"
            ? "bg-white/25 text-white"
            : "bg-black/10 text-gray-800";

        return (
            <div
              key={column.key}
              className={`w-[260px] shrink-0 bg-gray-50/80 border-2 rounded-xl flex flex-col h-full overflow-hidden ${boardMinHeight} transition-colors ${
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
              className="flex items-center justify-between px-3 py-3 shrink-0"
              style={{ backgroundColor: column.color }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-sm font-semibold truncate"
                  style={{ color: headerTextColor }}
                >
                  {column.label}
                </span>
                <span
                  className={`text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shrink-0 ${countBadgeClass}`}
                >
                  {columnTasks.length}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col p-2.5 min-h-0">
              <div className="flex-1 space-y-2.5">
              <AnimatePresence mode="sync">
                {columnTasks.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    draggedTask={draggedTask}
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

              {canCreate && onCreateClick && (
                <div className="shrink-0 pt-2">
                  <button
                    type="button"
                    onClick={() => onCreateClick(column.key as ProjectPipelineStageKey)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add Task
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </EdgeScrollArea>
  );
}
