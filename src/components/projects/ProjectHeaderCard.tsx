import { Calendar, CheckSquare, Clock, Users, Plus, Pencil, Trash2, UserPlus, Loader2 } from "lucide-react";

type ProjectStats = {
  total: number;
};


function formatDueDate(value?: string | Date | null) {
  if (!value) return "No due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No due date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ProjectHeaderCardProps {
  name: string;
  description?: string | null;
  status: string;
  dueDate?: string | Date | null;
  stats: ProjectStats;
  hoursTracked: number;
  memberCount: number;
  creatorName?: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddTask?: () => void;
  onJoinProject?: () => void;
  joinPending?: boolean;
  canViewTasks?: boolean;
}

export function ProjectHeaderCard({
  name,
  description,
  status,
  dueDate,
  stats,
  hoursTracked,
  memberCount,
  creatorName,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onAddTask,
  onJoinProject,
  joinPending,
  canViewTasks = true,
}: ProjectHeaderCardProps) {
  const total = canViewTasks ? stats.total || 0 : 0;
  const trackedHours = canViewTasks ? hoursTracked : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-[#1F2937]">{name}</h1>
          </div>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onJoinProject ? (
            <button
              type="button"
              onClick={onJoinProject}
              disabled={joinPending}
              className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] flex items-center gap-2 disabled:opacity-50"
            >
              {joinPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              Join Project
            </button>
          ) : null}
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="h-9 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <Pencil size={14} />
              Edit Project
            </button>
          )}
          {onAddTask && (
            <button
              type="button"
              onClick={onAddTask}
              className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] flex items-center gap-2"
            >
              <Plus size={16} />
              Add Task
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 text-sm text-gray-500 mb-5">
        {creatorName ? (
          <span className="flex items-center gap-1.5">
            <Users size={15} className="text-gray-400" />
            Created by {creatorName}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <Calendar size={15} className="text-gray-400" />
          Due {formatDueDate(dueDate)}
        </span>
        <span className="flex items-center gap-1.5">
          <CheckSquare size={15} className="text-gray-400" />
          {canViewTasks ? `${total} tasks` : "Join to view tasks"}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={15} className="text-gray-400" />
          {canViewTasks ? `${trackedHours}h tracked` : "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <Users size={15} className="text-gray-400" />
          {memberCount} members
        </span>
      </div>

      {canDelete && onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
        >
          <Trash2 size={15} />
          Delete Project
        </button>
      ) : null}
    </div>
  );
}
