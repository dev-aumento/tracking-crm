import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatElapsedHMS, formatTimeEntryLogged, getTimeEntrySeconds } from "@/lib/utils";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";

type TimeEntry = NonNullable<
  ReturnType<typeof trpc.task.getTimeTracked.useQuery>["data"]
>["entries"][number];

function toDatetimeLocalValue(value: Date | string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function invalidateTaskTime(utils: ReturnType<typeof trpc.useUtils>, taskId: number) {
  utils.task.getTimeTracked.invalidate({ taskId });
  utils.task.getById.invalidate({ id: taskId });
  utils.timeEntry.getStats.invalidate();
}

function TaskTimeEntryEditForm({
  taskId,
  entry,
  onCancel,
  onSaved,
}: {
  taskId: number;
  entry: TimeEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [clockIn, setClockIn] = useState(() => toDatetimeLocalValue(entry.clockIn!));
  const [clockOut, setClockOut] = useState(() => toDatetimeLocalValue(entry.clockOut!));
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const updateMutation = trpc.task.updateTimeEntry.useMutation({
    onSuccess: () => {
      invalidateTaskTime(utils, taskId);
      onSaved();
    },
  });

  const canSave = reason.trim().length > 0 && !updateMutation.isPending;

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 space-y-3">
      <p className="text-xs text-amber-800 font-medium">
        Edit time entry — a reason is required to save changes.
      </p>
      <div className="grid grid-cols-1 gap-2">
        <label className="block text-xs text-gray-600">
          Start
          <input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </label>
        <label className="block text-xs text-gray-600">
          End
          <input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        Reason for edit
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why are you changing this time entry?"
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white resize-none"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-lg text-xs font-medium text-gray-600 hover:bg-white border border-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            updateMutation.mutate({
              taskId,
              entryId: entry.id,
              clockIn: new Date(clockIn).toISOString(),
              clockOut: new Date(clockOut).toISOString(),
              reason: reason.trim(),
            })
          }
          className="h-8 px-3 rounded-lg text-xs font-medium text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {updateMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Save
        </button>
      </div>
      {updateMutation.error ? (
        <p className="text-xs text-red-600">{updateMutation.error.message}</p>
      ) : null}
    </div>
  );
}

function TaskTimeEntryAddForm({
  taskId,
  currentUserId,
  canPickUser,
  users,
  onCancel,
  onSaved,
}: {
  taskId: number;
  currentUserId: number;
  canPickUser: boolean;
  users: Array<{ id: number; name: string | null }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [userId, setUserId] = useState(currentUserId);
  const [clockIn, setClockIn] = useState(() => toDatetimeLocalValue(oneHourAgo));
  const [clockOut, setClockOut] = useState(() => toDatetimeLocalValue(now));
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();

  const addMutation = trpc.task.addManualTimeEntry.useMutation({
    onSuccess: () => {
      invalidateTaskTime(utils, taskId);
      onSaved();
    },
  });

  const canSave = !addMutation.isPending && clockIn && clockOut;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-3">
      <p className="text-xs text-blue-800 font-medium">Add manual time entry</p>
      {canPickUser ? (
        <label className="block text-xs text-gray-600">
          Employee
          <select
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? `User #${u.id}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="grid grid-cols-1 gap-2">
        <label className="block text-xs text-gray-600">
          Start
          <input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </label>
        <label className="block text-xs text-gray-600">
          End
          <input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done during this time?"
          className="mt-1 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-lg text-xs font-medium text-gray-600 hover:bg-white border border-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            addMutation.mutate({
              taskId,
              userId: canPickUser ? userId : undefined,
              clockIn: new Date(clockIn).toISOString(),
              clockOut: new Date(clockOut).toISOString(),
              note: note.trim() || undefined,
            })
          }
          className="h-8 px-3 rounded-lg text-xs font-medium text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {addMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Add entry
        </button>
      </div>
      {addMutation.error ? (
        <p className="text-xs text-red-600">{addMutation.error.message}</p>
      ) : null}
    </div>
  );
}

export function TaskTimeLoggedSection({
  taskId,
  timeData,
  hasActiveSession,
  canManageTime,
  currentUserId,
  canPickUser,
  users,
}: {
  taskId: number;
  timeData: ReturnType<typeof trpc.task.getTimeTracked.useQuery>["data"];
  hasActiveSession: boolean;
  canManageTime: boolean;
  currentUserId: number;
  canPickUser: boolean;
  users: Array<{ id: number; name: string | null }>;
}) {
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [showAddManual, setShowAddManual] = useState(false);

  const entries = timeData?.entries ?? [];
  const hasEntries = entries.length > 0;

  const canEditEntry = (entry: TimeEntry) =>
    canManageTime || entry.userId === currentUserId;

  return (
    <div className="space-y-2">
      {hasEntries ? (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Time logged</p>
          <div className="max-h-[calc(3*4.25rem+0.5rem)] overflow-y-auto overscroll-contain space-y-2 pr-1">
            {entries.map((entry) => {
              const isEditing = editingEntryId === entry.id;
              const editable = !!entry.clockOut && canEditEntry(entry);

              return (
                <div key={entry.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2 text-sm min-h-[4.25rem]">
                    <div className="flex items-start gap-2 min-w-0">
                      <UserAvatar name={entry.user?.name} avatar={entry.user?.avatar} size={22} />
                      <div className="min-w-0">
                        <p className="text-gray-800 font-medium truncate">
                          {entry.user?.name ?? "Unknown"}
                        </p>
                        {entry.clockIn && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            {formatTimeEntryLogged(entry.clockIn, entry.clockOut)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-1 shrink-0 pt-0.5">
                      <span className="font-mono text-xs font-semibold text-gray-600 tabular-nums">
                        {formatElapsedHMS(getTimeEntrySeconds(entry))}
                      </span>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddManual(false);
                            setEditingEntryId(isEditing ? null : entry.id);
                          }}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-gray-50"
                          aria-label={isEditing ? "Close edit" : "Edit time entry"}
                        >
                          {isEditing ? <X size={14} /> : <Pencil size={14} />}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isEditing && entry.clockOut ? (
                    <TaskTimeEntryEditForm
                      taskId={taskId}
                      entry={entry}
                      onCancel={() => setEditingEntryId(null)}
                      onSaved={() => setEditingEntryId(null)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : !hasActiveSession ? (
        <p className="text-sm text-gray-400">No time logged yet.</p>
      ) : null}

      {canManageTime ? (
        <div className="pt-1 border-t border-gray-100">
          {showAddManual ? (
            <TaskTimeEntryAddForm
              taskId={taskId}
              currentUserId={currentUserId}
              canPickUser={canPickUser}
              users={users}
              onCancel={() => setShowAddManual(false)}
              onSaved={() => setShowAddManual(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingEntryId(null);
                setShowAddManual(true);
              }}
              className="mt-2 w-full h-8 rounded-lg text-xs font-medium text-[#2563EB] hover:bg-blue-50 flex items-center justify-center gap-1.5"
            >
              <Plus size={14} />
              Add manual entry
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
