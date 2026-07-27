import { useMemo, type ReactNode } from "react";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Building2,
} from "lucide-react";

function TrendChip({
  value,
  suffix,
  positiveIsGood = true,
}: {
  value: number;
  suffix: string;
  positiveIsGood?: boolean;
}) {
  if (value === 0) {
    return (
      <span className="text-[11px] font-medium text-gray-400">No change {suffix}</span>
    );
  }
  const up = value > 0;
  const good = positiveIsGood ? up : !up;
  return (
    <span
      className={`text-[11px] font-semibold ${good ? "text-emerald-600" : "text-red-500"}`}
    >
      {up ? "↑" : "↓"} {Math.abs(value)}
      {suffix}
    </span>
  );
}

type WorkforceKpiData = {
  totalEmployees: number;
  presentToday: number;
  presentPct: number;
  presentDeltaPct: number;
  onLeaveToday: number;
  onLeavePct: number;
  onLeaveDeltaPct: number;
  newJoinersThisMonth: number;
  joinersDelta: number;
  departmentsCount: number;
};

export function WorkforceKpiCards({
  data,
  className = "",
}: {
  data: WorkforceKpiData | null | undefined;
  className?: string;
}) {
  const kpiCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: "Total Employees",
        value: data.totalEmployees,
        sub: "Active employees",
        icon: Users,
        iconWrap: "bg-blue-50 text-[#2563EB]",
        trend: null as ReactNode,
      },
      {
        title: "Present Today",
        value: data.presentToday,
        sub: `${data.presentPct}% of total`,
        icon: UserCheck,
        iconWrap: "bg-emerald-50 text-emerald-600",
        trend: (
          <TrendChip value={data.presentDeltaPct} suffix="% vs yesterday" positiveIsGood />
        ),
      },
      {
        title: "On Leave",
        value: data.onLeaveToday,
        sub: `${data.onLeavePct}% of total`,
        icon: UserX,
        iconWrap: "bg-orange-50 text-orange-500",
        trend: (
          <TrendChip
            value={data.onLeaveDeltaPct}
            suffix="% vs yesterday"
            positiveIsGood={false}
          />
        ),
      },
      {
        title: "New Joiners",
        value: data.newJoinersThisMonth,
        sub: "This month",
        icon: UserPlus,
        iconWrap: "bg-violet-50 text-violet-600",
        trend: (
          <TrendChip
            value={data.joinersDelta}
            suffix=" vs last month"
            positiveIsGood
          />
        ),
      },
      {
        title: "Departments",
        value: data.departmentsCount,
        sub: "Active departments",
        icon: Building2,
        iconWrap: "bg-sky-50 text-sky-600",
        trend: null,
      },
    ];
  }, [data]);

  if (kpiCards.length === 0) return null;

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 ${className}`.trim()}
    >
      {kpiCards.map((card) => (
        <div
          key={card.title}
          className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs font-medium text-gray-500">{card.title}</div>
              <div className="text-2xl font-bold text-[#1F2937] mt-1">{card.value}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{card.sub}</div>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconWrap}`}
            >
              <card.icon size={18} />
            </div>
          </div>
          {card.trend}
        </div>
      ))}
    </div>
  );
}
