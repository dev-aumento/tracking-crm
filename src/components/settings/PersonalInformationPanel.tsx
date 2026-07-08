import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { Loader2, Pencil, Phone } from "lucide-react";
import { motion } from "framer-motion";

export const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const NOTIFICATION_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
] as const;

type PersonalForm = {
  firstName: string;
  lastName: string;
  secondName: string;
  email: string;
  position: string;
  department: string;
  phone: string;
  city: string;
  dateOfBirth: string;
  sex: string;
  notificationLanguage: string;
  headOfDepartmentUserIds: number[];
};

const EMPTY_FORM: PersonalForm = {
  firstName: "",
  lastName: "",
  secondName: "",
  email: "",
  position: "",
  department: "",
  phone: "",
  city: "",
  dateOfBirth: "",
  sex: "",
  notificationLanguage: "en",
  headOfDepartmentUserIds: [],
};

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function sexLabel(value: string | null | undefined) {
  return SEX_OPTIONS.find((o) => o.value === value)?.label ?? "—";
}

function languageLabel(value: string | null | undefined) {
  return NOTIFICATION_LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? "—";
}

function FieldRow({
  label,
  value,
  href,
  trailing,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-b-0">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="flex items-center gap-2 text-sm text-[#1F2937]">
        {href ? (
          <a href={href} className="text-[#2563EB] hover:underline">
            {value}
          </a>
        ) : (
          <span>{value || "—"}</span>
        )}
        {trailing}
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]";

type PersonalInformationPanelProps = {
  onSaved?: () => void;
  onError?: (message: string) => void;
};

export function PersonalInformationPanel({ onSaved, onError }: PersonalInformationPanelProps) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<PersonalForm>(EMPTY_FORM);

  const { data, isLoading } = trpc.auth.getPersonalInfo.useQuery();
  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });

  const updateMutation = trpc.auth.updatePersonalInfo.useMutation({
    onSuccess: async (updated) => {
      utils.auth.getPersonalInfo.setData(undefined, updated);
      utils.auth.me.invalidate();
      await utils.user.listForPicker.invalidate();
      setEditing(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    },
    onError: (error) => {
      onError?.(error.message || "Could not save personal information.");
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      secondName: data.secondName ?? "",
      email: data.email ?? "",
      position: data.position ?? "",
      department: data.department ?? "",
      phone: data.phone ?? "",
      city: data.city ?? "",
      dateOfBirth: toDateInputValue(data.dateOfBirth),
      sex: data.sex ?? "",
      notificationLanguage: data.notificationLanguage ?? "en",
      headOfDepartmentUserIds: data.headOfDepartmentUserIds ?? [],
    });
  }, [data]);

  const headNames =
    data?.headsOfDepartment?.map((h) => h.name).filter(Boolean).join(", ") || "—";

  const employeeOptions = (usersData?.users ?? []).filter((u) => u.id > 0);

  const selectedHeads = form.headOfDepartmentUserIds
    .map((id) => {
      const fromPicker = employeeOptions.find((u) => u.id === id);
      if (fromPicker) return fromPicker;
      const fromSaved = data?.headsOfDepartment?.find((h) => h.id === id);
      if (fromSaved) {
        return { id: fromSaved.id, name: fromSaved.name, email: null, avatar: null };
      }
      return null;
    })
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const addHeadOfDepartment = (userId: number) => {
    if (!userId) return;
    setForm((prev) => ({
      ...prev,
      headOfDepartmentUserIds: prev.headOfDepartmentUserIds.includes(userId)
        ? prev.headOfDepartmentUserIds
        : [...prev.headOfDepartmentUserIds, userId],
    }));
  };

  const removeHeadOfDepartment = (userId: number) => {
    setForm((prev) => ({
      ...prev,
      headOfDepartmentUserIds: prev.headOfDepartmentUserIds.filter((id) => id !== userId),
    }));
  };

  const handleSave = () => {
    if (!form.firstName.trim()) {
      onError?.("First name is required.");
      return;
    }

    updateMutation.mutate({
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      secondName: form.secondName.trim() || null,
      email: form.email.trim() || undefined,
      position: form.position.trim() || null,
      department: form.department.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      dateOfBirth: form.dateOfBirth || null,
      sex: form.sex
        ? (form.sex as "male" | "female" | "other" | "prefer_not_to_say")
        : null,
      notificationLanguage: form.notificationLanguage || null,
      headOfDepartmentUserIds: form.headOfDepartmentUserIds,
    });
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#1F2937]">Personal information</h2>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved</span>}
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-gray-500 hover:text-[#2563EB] transition-colors"
          >
            edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                if (data) {
                  setForm({
                    firstName: data.firstName ?? "",
                    lastName: data.lastName ?? "",
                    secondName: data.secondName ?? "",
                    email: data.email ?? "",
                    position: data.position ?? "",
                    department: data.department ?? "",
                    phone: data.phone ?? "",
                    city: data.city ?? "",
                    dateOfBirth: toDateInputValue(data.dateOfBirth),
                    sex: data.sex ?? "",
                    notificationLanguage: data.notificationLanguage ?? "en",
                    headOfDepartmentUserIds: data.headOfDepartmentUserIds ?? [],
                  });
                }
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-[#1D4ED8] disabled:opacity-50 inline-flex items-center gap-2"
            >
              {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              Save
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4">
          <FieldRow label="First name" value={data.firstName} />
          <FieldRow label="Last name" value={data.lastName} />
          <FieldRow
            label="Email"
            value={data.email}
            href={data.email ? `mailto:${data.email}` : undefined}
          />
          <FieldRow label="Position" value={data.position} />
          <FieldRow label="Department" value={data.department} />
          <FieldRow label="Second name" value={data.secondName} />
          <FieldRow label="Date of birth" value={formatDisplayDate(data.dateOfBirth)} />
          <FieldRow label="Sex" value={sexLabel(data.sex)} />
          <FieldRow
            label="Mobile phone"
            value={data.phone}
            href={data.phone ? `tel:${data.phone}` : undefined}
            trailing={data.phone ? <Phone size={14} className="text-gray-400" /> : null}
          />
          <FieldRow label="City" value={data.city} />
          <FieldRow label="Notification language" value={languageLabel(data.notificationLanguage)} />
          <FieldRow label="Head of department" value={headNames} />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="First name">
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Last name">
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Position">
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Department">
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Second name">
            <input
              type="text"
              value={form.secondName}
              onChange={(e) => setForm((prev) => ({ ...prev, secondName: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Date of birth">
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Sex">
            <select
              value={form.sex}
              onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select…</option>
              {SEX_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Mobile phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Notification language">
            <select
              value={form.notificationLanguage}
              onChange={(e) => setForm((prev) => ({ ...prev, notificationLanguage: e.target.value }))}
              className={inputClass}
            >
              {NOTIFICATION_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Head of department">
              <select
                value=""
                onChange={(e) => {
                  addHeadOfDepartment(Number(e.target.value));
                  e.target.value = "";
                }}
                className={inputClass}
                disabled={!usersData}
              >
                <option value="">
                  {usersData ? "Select employee…" : "Loading employees…"}
                </option>
                {employeeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email ?? `User #${u.id}`}
                    {u.department ? ` · ${u.department}` : ""}
                  </option>
                ))}
              </select>
              {selectedHeads.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedHeads.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {u.name ?? u.email ?? `User #${u.id}`}
                      <button
                        type="button"
                        onClick={() => removeHeadOfDepartment(u.id)}
                        className="text-gray-400 hover:text-red-600 leading-none"
                        aria-label={`Remove ${u.name ?? "employee"}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">No head of department selected.</p>
              )}
            </FormField>
          </div>
        </div>
      )}
    </motion.div>
  );
}
