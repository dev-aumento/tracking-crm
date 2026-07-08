import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import { ProjectFunnelTable } from "@/components/projects/ProjectFunnelTable";
import { projectsMatchingUnifiedSearch } from "@/lib/unified-search";
import { Plus, X, Loader2, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState({ name: "", description: "", color: "#2563EB" });
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setShowCreate(false);
      setCreateError(null);
      setFormData({ name: "", description: "", color: "#2563EB" });
    },
    onError: (error) => {
      setCreateError(error.message || "Could not create project.");
    },
  });

  const canCreate = hasPermission(user, "projects.manage");

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    return projects.filter((p) => projectsMatchingUnifiedSearch(p, search));
  }, [projects, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!filteredProjects.length) return;
    const allSelected = filteredProjects.every((p) => selectedIds.has(p.id));
    setSelectedIds(allSelected ? new Set() : new Set(filteredProjects.map((p) => p.id)));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-[#1e3a5f] via-[#2563EB] to-[#3B82F6] px-6 py-5 text-white shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_white,_transparent_55%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-sm text-blue-100 mt-1">
              {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"} · funnel view
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setShowCreate(true);
                }}
                className="h-10 px-4 bg-white text-[#2563EB] rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors"
              >
                <Plus size={16} /> Create
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name..."
            className="w-full h-10 pl-9 pr-4 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
          />
        </div>
        {selectedIds.size > 0 && (
          <span className="text-sm text-gray-500">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <ProjectFunnelTable
        projects={filteredProjects}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onProjectClick={(id) => navigate(`/projects/${id}`)}
      />

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowCreate(false);
              setCreateError(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-[#1F2937]">Create Project</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formData.name.trim()) return;
                  setCreateError(null);
                  createMutation.mutate(formData);
                }}
                className="p-5 space-y-4"
              >
                {createError ? (
                  <p className="text-sm text-red-500">{createError}</p>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    placeholder="Project name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-none"
                    placeholder="Project description..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <div className="flex gap-2">
                    {["#2563EB", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: c })}
                        className={`w-8 h-8 rounded-full transition-all ${formData.color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
              setShowCreate(false);
              setCreateError(null);
            }}
                    className="h-10 px-4 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="h-10 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Create Project
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
