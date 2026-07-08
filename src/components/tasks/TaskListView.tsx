import { UserAvatar } from "@/components/shared/UserAvatar";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { isTaskOverdue } from "@/lib/task-deadline";
import { ClipboardList, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type ListTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  createdAt?: string | Date | null;
  dueDate?: string | Date | null;
  project?: { id: number; name: string; color?: string | null } | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
  creator?: { name: string | null; avatar?: string | null } | null;
};

function formatListDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TaskListViewProps {
  tasks: ListTask[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
  emptyMessage?: string;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleSelectAll?: () => void;
}

/** Full-width grid — columns grow evenly to fill the row */
const GRID_WITH_CHECKBOX =
  "grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(5.5rem,0.75fr)]";
const GRID_WITHOUT_CHECKBOX =
  "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(5.5rem,0.75fr)]";

export function TaskListView({
  tasks,
  isLoading,
  onTaskClick,
  emptyMessage = "No tasks found",
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: TaskListViewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <ClipboardList size={36} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  const allSelected =
    selectable &&
    selectedIds &&
    tasks.length > 0 &&
    tasks.every((task) => selectedIds.has(task.id));

  const gridCols = selectable ? GRID_WITH_CHECKBOX : GRID_WITHOUT_CHECKBOX;
  const rowClass = `w-full grid ${gridCols} gap-x-6 gap-y-2 px-5 items-center`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
      <div className={`${rowClass} py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider`}>
        {selectable ? (
          <span className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/30"
              aria-label="Select all tasks"
            />
          </span>
        ) : null}
        <span>Task</span>
        <span>Project</span>
        <span>Assignee</span>
        <span>Created by</span>
        <span>Created</span>
        <span>Due Date</span>
        <span>Priority</span>
      </div>

      {tasks.map((task, i) => {
        const overdue = isTaskOverdue(task);
        const isSelected = selectable && selectedIds?.has(task.id);

        return (
          <motion.div
            key={task.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            className={`${rowClass} py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left cursor-pointer ${
              isSelected ? "bg-blue-50/40" : ""
            }`}
            onClick={() => onTaskClick(task.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTaskClick(task.id);
              }
            }}
          >
            {selectable ? (
              <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect?.(task.id)}
                  className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/30"
                  aria-label={`Select ${task.title}`}
                />
              </div>
            ) : null}

            <div className="min-w-0 pr-2">
              <div className="text-sm font-medium text-[#1F2937] truncate">{task.title}</div>
            </div>

            <div className="min-w-0 pr-2">
              {task.project ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 min-w-0 w-full">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: task.project.color ?? "#2563EB" }}
                  />
                  <span className="truncate">{task.project.name}</span>
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 pr-2">
              {task.assignee ? (
                <>
                  <UserAvatar name={task.assignee.name} avatar={task.assignee.avatar} size={22} />
                  <span className="text-xs text-gray-600 truncate">{task.assignee.name}</span>
                </>
              ) : (
                <span className="text-xs text-gray-400">Unassigned</span>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 pr-2">
              {task.creator ? (
                <>
                  <UserAvatar name={task.creator.name} avatar={task.creator.avatar} size={22} />
                  <span className="text-xs text-gray-600 truncate">{task.creator.name}</span>
                </>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>

            <div className="text-xs text-gray-500 whitespace-nowrap">
              {formatListDate(task.createdAt)}
            </div>

            <div
              className={`text-xs whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}
            >
              {formatListDate(task.dueDate)}
            </div>

            <div className="flex items-center">
              <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
