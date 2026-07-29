import type { MonthAttendanceSummary } from "@/lib/month-attendance";
import { CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

function daysLabel(count: number) {
  return `${count} Day${count === 1 ? "" : "s"}`;
}

function possessiveName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

type AttendanceCardProps = {
  data?: MonthAttendanceSummary | null;
  isLoading?: boolean;
  className?: string;
  compact?: boolean;
  /** When set (HR view), title/warning use this name instead of "Your". */
  employeeName?: string | null;
};

export function MonthAttendanceCard({
  data,
  isLoading,
  className,
  compact,
  employeeName,
}: AttendanceCardProps) {
  const metrics = [
    { label: "Working days", value: daysLabel(data?.workingDays ?? 0) },
    { label: "Attendance", value: daysLabel(data?.attendanceDays ?? 0) },
    { label: "Late", value: daysLabel(data?.lateDays ?? 0) },
    { label: "Absent", value: daysLabel(data?.absentDays ?? 0) },
    { label: "Half Days", value: daysLabel(data?.halfDays ?? 0) },
    {
      label: "Worked hours",
      value: data?.workedHoursLabel ?? "0 hr 0 mins",
      wide: true,
    },
  ];

  const name = employeeName?.trim() || "";
  const title = name
    ? `Record ${possessiveName(name)} Attendance`
    : "Record Your Attendance";
  const warningPrefix = name ? possessiveName(name) : "Your";

  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-xl shadow-sm",
        compact ? "p-4" : "p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-[#1F2937] flex items-center gap-2">
            <CalendarCheck2 size={18} className="text-[#2563EB] shrink-0" />
            {title}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {data?.monthLabel ?? "This month"} · Full month Mon–Fri
            {data != null ? ` (${data.workingDays} working days)` : ""}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {metrics.map((m) => (
              <div key={m.label} className={m.wide ? "sm:col-span-1 col-span-2" : undefined}>
                <div className="text-sm font-semibold text-[#1F2937]">{m.label}</div>
                <div className="text-sm text-gray-500 mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && data?.shortStaffingWarning ? (
        <div className="mt-4 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2.5 text-sm text-orange-700 font-medium">
          {warningPrefix} previous staffing was less than 08:30 hours
        </div>
      ) : null}
    </div>
  );
}
