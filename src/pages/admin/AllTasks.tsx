import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskViewToolbar, type TaskView } from "@/components/tasks/TaskViewToolbar";
import { TaskSearchFilterPanel } from "@/components/tasks/TaskSearchFilterPanel";
import {
  CreateTaskModal,
  createEmptyTaskForm,
  type CreateTaskFormData,
} from "@/components/tasks/CreateTaskModal";
import {
  applyTaskSearchFilters,
  DEFAULT_TASK_SEARCH_FILTERS,
  type TaskSearchFilters,
} from "@/lib/task-search-filter";
import { canCreateTask, tryOpenCreateTask } from "@/lib/create-task-permission";
import { getTaskBulkPermissions } from "@/lib/task-bulk-permissions";
import { submitCreateTask } from "@/lib/submit-create-task";
import { resetStagingMediaIds } from "@/lib/staged-task-media";
import { TaskBulkActionBar } from "@/components/tasks/TaskBulkActionBar";
import { invalidateProjectStats } from "@/lib/project-stats";
import { invalidateTaskQueries } from "@/lib/invalidate-on-notifications";
import {
  buildAllTasksViewPath,
  parseActivityIdParam,
  parseTaskKeyParam,
} from "@/lib/task-notification-link";
import { useLocateTaskInView } from "@/hooks/useLocateTaskInView";
import { ListPaginationControls } from "@/components/shared/ListPaginationControls";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { LIST_PAGE_SIZE, paginateItems } from "@/lib/list-pagination";
import type { ProjectPipelineStageKey } from "@/lib/task-kanban";
import { Check, ChevronDown, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const VALID_VIEWS: TaskView[] = ["list", "kanban"];

function parseView(raw: string | null): TaskView {
  if (raw === "deadline" || raw === "planner" || raw === "calendar" || raw === "gantt" || raw === "observer") {
    return "kanban";
  }
  if (raw && VALID_VIEWS.includes(raw as TaskView)) return raw as TaskView;
  return "list";
}

type AdminTaskRow = {
  id: number;
  title: string;
  status: string;
  stage?: string | null;
  priority: string;
  assigneeId?: number | null;
  createdBy?: number | null;
  projectId?: number | null;
  participantIds?: number[];
  observerIds?: number[];
  dueDate?: string | Date | null;
  project?: { id: number; name: string } | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
  creator?: { name: string | null; avatar?: string | null } | null;
};

export default function AdminAllTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { taskKey } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const listInput = useMemo(() => ({ limit: 200 }), []);
  const [search, setSearch] = useState("");
  const [taskFilters, setTaskFilters] = useState<TaskSearchFilters>(DEFAULT_TASK_SEARCH_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateTaskFormData>(() => createEmptyTaskForm());
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const highlightActivityId = useMemo(
    () => parseActivityIdParam(searchParams.get("activity")),
    [searchParams],
  );

  useEffect(() => {
    const fromKey = parseTaskKeyParam(taskKey);
    if (fromKey) {
      setSelectedTask(fromKey);
      return;
    }

    const taskParam = searchParams.get("task");
    if (taskParam) {
      const id = Number(taskParam);
      if (Number.isFinite(id) && id > 0) {
        const activity = parseActivityIdParam(searchParams.get("activity"));
        navigate(buildAllTasksViewPath(id, activity), { replace: true });
        return;
      }
    }

    setSelectedTask(null);
  }, [taskKey, searchParams, navigate]);

  useEffect(() => {
    const legacyView = searchParams.get("view");
    if (
      legacyView === "deadline" ||
      legacyView === "planner" ||
      legacyView === "calendar" ||
      legacyView === "gantt" ||
      legacyView === "observer"
    ) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "kanban");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const setView = (next: TaskView) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("view", next);
      return p;
    });
  };

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.task.list.useQuery(listInput, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.listForPicker.useQuery();

  const addParticipantMutation = trpc.task.addParticipant.useMutation();
  const addObserverMutation = trpc.task.addObserver.useMutation();
  const createMutation = trpc.task.create.useMutation();
  const updateMutation = trpc.task.update.useMutation();
  const createSubtaskMutation = trpc.subtask.create.useMutation();
  const addCommentMutation = trpc.task.addComment.useMutation();
  const addAttachmentMutation = trpc.task.addAttachment.useMutation();

  const bulkActionMutation = trpc.task.bulkAction.useMutation({
    onSuccess: async () => {
      setSelectedIds(new Set());
      await invalidateTaskQueries(utils);
      invalidateProjectStats(utils);
    },
  });

  const canCreate = canCreateTask(user);
  const { canBulkEdit, canBulkDelete, taskSelectionEnabled } = getTaskBulkPermissions(user);

  const allTasks = (data?.tasks ?? []) as AdminTaskRow[];

  const searchContext = useMemo(
    () => ({
      users: usersData?.users ?? [],
      projects: (projectsData ?? []).map((p) => ({ id: p.id, name: p.name })),
    }),
    [usersData?.users, projectsData],
  );

  const filteredTasks = useMemo(() => {
    let result = applyTaskSearchFilters(
      allTasks,
      { ...taskFilters, text: search },
      searchContext,
    );

    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (priorityFilter) {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    if (projectFilter) {
      const projectId = Number(projectFilter);
      result = result.filter((t) => t.projectId === projectId || t.project?.id === projectId);
    }

    return result;
  }, [allTasks, taskFilters, search, searchContext, statusFilter, priorityFilter, projectFilter]);

  const taskPagination = useMemo(
    () => paginateItems(filteredTasks, page, LIST_PAGE_SIZE),
    [filteredTasks, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search, taskFilters, statusFilter, priorityFilter, projectFilter, view]);

  useEffect(() => {
    if (page > taskPagination.totalPages) {
      setPage(taskPagination.totalPages);
    }
  }, [page, taskPagination.totalPages]);

  const paginatedTasks = taskPagination.items;

  const { highlightedTaskId, locateTask } = useLocateTaskInView([
    view,
    filteredTasks.length,
    search,
    taskFilters,
    statusFilter,
    priorityFilter,
    projectFilter,
  ]);

  const handleTaskSearchSelect = useCallback(
    (taskId: number) => {
      const task = allTasks.find((t) => t.id === taskId);
      if (task) {
        setSearch(task.title);
      }
      setPage(1);
      locateTask(taskId);
    },
    [allTasks, locateTask],
  );

  const resetSearch = () => {
    setSearch("");
    setTaskFilters(DEFAULT_TASK_SEARCH_FILTERS);
  };

  const projectOptions = useMemo(
    () =>
      [...(projectsData ?? [])]
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projectsData],
  );

  const selectedProjectLabel = useMemo(() => {
    if (!projectFilter) return "All Projects";
    return (
      projectOptions.find((p) => String(p.id) === projectFilter)?.name ?? "All Projects"
    );
  }, [projectFilter, projectOptions]);

  const hasExtraFilters = statusFilter || priorityFilter || projectFilter;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = paginatedTasks.map((t) => t.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const runBulkAction = (
    action: "delete" | "status" | "move_project",
    extra?: { status?: "todo" | "in_progress" | "review" | "done"; projectId?: number | null },
  ) => {
    if (selectedIds.size === 0) return;
    bulkActionMutation.mutate({
      taskIds: [...selectedIds],
      action,
      ...extra,
    });
  };

  const openTask = (id: number) => {
    navigate(buildAllTasksViewPath(id));
  };

  const closeTask = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    next.delete("activity");
    const qs = next.toString();
    navigate(`/admin/tasks${qs ? `?${qs}` : ""}`);
  };

  const clearActivityHighlight = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("activity");
      return next;
    }, { replace: true });
  };

  const openCreateModal = (stage?: ProjectPipelineStageKey) => {
    tryOpenCreateTask(user, () => {
      setFormData(
        createEmptyTaskForm({
          assigneeId: user?.id,
          ownerId: user?.id,
          stage: stage ?? "new",
        }),
      );
      setShowCreateModal(true);
    });
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setFormData(createEmptyTaskForm());
    resetStagingMediaIds();
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) return;

    const tasksById = new Map(allTasks.map((t) => [t.id, t.title]));

    setIsCreating(true);
    try {
      await submitCreateTask({
        formData,
        createMutation,
        addParticipantMutation,
        addObserverMutation,
        updateMutation,
        createSubtaskMutation,
        addCommentMutation,
        addAttachmentMutation,
        tasksById,
      });

      await utils.task.list.invalidate();
      closeCreateModal();
    } catch (error) {
      console.error("Failed to create task:", error);
      window.alert(error instanceof Error ? error.message : "Failed to create task. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">All Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredTasks.length} of {data?.total ?? allTasks.length} tasks across all projects
            {view === "list" && filteredTasks.length > LIST_PAGE_SIZE
              ? ` · page ${taskPagination.page} of ${taskPagination.totalPages}`
              : ""}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] flex items-center gap-2 shrink-0"
          >
            <Plus size={16} />
            Add Task
          </button>
        ) : null}
      </div>

      {/* <TaskViewToolbar view={view} onViewChange={setView} /> */}

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <TaskSearchFilterPanel
          open={filterPanelOpen}
          onOpenChange={setFilterPanelOpen}
          filters={taskFilters}
          onFiltersChange={setTaskFilters}
          onReset={resetSearch}
          users={usersData?.users ?? []}
          projects={(projectsData ?? []).map((p) => ({ id: p.id, name: p.name }))}
          tasks={allTasks}
          searchInput={search}
          onSearchInputChange={setSearch}
          onTaskSelect={handleTaskSearchSelect}
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: "All Statuses" },
            { value: "todo", label: "To Do" },
            { value: "in_progress", label: "In Progress" },
            { value: "review", label: "Review" },
            { value: "done", label: "Done" },
          ]}
          aria-label="Filter by status"
          triggerClassName="h-9 bg-gray-50"
        />
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={[
            { value: "", label: "All Priorities" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
          aria-label="Filter by priority"
          triggerClassName="h-9 bg-gray-50"
        />
        <Popover open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "h-9 max-w-[240px] min-w-[160px] px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm inline-flex items-center gap-2 hover:bg-gray-100",
                projectFilter && "border-[#2563EB]/40 bg-blue-50/50",
              )}
              aria-label="Filter by project"
            >
              <span className="truncate text-left flex-1">{selectedProjectLabel}</span>
              <ChevronDown size={14} className="shrink-0 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[280px] p-0 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
            sideOffset={6}
          >
            <Command>
              <CommandInput placeholder="Search projects…" />
              <CommandList>
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all projects"
                    onSelect={() => {
                      setProjectFilter("");
                      setProjectFilterOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      size={14}
                      className={cn(
                        "shrink-0 text-[#2563EB]",
                        projectFilter ? "opacity-0" : "opacity-100",
                      )}
                    />
                    <span>All Projects</span>
                  </CommandItem>
                  {projectOptions.map((project) => {
                    const selected = projectFilter === String(project.id);
                    return (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        onSelect={() => {
                          setProjectFilter(String(project.id));
                          setProjectFilterOpen(false);
                        }}
                        className="gap-2"
                      >
                        <Check
                          size={14}
                          className={cn(
                            "shrink-0 text-[#2563EB]",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{project.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {hasExtraFilters && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setPriorityFilter("");
              setProjectFilter("");
            }}
            className="h-9 px-3 text-sm text-gray-500 hover:text-[#2563EB]"
          >
            Clear filters
          </button>
        )}
      </div>

      {view === "list" && (
        <>
          <TaskBulkActionBar
            selectedCount={selectedIds.size}
            canBulkEdit={canBulkEdit}
            canBulkDelete={canBulkDelete}
            projects={(projectsData ?? []).map((p) => ({ id: p.id, name: p.name }))}
            isPending={bulkActionMutation.isPending}
            onChangeStatus={(status) => runBulkAction("status", { status })}
            onMoveProject={(projectId) => runBulkAction("move_project", { projectId })}
            onDelete={() => {
              if (!window.confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) {
                return;
              }
              runBulkAction("delete");
            }}
            onClear={() => setSelectedIds(new Set())}
          />

          <TaskListView
            tasks={paginatedTasks}
            isLoading={isLoading}
            onTaskClick={openTask}
            emptyMessage="No tasks found"
            selectable={taskSelectionEnabled}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            highlightedTaskId={highlightedTaskId}
            listQueryInput={listInput}
            allowProjectEdit
            projects={projectsData ?? []}
          />

          <ListPaginationControls
            page={taskPagination.page}
            totalPages={taskPagination.totalPages}
            totalItems={taskPagination.totalItems}
            startIndex={taskPagination.startIndex}
            endIndex={taskPagination.endIndex}
            onPageChange={setPage}
          />
        </>
      )}

      {view === "kanban" && (
        <TaskKanbanBoard
          tasks={filteredTasks}
          isLoading={isLoading}
          onTaskClick={openTask}
          listQueryInput={listInput}
          canCreate={canCreate}
          onCreateClick={canCreate ? openCreateModal : undefined}
          highlightedTaskId={highlightedTaskId}
        />
      )}

      <CreateTaskModal
        open={showCreateModal}
        onClose={closeCreateModal}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
        users={usersData?.users ?? []}
        projects={projectsData ?? []}
        tasks={allTasks.map((t) => ({ id: t.id, title: t.title }))}
        currentUser={
          user
            ? { id: user.id, name: user.name, avatar: user.avatar }
            : null
        }
      />

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel
            taskId={selectedTask}
            highlightActivityId={highlightActivityId}
            onHighlightDone={clearActivityHighlight}
            onClose={closeTask}
            onTaskOpen={openTask}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
