import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RoleBadge } from "@/components/shared/StatusBadge";
import {
  Users, Search, X, Loader2, Shield, UserCheck,
  UserX, UserPlus, Link2, Copy, Check, KeyRound, Trash2,
} from "lucide-react";
import { PERMISSION_GROUPS } from "@contracts/permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Invite } from "@contracts/constants";

export default function AdminEmployees() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [accessUser, setAccessUser] = useState<{
    id: number;
    name: string | null;
    permissions: string[];
  } | null>(null);
  const [accessPermissions, setAccessPermissions] = useState<string[]>([]);

  const { data, isLoading } = trpc.user.list.useQuery({
    search: search || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });

  const { data: pendingInvites, refetch: refetchInvites } = trpc.invite.list.useQuery();

  const utils = trpc.useUtils();
  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
      setEditingUser(null);
    },
  });

  const updateStatusMutation = trpc.user.update.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
    },
  });

  const updatePermissionsMutation = trpc.user.update.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
      setAccessUser(null);
    },
  });

  const createInviteMutation = trpc.invite.create.useMutation({
    onSuccess: (result) => {
      const url = result.url || `${window.location.origin}/invite/${result.token}`;
      setInviteUrl(url);
      setInviteError(null);
      setCopied(false);
      refetchInvites();
    },
    onError: (err) => {
      setInviteError(err.message || "Failed to generate invite link. Please try again.");
    },
  });

  const revokeInviteMutation = trpc.invite.revoke.useMutation({
    onSuccess: () => {
      refetchInvites();
      if (inviteUrl) setInviteUrl("");
    },
  });

  const hasFilters = search || roleFilter || statusFilter;

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
  };

  function handleOpenInvite() {
    setInviteOpen(true);
    setInviteUrl("");
    setInviteDepartment("");
    setInviteError(null);
    setCopied(false);
  }

  function handleGenerateInvite() {
    setInviteError(null);
    createInviteMutation.mutate({
      department: inviteDepartment.trim() || undefined,
    });
  }

  async function handleCopyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openAccessDialog(u: { id: number; name: string | null; permissions?: string[] }) {
    setAccessUser({ id: u.id, name: u.name, permissions: u.permissions ?? [] });
    setAccessPermissions(u.permissions ?? []);
  }

  function toggleAccessPermission(key: string) {
    setAccessPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.total ?? 0} total employees
          </p>
        </div>
        <Button
          onClick={handleOpenInvite}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-2"
        >
          <UserPlus size={16} />
          Invite Employee
        </Button>
      </div>

      {/* Pending invites */}
      {pendingInvites && pendingInvites.invites.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={16} className="text-[#2563EB]" />
            <h2 className="text-sm font-semibold text-[#1F2937]">
              Pending invite links ({pendingInvites.invites.length})
            </h2>
          </div>
          <div className="space-y-2">
            {pendingInvites.invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-blue-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">{invite.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {invite.department ? `${invite.department} · ` : ""}
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(invite.url);
                    }}
                    className="h-8 px-2.5 text-xs text-[#2563EB] hover:bg-blue-50 rounded-lg flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy
                  </button>
                  <button
                    onClick={() => revokeInviteMutation.mutate({ id: invite.id })}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="Revoke invite"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="h-9 px-3 text-sm text-gray-500 hover:text-[#2563EB] flex items-center gap-1">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Employee Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_140px_100px_120px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span>Employee</span>
          <span>Department</span>
          <span>Role</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}

        <AnimatePresence>
          {data?.users.map((u) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-[1fr_140px_140px_100px_120px] gap-4 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors items-center"
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={u.name} avatar={u.avatar} size={32} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#1F2937]">{u.name || "Unknown"}</div>
                  <div className="text-xs text-gray-400 truncate">{u.email || "No email"}</div>
                </div>
              </div>
              <div className="text-sm text-gray-600">{u.department || "—"}</div>
              <div>
                {editingUser === u.id ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="h-7 px-2 border border-gray-200 rounded text-xs"
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                    <button
                      onClick={() => updateRoleMutation.mutate({ id: u.id, role: editRole as "admin" | "manager" | "employee" })}
                      className="h-7 px-2 bg-[#2563EB] text-white rounded text-xs"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <RoleBadge role={u.role as "admin" | "manager" | "employee"} />
                )}
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.status === "active"
                      ? "bg-emerald-50 text-emerald-600"
                      : u.status === "inactive"
                      ? "bg-gray-100 text-gray-500"
                      : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {u.status}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {u.role === "employee" && (
                  <button
                    onClick={() => openAccessDialog(u)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"
                    title="Manage access"
                  >
                    <KeyRound size={14} className="text-[#2563EB]" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingUser(editingUser === u.id ? null : u.id);
                    setEditRole(u.role);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"
                  title="Edit role"
                >
                  <Shield size={14} className="text-gray-500" />
                </button>
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: u.id,
                      status: u.status === "active" ? "inactive" : "active",
                    })
                  }
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"
                  title={u.status === "active" ? "Deactivate" : "Activate"}
                >
                  {u.status === "active" ? (
                    <UserX size={14} className="text-blue-400" />
                  ) : (
                    <UserCheck size={14} className="text-emerald-500" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {data?.users.length === 0 && !isLoading && (
          <div className="py-12 text-center">
            <Users size={36} className="mx-auto text-gray-200 mb-2" />
            <p className="text-gray-500 text-sm">No employees found</p>
          </div>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Invite via link</DialogTitle>
            <DialogDescription>
              Share this link with a new employee. They will create their account with email and password.
              Each link is unique, single-use, and expires after {Invite.expiryDays} days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="inviteDepartment">Department (optional)</Label>
              <Input
                id="inviteDepartment"
                placeholder="e.g. Engineering, Sales"
                value={inviteDepartment}
                onChange={(e) => setInviteDepartment(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Invite via link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inviteUrl}
                  placeholder={
                    createInviteMutation.isPending
                      ? "Generating link..."
                      : "Click Generate to create an invite link"
                  }
                  className="text-sm bg-gray-50 font-mono text-gray-700"
                />
                <Button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={!inviteUrl}
                  className="shrink-0 gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {copied ? <Check size={14} /> : <Link2 size={14} />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              {inviteError ? (
                <p className="text-sm text-red-500">{inviteError}</p>
              ) : inviteUrl ? (
                <p className="text-xs text-gray-500">
                  Link ready — copy and share it. Generate a new link for each person you invite.
                </p>
              ) : null}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                Close
              </Button>
              <Button
                onClick={handleGenerateInvite}
                disabled={createInviteMutation.isPending}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] gap-2"
              >
                {createInviteMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Link2 size={14} />
                )}
                {inviteUrl ? "Generate new link" : "Generate invite link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee access dialog */}
      <Dialog open={!!accessUser} onOpenChange={(open) => !open && setAccessUser(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>
              Choose what <strong>{accessUser?.name || "this employee"}</strong> can access in the app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.permissions.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-start gap-3 cursor-pointer"
                    >
                      <Checkbox
                        checked={accessPermissions.includes(perm.key)}
                        onCheckedChange={() => toggleAccessPermission(perm.key)}
                        className="mt-0.5"
                      />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={() => setAccessUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!accessUser) return;
                updatePermissionsMutation.mutate({
                  id: accessUser.id,
                  permissions: accessPermissions,
                });
              }}
              disabled={updatePermissionsMutation.isPending}
              className="bg-[#2563EB] hover:bg-[#1D4ED8]"
            >
              {updatePermissionsMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Save access"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
