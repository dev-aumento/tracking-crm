import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Timer, Calendar, Loader2, Pencil } from "lucide-react";
import { localDateKey, REQUIRED_DAILY_HOURS } from "@/lib/work-hours-policy";
import { formatDuration } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { BreaksPanel } from "@/components/time-tracking/BreaksPanel";
import {
  EditAttendanceEntryDialog,
  formatEntryDateTimeRange,
  type AttendanceEntryRow,
} from "@/components/time-tracking/EditAttendanceEntryDialog";
import { formatWorkZoneDateKey } from "@/lib/timezone";

function formatEntryDuration(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  return formatDuration(minutes);
}

function formatDisplayDate(dateStr: string) {
  return formatWorkZoneDateKey(dateStr, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function DayEntriesPanel({
  title,
  subtitle,
  avatarName,
  avatarUrl,
  totalHours,
  entries,
  isLoading,
  emptyMessage,
  onEditEntry,
}: {
  title: string;
  subtitle: string;
  avatarName?: string | null;
  avatarUrl?: string | null;
  totalHours: number;
  entries: AttendanceEntryRow[];
  isLoading: boolean;
  emptyMessage: string;
  onEditEntry?: (entry: AttendanceEntryRow) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <UserAvatar name={avatarName} avatar={avatarUrl} size={36} />
          <div>
            <h3 className="font-semibold text-[#1F2937]">{title}</h3>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-[#2563EB]">{totalHours}h total</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : entries.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <Timer size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-700 truncate">
                  {entry.note || "Attendance"}
                </div>
                <div className="text-xs text-gray-400">
                  {formatEntryDateTimeRange(entry.clockIn, entry.clockOut)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-sm font-medium text-[#1F2937]">
                  {formatEntryDuration(entry.duration)}
                </div>
                {entry.clockOut && onEditEntry ? (
                  <button
                    type="button"
                    onClick={() => onEditEntry(entry)}
                    className="h-8 px-2.5 rounded-lg border border-gray-200 text-xs font-medium text-[#2563EB] hover:bg-blue-50 transition-colors flex items-center gap-1"
                    aria-label="Edit clock in and clock out"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400 text-sm">{emptyMessage}</div>
      )}
    </div>
  );
}

export function DayHoursSection() {
  const { user } = useAuth();
  const canViewTeamHours = hasPermission(user, "time.view_team");
  const utils = trpc.useUtils();

  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AttendanceEntryRow | null>(null);

  const { data: usersData } = trpc.user.listForPicker.useQuery(
    { limit: 500 },
    { enabled: canViewTeamHours },
  );

  const viewingOtherEmployee = canViewTeamHours && selectedEmployeeId !== "";
  const showTeamTable = canViewTeamHours && !viewingOtherEmployee;
  const showDayDetail = !canViewTeamHours || viewingOtherEmployee;
  const breaksUserId = viewingOtherEmployee ? Number(selectedEmployeeId) : undefined;

  const { data: teamHours, isLoading: teamLoading } = trpc.timeEntry.getTeamHours.useQuery(
    { date: selectedDate },
    { enabled: showTeamTable, refetchInterval: showTeamTable ? 30_000 : false },
  );

  const { data: dayHours, isLoading: entriesLoading } = trpc.timeEntry.getDayHours.useQuery(
    {
      date: selectedDate,
      userId: viewingOtherEmployee ? Number(selectedEmployeeId) : undefined,
    },
    { enabled: showDayDetail, refetchInterval: showDayDetail ? 30_000 : false },
  );

  const selectedEmployee = useMemo(
    () => usersData?.users.find((u) => u.id === Number(selectedEmployeeId)),
    [usersData?.users, selectedEmployeeId],
  );

  const dayHoursTotal = dayHours?.totalHours ?? 0;
  const invalidateDayHours = () => {
    utils.timeEntry.getDayHours.invalidate();
    utils.timeEntry.getBreaks.invalidate();
    utils.timeEntry.getStats.invalidate();
    utils.timeEntry.getTeamHours.invalidate();
    utils.dashboard.getStats.invalidate();
  };

  const sectionSubtitle = showTeamTable
    ? `Team hours for ${formatDisplayDate(selectedDate)}`
    : viewingOtherEmployee
      ? `Hours for ${selectedEmployee?.name ?? "employee"} on ${formatDisplayDate(selectedDate)}`
      : `Your hours for ${formatDisplayDate(selectedDate)}`;

  return (
    <div className="space-y-4 pt-4 border-t border-gray-100">
      <div>
        <h2 className="font-semibold text-[#1F2937]">Daily Hours</h2>
        <p className="text-xs text-gray-400 mt-0.5">{sectionSubtitle}</p>
        <p className="text-xs text-gray-400 mt-1">
          Clock-in to clock-out time, excluding breaks
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </div>

        {canViewTeamHours ? (
          <select
            value={selectedEmployeeId}
            onChange={(e) =>
              setSelectedEmployeeId(e.target.value ? Number(e.target.value) : "")
            }
            className="h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white w-full sm:w-auto sm:min-w-[220px]"
          >
            <option value="">All employees</option>
            {(usersData?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email ?? `User #${u.id}`}
              </option>
            ))}
          </select>
        ) : null}

        {!showTeamTable ? (
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-400">Total hours</div>
            <div className="text-lg font-bold text-[#1F2937]">{dayHoursTotal}h</div>
          </div>
        ) : null}
      </div>

      {showDayDetail ? (
        <>
          <DayEntriesPanel
            title={viewingOtherEmployee ? (selectedEmployee?.name ?? "Employee") : (user?.name ?? "You")}
            subtitle={formatDisplayDate(selectedDate)}
            avatarName={viewingOtherEmployee ? selectedEmployee?.name : user?.name}
            avatarUrl={viewingOtherEmployee ? selectedEmployee?.avatar : user?.avatar}
            totalHours={dayHoursTotal}
            entries={dayHours?.entries ?? []}
            isLoading={entriesLoading}
            emptyMessage={
              viewingOtherEmployee
                ? "No attendance logged for this employee on the selected date."
                : "No attendance logged for you on the selected date."
            }
            onEditEntry={(entry) => {
              setEditingEntry(entry);
              setEditOpen(true);
            }}
          />
          <BreaksPanel date={selectedDate} userId={breaksUserId} />
          <EditAttendanceEntryDialog
            open={editOpen}
            onOpenChange={(open) => {
              setEditOpen(open);
              if (!open) setEditingEntry(null);
            }}
            entry={editingEntry}
            onSuccess={invalidateDayHours}
          />
        </>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-[#1F2937]">Employee Hours</h3>
            <span className="text-xs text-gray-400">{teamHours?.length || 0} employees</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(140px,1fr)_80px_72px_88px_100px] sm:grid-cols-[1fr_100px_100px_100px_120px] gap-3 sm:gap-4 px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>Employee</span>
                <span>Role</span>
                <span>Entries</span>
                <span>Total Hours</span>
                <span>Utilization</span>
              </div>
          {teamLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : teamHours && teamHours.length > 0 ? (
            teamHours.map((member) => {
              const utilization = Math.min(
                Math.round((member.totalHours / REQUIRED_DAILY_HOURS) * 100),
                100,
              );
              return (
                <div
                  key={member.userId}
                  className="grid grid-cols-[minmax(140px,1fr)_80px_72px_88px_100px] sm:grid-cols-[1fr_100px_100px_100px_120px] gap-3 sm:gap-4 px-4 sm:px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors items-center"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={member.name} avatar={member.avatar} size={28} />
                    <span className="text-sm text-gray-700">{member.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 capitalize">{member.role}</span>
                  <span className="text-sm text-gray-700">{member.entriesCount}</span>
                  <span className="text-sm font-semibold text-[#1F2937]">{member.totalHours}h</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${utilization}%`,
                          backgroundColor:
                            utilization > 80 ? "#10B981" : utilization > 50 ? "#F59E0B" : "#DC2626",
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8">{utilization}%</span>
                  </div>
                </div>
              );
            })
          ) : (
                <div className="py-12 text-center text-gray-400 text-sm">No data for this date</div>
          )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
