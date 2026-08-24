import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { formatDueLabel, isTaskOverdue } from "@/lib/task-deadline";
import { taskLocateHighlightClass } from "@/hooks/useLocateTaskInView";
import { useTaskLiveTimer } from "@/hooks/useTaskLiveTimer";
import { cn, formatElapsedHMS } from "@/lib/utils";
import {
  PROJECT_PIPELINE_STAGES,
  tasksForPipelineColumn,
  withOrphanPipelineStages,
  type PipelineStageDef,
  type ProjectPipelineStageKey,
} from "@/lib/task-kanban";
import { applyOptimisticTaskUpdate, patchTaskInListCaches } from "@/lib/task-cache";
import { invalidateProjectStats } from "@/lib/project-stats";
import { refreshDashboardStats } from "@/lib/dashboard-refresh";
import { trpc } from "@/providers/trpc";
import { Check, ChevronDown, ClipboardList, Clock, GripVertical, Loader2 } from "lucide-react";
import { formatWorkZoneDate } from "@/lib/timezone";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type ListTask = {
  id: number;
  title: string;
  status: string;
  stage?: string | null;
  priority: string;
  createdAt?: string | Date | null;
  dueDate?: string | Date | null;
  project?: { id: number; name: string; color?: string | null } | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
  creator?: { name: string | null; avatar?: string | null } | null;
};

type ProjectOption = { id: number; name: string; color?: string | null };

type TaskListQueryInput = {
  limit: number;
  projectId?: number;
  assigneeId?: number;
};

function formatListDate(value?: string | Date | null) {
  return formatWorkZoneDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  highlightedTaskId?: number | null;
  projectId?: number;
  listQueryInput?: TaskListQueryInput;
  /**
   * Group rows by pipeline stage (project list view only).
   * My Tasks / All Tasks keep a flat list.
   */
  groupByStage?: boolean;
  /** When false, rows are not draggable between stage groups. Default matches groupByStage. */
  enableStageDrag?: boolean;
  /** Pipeline groups (defaults + project custom sections). */
  stages?: PipelineStageDef[];
  /** Allow changing a task’s project from the Project column (e.g. All Tasks). */
  allowProjectEdit?: boolean;
  /** Optional preloaded projects for the project editor. */
  projects?: ProjectOption[];
}

/** Full-width grid — task column gets more space; metadata columns are narrower */
const GRID_WITH_CHECKBOX =
  "grid-cols-[40px_minmax(0,2.5fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(5rem,0.62fr)_minmax(5rem,0.62fr)_minmax(4.25rem,0.48fr)]";
const GRID_WITHOUT_CHECKBOX =
  "grid-cols-[minmax(0,2.5fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(5rem,0.62fr)_minmax(5rem,0.62fr)_minmax(4.25rem,0.48fr)]";

function TaskProjectCell({
  task,
  projects,
  editable,
  isPending,
  onChange,
}: {
  task: ListTask;
  projects: ProjectOption[];
  editable: boolean;
  isPending: boolean;
  onChange: (projectId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const projectLink = task.project ? (
    <Link
      to={`/projects/${task.project.id}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 min-w-0 max-w-full text-xs text-gray-700 hover:text-[#2563EB]"
      title={`Open ${task.project.name}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: task.project.color ?? "#2563EB" }}
      />
      <span className="truncate">{task.project.name}</span>
    </Link>
  ) : (
    <span className="text-xs text-gray-400">No project</span>
  );

  if (!editable) {
    return (
      <div className="inline-flex items-center gap-1 min-w-0 w-full" onClick={(e) => e.stopPropagation()}>
        {projectLink}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 inline-flex items-center gap-0.5 max-w-full"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {projectLink}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className={cn(
              "shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25",
              isPending && "opacity-60",
            )}
            aria-label={`Change project for ${task.title}`}
            title="Change project"
          >
            {isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[280px] p-0 rounded-xl border border-gray-200 bg-white shadow-lg"
          sideOffset={6}
        >
          <Command>
            <CommandInput placeholder="Search projects…" />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="no project"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    size={14}
                    className={cn(
                      "shrink-0 text-[#2563EB]",
                      task.project ? "opacity-0" : "opacity-100",
                    )}
                  />
                  <span>No project</span>
                </CommandItem>
                {projectOptions.map((project) => {
                  const selected = task.project?.id === project.id;
                  return (
                    <CommandItem
                      key={project.id}
                      value={project.name}
                      onSelect={() => {
                        onChange(project.id);
                        setOpen(false);
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
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: project.color ?? "#2563EB" }}
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
    </div>
  );
}

function TaskListRow({
  task,
  rowClass,
  selectable,
  selectedIds,
  onToggleSelect,
  highlightedTaskId,
  enableStageDrag,
  isDragging,
  onDragStart,
  onDragEnd,
  didDragRef,
  onTaskClick,
  allowProjectEdit,
  projects,
  projectUpdatePending,
  onProjectChange,
  isTimerRunning,
  timerElapsedSeconds,
}: {
  task: ListTask;
  rowClass: string;
  selectable: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  highlightedTaskId: number | null;
  enableStageDrag: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
  onDragEnd: () => void;
  didDragRef: React.MutableRefObject<boolean>;
  onTaskClick: (id: number) => void;
  allowProjectEdit: boolean;
  projects: ProjectOption[];
  projectUpdatePending: boolean;
  onProjectChange: (taskId: number, projectId: number | null) => void;
  isTimerRunning?: boolean;
  timerElapsedSeconds?: number;
}) {
  const overdue = isTaskOverdue(task);
  const isSelected = selectable && selectedIds?.has(task.id);
  const isHighlighted = highlightedTaskId === task.id;

  return (
    <div
      data-task-locate-id={task.id}
      draggable={enableStageDrag}
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      className={cn(
        `${rowClass} py-3 border-b border-black-50 hover:bg-gray-50 transition-colors text-left`,
        enableStageDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isSelected && "bg-blue-50/40",
        isHighlighted && taskLocateHighlightClass,
        isDragging && "opacity-45",
      )}
      onClick={() => {
        if (didDragRef.current) return;
        onTaskClick(task.id);
      }}
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

      <div className="min-w-0 pr-2 flex items-center gap-2">
        {enableStageDrag ? (
          <GripVertical size={14} className="text-gray-300 shrink-0 pointer-events-none" />
        ) : null}
        <div className="text-sm font-medium text-[#1F2937] truncate">{task.title}</div>
        {isTimerRunning ? (
          <span
            className="inline-flex items-center gap-1 shrink-0 text-xs font-mono font-semibold tabular-nums text-[#2563EB] bg-blue-50 px-1.5 py-0.5 rounded dark:text-white"
            title="Time tracking is running on this task"
            aria-label="Time tracking live"
          >
            <Clock size={12} className="animate-pulse" />
            {formatElapsedHMS(timerElapsedSeconds ?? 0)}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 pr-2">
        <TaskProjectCell
          task={task}
          projects={projects}
          editable={allowProjectEdit}
          isPending={projectUpdatePending}
          onChange={(nextProjectId) => onProjectChange(task.id, nextProjectId)}
        />
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
        {task.dueDate
          ? formatDueLabel(task.dueDate, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </div>

      <div className="flex items-center">
        <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} />
      </div>
    </div>
  );
}

export function TaskListView({
  tasks,
  isLoading,
  onTaskClick,
  emptyMessage = "No tasks found",
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  highlightedTaskId = null,
  projectId,
  listQueryInput,
  groupByStage = false,
  enableStageDrag,
  stages = PROJECT_PIPELINE_STAGES.map((s) => ({ ...s })),
  allowProjectEdit = false,
  projects: projectsProp,
}: TaskListViewProps) {
  const allowStageDrag = enableStageDrag ?? groupByStage;
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(() => new Set());
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const didDragRef = useRef(false);

  const utils = trpc.useUtils();
  const listInput =
    listQueryInput ?? (projectId ? { projectId, limit: 200 } : { limit: 200 });

  const { data: myActiveTimer } = trpc.task.getMyActiveTimer.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.startedAt && !q.state.data?.paused ? 5000 : false,
  });
  const activeTimer =
    myActiveTimer?.startedAt && !myActiveTimer?.paused ? myActiveTimer : null;
  const { elapsedSeconds: activeTimerElapsedSeconds, isRunning: isActiveTimerRunning } =
    useTaskLiveTimer(activeTimer);
  const activeTimerTaskId = isActiveTimerRunning ? activeTimer?.taskId ?? null : null;

  const { data: fetchedProjects } = trpc.project.list.useQuery(undefined, {
    enabled: allowProjectEdit && !projectsProp,
  });
  const projects = projectsProp ?? fetchedProjects ?? [];

  const updateMutation = trpc.task.update.useMutation({
    onMutate: async (input) => {
      const current = tasks.find((task) => task.id === input.id);
      if (!current) return {};
      const previous = utils.task.list.getData(listInput);
      await applyOptimisticTaskUpdate(utils, current, input);
      if (input.projectId !== undefined) {
        const nextProject =
          input.projectId == null
            ? null
            : projects.find((p) => p.id === input.projectId) ??
              (current.project?.id === input.projectId ? current.project : null);
        patchTaskInListCaches(utils, input.id, {
          projectId: input.projectId,
          project: nextProject
            ? {
                id: nextProject.id,
                name: nextProject.name,
                color: nextProject.color ?? null,
              }
            : null,
        });
      }
      return { previous, previousProjectId: current.project?.id ?? null };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.task.list.setData(listInput, context.previous);
      }
      void refreshDashboardStats(utils);
    },
    onSettled: async (_data, _err, input, context) => {
      await Promise.all([
        utils.task.list.invalidate(),
        utils.task.getById.invalidate(),
        refreshDashboardStats(utils),
      ]);
      const previousProjectId =
        context && "previousProjectId" in context
          ? (context.previousProjectId as number | null | undefined)
          : undefined;
      invalidateProjectStats(utils, previousProjectId ?? projectId);
      if (input.projectId != null) {
        invalidateProjectStats(utils, input.projectId);
      }
      invalidateProjectStats(utils, projectId);
    },
  });

  const handleProjectChange = (taskId: number, nextProjectId: number | null) => {
    const current = tasks.find((task) => task.id === taskId);
    const currentId = current?.project?.id ?? null;
    if (currentId === nextProjectId) return;
    updateMutation.mutate({ id: taskId, projectId: nextProjectId });
  };

  const stageGroups = useMemo(() => {
    if (!groupByStage) return [];
    const resolved = withOrphanPipelineStages(stages, tasks);
    return resolved.map((stage) => ({
      ...stage,
      tasks: tasksForPipelineColumn(tasks, stage.key),
    }));
  }, [tasks, stages, groupByStage]);

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
  const rowClass = `w-full grid ${gridCols} gap-x-4 gap-y-2 px-5 items-center`;

  const toggleStage = (stageKey: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    if (!allowStageDrag) return;
    e.stopPropagation();
    didDragRef.current = true;
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(taskId));
  };

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    if (!allowStageDrag || draggedTask == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageKey);
  };

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    if (!allowStageDrag || draggedTask == null) return;

    const current = tasks.find((task) => task.id === draggedTask);
    const alreadyInStage =
      current &&
      tasksForPipelineColumn([current], stageKey).length > 0;

    if (!alreadyInStage) {
      updateMutation.mutate({
        id: draggedTask,
        stage: stageKey as ProjectPipelineStageKey,
      });
    }

    setDraggedTask(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverStage(null);
    requestAnimationFrame(() => {
      didDragRef.current = false;
    });
  };

  const isProjectUpdatePending = (taskId: number) =>
    updateMutation.isPending &&
    updateMutation.variables?.id === taskId &&
    updateMutation.variables.projectId !== undefined;

  const header = (
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
  );

  if (!groupByStage) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {header}
            {tasks.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            rowClass={rowClass}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            highlightedTaskId={highlightedTaskId}
            enableStageDrag={false}
            isDragging={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            didDragRef={didDragRef}
            onTaskClick={onTaskClick}
            allowProjectEdit={allowProjectEdit}
            projects={projects}
            projectUpdatePending={isProjectUpdatePending(task.id)}
            onProjectChange={handleProjectChange}
            isTimerRunning={activeTimerTaskId === task.id}
            timerElapsedSeconds={
              activeTimerTaskId === task.id ? activeTimerElapsedSeconds : undefined
            }
          />
        ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
      {header}

      {stageGroups.map((group) => {
        const collapsed = collapsedStages.has(group.key) && draggedTask == null;
        const isDragOver = dragOverStage === group.key;

        return (
          <div
            key={group.key}
            onDragOver={(e) => handleDragOver(e, group.key)}
            onDrop={(e) => handleDrop(e, group.key)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverStage((current) => (current === group.key ? null : current));
              }
            }}
            className={cn(
              "transition-colors",
              isDragOver && "bg-blue-50/60 ring-2 ring-inset ring-[#2563EB]/35",
            )}
          >
            <button
              type="button"
              onClick={() => toggleStage(group.key)}
              className="w-full flex items-center gap-2 px-5 py-2.5 bg-gray-50/90 border-b border-gray-200 text-left hover:bg-gray-100/80 transition-colors"
              aria-expanded={!collapsed}
            >
              <ChevronDown
                size={16}
                className={cn(
                  "text-gray-400 shrink-0 transition-transform",
                  collapsed && "-rotate-90",
                )}
              />
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-sm font-semibold text-[#1F2937]">{group.label}</span>
              <span className="text-[11px] font-semibold text-gray-500 bg-gray-200/80 rounded-full min-w-[22px] h-5 px-1.5 flex items-center justify-center">
                {group.tasks.length}
              </span>
            </button>

            {!collapsed ? (
              group.tasks.length === 0 ? (
                <div className="px-5 py-4 border-b border-dashed border-gray-200 text-xs text-gray-400 text-center">
                  {draggedTask != null ? "Drop a task here" : "No tasks"}
                </div>
              ) : (
                group.tasks.map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={task}
                    rowClass={rowClass}
                    selectable={selectable}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                    highlightedTaskId={highlightedTaskId}
                    enableStageDrag={allowStageDrag}
                    isDragging={draggedTask === task.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    didDragRef={didDragRef}
                    onTaskClick={onTaskClick}
                    allowProjectEdit={allowProjectEdit}
                    projects={projects}
                    projectUpdatePending={isProjectUpdatePending(task.id)}
                    onProjectChange={handleProjectChange}
                    isTimerRunning={activeTimerTaskId === task.id}
                    timerElapsedSeconds={
                      activeTimerTaskId === task.id ? activeTimerElapsedSeconds : undefined
                    }
                  />
                ))
              )
            ) : null}
          </div>
        );
      })}
        </div>
      </div>
    </div>
  );
}
