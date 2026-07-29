import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { motion } from "framer-motion";
import { CalendarCheck2, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { canManageLeaves } from "@/lib/leave-policy";
import { workZoneDateParts } from "@/lib/timezone";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { MonthAttendanceCard } from "@/components/dashboard/MonthAttendanceCard";
import { cn } from "@/lib/utils";

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function formatLeaveMetric(value: number) {
  if (!value || value <= 0) return "None";
  if (value === 0.5) return "0.5 Day";
  if (value === 1) return "1 Day";
  return `${value} Days`;
}

export default function AttendanceManagement() {
  const { user } = useAuth();
  const allowed = canManageLeaves(user);
  const nowParts = workZoneDateParts(new Date());
  const [year, setYear] = useState(nowParts.year);
  const [month, setMonth] = useState(nowParts.month);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data, isLoading } = trpc.timeEntry.getTeamMonthAttendance.useQuery(
    { year, month },
    { enabled: allowed },
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.email ?? "").toLowerCase().includes(q) ||
        (row.department ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const selected = filtered.find((r) => r.userId === selectedUserId) ?? filtered[0] ?? null;

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  const goPrev = () => {
    const next = shiftMonth(year, month, -1);
    setYear(next.year);
    setMonth(next.month);
  };
  const goNext = () => {
    const next = shiftMonth(year, month, 1);
    setYear(next.year);
    setMonth(next.month);
  };

  const monthLabel =
    selected?.attendance.monthLabel ??
    data?.[0]?.attendance.monthLabel ??
    `${month}/${year}`;

  const leaveBreakdown = selected?.attendance.leaveBreakdown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1F2937] flex items-center gap-2">
            <CalendarCheck2 size={22} className="text-[#2563EB]" />
            Attendance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Month-wise attendance for all employees (Mon–Fri working days)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[140px] text-center text-sm font-semibold text-[#1F2937]">
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={goNext}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees..."
          className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 size={18} className="animate-spin" />
          Loading attendance...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          No employees found for this month.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[70vh] overflow-y-auto">
            {filtered.map((row) => {
              const active = (selected?.userId ?? null) === row.userId;
              const leaveTotal = row.attendance.leaveBreakdown?.totalLeaveDays ?? 0;
              return (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => setSelectedUserId(row.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-b-0 transition-colors",
                    active ? "bg-blue-50" : "hover:bg-gray-50",
                  )}
                >
                  <UserAvatar name={row.name} avatar={row.avatar} size={36} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1F2937] truncate">
                      {row.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {row.department || row.role}
                      {" · "}
                      {row.attendance.attendanceDays}/{row.attendance.workingDays} days
                      {leaveTotal > 0 ? ` · ${leaveTotal} leave` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {selected ? (
              <>
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                  <UserAvatar name={selected.name} avatar={selected.avatar} size={48} />
                  <div>
                    <div className="font-semibold text-[#1F2937]">{selected.name}</div>
                    <div className="text-sm text-gray-500">
                      {[selected.department, selected.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <MonthAttendanceCard
                  data={selected.attendance}
                  employeeName={selected.name}
                />
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-2.5">Metric</th>
                        <th className="text-right font-medium px-4 py-2.5">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="px-4 py-2.5">Working days (excl Sat–Sun & holidays)</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {selected.attendance.workingDays}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">Attendance</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {selected.attendance.attendanceDays} Days
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">Late</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {selected.attendance.lateDays} Days
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">
                          Paid leave
                          <span className="block text-xs text-gray-400 font-normal">
                            Approved only
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatLeaveMetric(leaveBreakdown?.paidDays ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">
                          Sick leave
                          <span className="block text-xs text-gray-400 font-normal">
                            Approved only
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatLeaveMetric(leaveBreakdown?.sickDays ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">
                          Unpaid leave
                          <span className="block text-xs text-gray-400 font-normal">
                            Approved only
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatLeaveMetric(leaveBreakdown?.unpaidDays ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">
                          Half day
                          <span className="block text-xs text-gray-400 font-normal">
                            Approved half-day leave
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatLeaveMetric(leaveBreakdown?.halfDays ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5">Worked hours (month total)</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {selected.attendance.workedHoursLabel}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </motion.div>
  );
}
