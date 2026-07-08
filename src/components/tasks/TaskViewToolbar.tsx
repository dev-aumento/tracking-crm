import {
  Plus, Pin, LayoutGrid, List,
  Clock,
} from "lucide-react";
import { TaskRoleFilterDropdown } from "@/components/tasks/TaskRoleFilterDropdown";
import { TaskSearchFilterPanel } from "@/components/tasks/TaskSearchFilterPanel";
import type { TaskRoleFilter } from "@/lib/task-role-filter";
import type { TaskSearchFilters } from "@/lib/task-search-filter";

export type TaskView = "list" | "deadline";

const MAIN_TABS: { id: TaskView; label: string; icon: typeof LayoutGrid }[] = [
  { id: "list", label: "List", icon: List },
  { id: "deadline", label: "Deadline", icon: LayoutGrid },
];

const VIEW_TITLES: Record<TaskView, string> = {
  list: "List",
  deadline: "Deadline",
};

interface TaskViewToolbarProps {
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchFilters: TaskSearchFilters;
  onSearchFiltersChange: (filters: TaskSearchFilters) => void;
  onResetSearch: () => void;
  filterPanelOpen: boolean;
  onFilterPanelOpenChange: (open: boolean) => void;
  filterUsers: Array<{ id: number; name: string | null; avatar?: string | null }>;
  filterProjects?: Array<{ id: number; name: string }>;
  filterTasks?: Array<{ id: number; title: string; description?: string | null; status: string; assigneeId?: number | null; createdBy?: number | null; projectId?: number | null; participantIds?: number[]; observerIds?: number[]; assignee?: { name: string | null } | null }>;
  roleFilter: TaskRoleFilter;
  onRoleFilterChange: (value: TaskRoleFilter) => void;
  roleCounts: Record<TaskRoleFilter, number>;
  overdueCount: number;
  showOverdueOnly: boolean;
  onToggleOverdue: () => void;
  canCreate?: boolean;
  onCreateClick?: () => void;
  showRoleFilter?: boolean;
}

function CountBadge({ count, variant }: { count: number; variant: "blue" | "green" | "red" }) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
        variant === "red"
          ? "bg-red-500"
          : variant === "blue"
            ? "bg-[#2563EB]"
            : "bg-emerald-500"
      }`}
    >
      {count}
    </span>
  );
}

export function TaskViewToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  searchFilters,
  onSearchFiltersChange,
  onResetSearch,
  filterPanelOpen,
  onFilterPanelOpenChange,
  filterUsers,
  filterProjects = [],
  filterTasks = [],
  roleFilter,
  onRoleFilterChange,
  roleCounts,
  overdueCount,
  showOverdueOnly,
  onToggleOverdue,
  canCreate,
  onCreateClick,
  showRoleFilter = true,
}: TaskViewToolbarProps) {
  return (
    <div className="space-y-3">
      {/* Top row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-[100px]">
          <h2 className="text-lg font-semibold text-[#1F2937]">{VIEW_TITLES[view]}</h2>
          <Pin size={14} className="text-gray-400 rotate-45" />
        </div>

        {canCreate && onCreateClick && (
          <button
            type="button"
            onClick={onCreateClick}
            className="h-9 px-3 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 hover:shadow-md transition-all"
          >
            <Plus size={16} />
            Create
          </button>
        )}

        {showRoleFilter && (
          <TaskRoleFilterDropdown
            value={roleFilter}
            onChange={onRoleFilterChange}
            counts={roleCounts}
          />
        )}

        <TaskSearchFilterPanel
          open={filterPanelOpen}
          onOpenChange={onFilterPanelOpenChange}
          filters={searchFilters}
          onFiltersChange={onSearchFiltersChange}
          onReset={onResetSearch}
          users={filterUsers}
          projects={filterProjects}
          tasks={filterTasks}
          searchInput={search}
          onSearchInputChange={onSearchChange}
          showOverdueOnly={showOverdueOnly}
        />
      </div>

      {/* View tabs + filters — grouped on the left */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 p-1 bg-gray-100 border border-gray-200 rounded-xl">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-white text-[#1F2937] shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleOverdue}
          className={`flex items-center gap-2 h-9 px-3 rounded-xl text-sm font-medium border transition-all ${
            showOverdueOnly
              ? "bg-red-50 border-red-200 text-red-600"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white"
          }`}
        >
          <Clock size={14} />
          Overdue
          <CountBadge count={overdueCount} variant="red" />
        </button>
      </div>
    </div>
  );
}
