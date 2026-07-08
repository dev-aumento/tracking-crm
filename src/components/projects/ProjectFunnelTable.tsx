import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  formatCreatorDepartment,
  formatProjectActiveDate,
} from "@/lib/project-funnel";
import { Briefcase, FolderKanban, Globe, GripVertical, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export type ProjectFunnelRow = {
  id: number;
  name: string;
  color?: string | null;
  status: string;
  taskCount: number;
  completedCount: number;
  performance?: number;
  lastActiveAt?: string | Date | null;
  members?: { id: number; name: string | null; avatar?: string | null }[];
  creator?: {
    id: number;
    name: string | null;
    avatar?: string | null;
    department?: string | null;
    position?: string | null;
  } | null;
  privacyType?: string;
};

interface ProjectFunnelTableProps {
  projects: ProjectFunnelRow[];
  isLoading?: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onProjectClick: (id: number) => void;
}

function ProjectIcon({ color, id }: { color?: string | null; id: number }) {
  const icons = [FolderKanban, Briefcase, Globe];
  const Icon = icons[id % icons.length];
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
      style={{ backgroundColor: color ?? "#2563EB" }}
    >
      <Icon size={16} />
    </span>
  );
}

function PerformanceCell({ value }: { value: number }) {
  const tone =
    value >= 80 ? "text-emerald-600" : value >= 40 ? "text-[#2563EB]" : value > 0 ? "text-amber-600" : "text-gray-400";

  return (
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>
      {value}%
    </span>
  );
}

function DepartmentPill({ label }: { label: string }) {
  if (label === "—") {
    return <span className="text-sm text-gray-400">—</span>;
  }

  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap bg-slate-100 text-slate-700">
      {label}
    </span>
  );
}

export function ProjectFunnelTable({
  projects,
  isLoading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onProjectClick,
}: ProjectFunnelTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 bg-white border border-gray-200 rounded-xl">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const allSelected = projects.length > 0 && projects.every((p) => selectedIds.has(p.id));

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/30"
                  aria-label="Select all projects"
                />
              </th>
              <th className="w-8 px-1 py-3" />
              <th className="px-3 py-3 w-16">ID</th>
              <th className="px-3 py-3 min-w-[220px]">Name</th>
              <th className="px-3 py-3 min-w-[120px]">Created by</th>
              <th className="px-3 py-3 min-w-[200px]">Active</th>
              <th className="px-3 py-3 w-28">Performance</th>
              <th className="px-3 py-3 min-w-[140px]">View members</th>
              <th className="px-3 py-3 min-w-[140px]">Department</th>
              <th className="px-3 py-3 w-28">Privacy type</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, index) => {
              const performance =
                project.performance ??
                (project.taskCount > 0
                  ? Math.round((project.completedCount / project.taskCount) * 100)
                  : 0);
              const departmentLabel = formatCreatorDepartment(
                project.creator?.department,
                project.creator?.position,
              );

              return (
                <motion.tr
                  key={project.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onProjectClick(project.id)}
                  className="border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(project.id)}
                      onChange={() => onToggleSelect(project.id)}
                      className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/30"
                      aria-label={`Select ${project.name}`}
                    />
                  </td>
                  <td className="px-1 py-3.5 text-gray-300">
                    <GripVertical size={16} className="mx-auto" />
                  </td>
                  <td className="px-3 py-3.5 text-sm text-gray-500 tabular-nums">{project.id}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProjectIcon color={project.color} id={project.id} />
                      <span className="text-sm font-medium text-[#1F2937] truncate">{project.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-sm text-gray-600 truncate">
                    {project.creator?.name ?? "—"}
                  </td>
                  <td className="px-3 py-3.5 text-sm text-gray-600">
                    {formatProjectActiveDate(project.lastActiveAt ?? null)}
                  </td>
                  <td className="px-3 py-3.5">
                    <PerformanceCell value={performance} />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center -space-x-2">
                      {(project.members ?? []).length > 0 ? (
                        project.members!.slice(0, 4).map((member) => (
                          <UserAvatar
                            key={member.id}
                            name={member.name}
                            avatar={member.avatar}
                            size={28}
                            className="ring-2 ring-white"
                          />
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">No members</span>
                      )}
                      {(project.members?.length ?? 0) > 4 && (
                        <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
                          +{(project.members?.length ?? 0) - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <DepartmentPill label={departmentLabel} />
                  </td>
                  <td className="px-3 py-3.5 text-sm text-gray-600">
                    {project.privacyType ?? "Public"}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {projects.length === 0 && (
        <div className="py-16 text-center">
          <FolderKanban size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No projects found</p>
        </div>
      )}
    </div>
  );
}
