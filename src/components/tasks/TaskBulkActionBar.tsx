import { useState } from "react";
import { Trash2 } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "review" | "done";

interface TaskBulkActionBarProps {
  selectedCount: number;
  canBulkEdit: boolean;
  canBulkDelete: boolean;
  projects: Array<{ id: number; name: string }>;
  excludeProjectId?: number;
  isPending?: boolean;
  onChangeStatus: (status: TaskStatus) => void;
  onMoveProject: (projectId: number | null) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function TaskBulkActionBar({
  selectedCount,
  canBulkEdit,
  canBulkDelete,
  projects,
  excludeProjectId,
  isPending,
  onChangeStatus,
  onMoveProject,
  onDelete,
  onClear,
}: TaskBulkActionBarProps) {
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>("todo");
  const [bulkMoveProjectId, setBulkMoveProjectId] = useState<number | null>(null);

  if (selectedCount === 0 || (!canBulkEdit && !canBulkDelete)) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
      <span className="text-sm font-medium text-[#1F2937]">
        {selectedCount} selected
      </span>

      {canBulkEdit ? (
        <>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as TaskStatus)}
            className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onChangeStatus(bulkStatus)}
            className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Change status
          </button>

          <select
            value={bulkMoveProjectId ?? ""}
            onChange={(e) =>
              setBulkMoveProjectId(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white max-w-[200px]"
          >
            <option value="">Move to project…</option>
            {projects
              .filter((p) => p.id !== excludeProjectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            <option value="-1">No project</option>
          </select>
          <button
            type="button"
            disabled={isPending || bulkMoveProjectId === null}
            onClick={() =>
              onMoveProject(bulkMoveProjectId === -1 ? null : bulkMoveProjectId)
            }
            className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Move
          </button>
        </>
      ) : null}

      {canBulkDelete ? (
        <button
          type="button"
          disabled={isPending}
          onClick={onDelete}
          className="h-9 px-3 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Trash2 size={14} />
          Delete
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        className="h-9 px-3 text-sm text-gray-600 hover:text-gray-800"
      >
        Clear
      </button>
    </div>
  );
}
