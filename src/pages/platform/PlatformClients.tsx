import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Check, ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/providers/trpc";
import { formatInr } from "@/lib/platform-admin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function FieldSelect({
  value,
  disabled,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "inline-flex h-10 w-[168px] items-center justify-between gap-2 rounded-xl border border-[#E6E8EC] bg-[#F8FAFC] px-3 text-sm font-medium text-[#111827]",
            "shadow-none hover:bg-white hover:border-[#D1D5DB]",
            "focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#2563EB]/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-[#334155] dark:bg-[#1E293B] dark:text-white dark:hover:bg-[#1E293B]",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
          <ChevronDown size={14} className="shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={16}
        className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-[#E6E8EC] bg-white p-1 text-[#111827] shadow-lg dark:border-[#334155] dark:bg-[#0F172A] dark:text-slate-100"
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                isSelected
                  ? "bg-[#EEF4FF] font-medium text-[#2563EB] focus:bg-[#EEF4FF] focus:text-[#2563EB]"
                  : "text-[#111827] dark:text-slate-100",
              )}
            >
              <span className="truncate">{option.label}</span>
              {isSelected ? <Check size={14} className="shrink-0 text-[#2563EB]" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatPurchaseDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const paid = status === "paid";
  const unpaid = status === "unpaid";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        paid && "bg-emerald-50 text-emerald-700",
        unpaid && "bg-red-50 text-red-600",
        status === "cancelled" && "bg-gray-100 text-gray-600",
        !paid && !unpaid && status !== "cancelled" && "bg-amber-50 text-amber-700",
      )}
    >
      {status}
    </span>
  );
}

export default function PlatformClients() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const utils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const { data: catalog } = trpc.platform.plans.useQuery();
  const { data, isLoading } = trpc.platform.listClients.useQuery({ search });
  const update = trpc.platform.updateSubscription.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.platform.listClients.invalidate(),
        utils.platform.overview.invalidate(),
      ]);
      toast.success("Subscription updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.platform.deleteClient.useMutation({
    onSuccess: async (result) => {
      setDeleteTarget(null);
      await Promise.all([
        utils.platform.listClients.invalidate(),
        utils.platform.overview.invalidate(),
      ]);
      toast.success(`${result.name} was deleted`);
    },
    onError: (error) => toast.error(error.message),
  });

  const planOptions = (catalog ?? []).map((plan) => ({
    value: plan.slug,
    label: plan.name,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-[28px] dark:text-white">
          Subscribed Clients
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Every customer workspace that purchased or signed up for FlowTicX.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#E6E8EC] bg-white shadow-sm dark:border-[#1E293B] dark:bg-[#0F172A]">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#6B7280]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading customers...
          </div>
        ) : !data?.length ? (
          <p className="py-16 text-center text-sm text-[#6B7280]">
            {search ? "No customers match that search." : "No customer workspaces yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(0,1fr)_168px_168px_140px_44px] items-center gap-3 border-b border-[#EEF0F3] px-5 py-3 dark:border-[#1E293B]">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9CA3AF] uppercase">
                  Client
                </p>
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9CA3AF] uppercase">
                  Plan
                </p>
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9CA3AF] uppercase">
                  Payment status
                </p>
                <p className="text-right text-[11px] font-semibold tracking-[0.08em] text-[#9CA3AF] uppercase">
                  Amount
                </p>
                <span className="sr-only">Actions</span>
              </div>
              <div className="divide-y divide-[#F1F3F5] dark:divide-[#1E293B]">
                {data.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[minmax(0,1fr)_168px_168px_140px_44px] items-center gap-3 px-5 py-4"
                  >
                    <Link
                      to={`/platform/clients/${row.id}`}
                      className="flex min-w-0 items-center gap-3 rounded-xl pr-2 hover:bg-[#F8FAFC] dark:hover:bg-white/5"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-sm font-bold text-[#2563EB]">
                        {(row.ownerName[0] ?? "C").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#111827] dark:text-white">{row.ownerName}</p>
                        <p className="truncate text-xs text-[#6B7280]">
                          {row.ownerEmail || "No email"} · {row.name} ·{" "}
                          {row.workspaceType === "client" ? "Client portal" : "Staff CRM"} ·{" "}
                          {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
                        </p>
                      </div>
                      <ChevronRight size={16} className="ml-auto shrink-0 text-[#D1D5DB]" />
                    </Link>
                    <FieldSelect
                      ariaLabel="Plan"
                      value={row.plan}
                      disabled={update.isPending}
                      options={
                        planOptions.some((option) => option.value === row.plan)
                          ? planOptions
                          : [...planOptions, { value: row.plan, label: row.plan }]
                      }
                      onChange={(plan) =>
                        update.mutate({
                          organizationId: row.id,
                          plan: plan as typeof row.plan,
                          planStatus: row.planStatus,
                        })
                      }
                    />
                    <FieldSelect
                      ariaLabel="Payment status"
                      value={row.planStatus}
                      disabled={update.isPending}
                      options={STATUS_OPTIONS}
                      onChange={(planStatus) =>
                        update.mutate({
                          organizationId: row.id,
                          plan: row.plan,
                          planStatus: planStatus as typeof row.planStatus,
                        })
                      }
                    />
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatInr(row.subscriptionAmount)}</p>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <p className="text-[11px] text-[#6B7280]">{formatPurchaseDate(row.purchasedAt)}</p>
                        <StatusBadge status={row.planStatus} />
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${row.name}`}
                      disabled={remove.isPending}
                      onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer workspace, its members, and their data. They will
              no longer be able to sign in. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep client</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={remove.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                remove.mutate({ organizationId: deleteTarget.id });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
