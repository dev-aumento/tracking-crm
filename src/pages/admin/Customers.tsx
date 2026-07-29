import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { motion } from "framer-motion";
import { Building2, Loader2, Plus, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NewCustomerForm,
  type CustomerFormValues,
  type CustomerRecord,
} from "@/components/customers/NewCustomerForm";
import { CustomerDetailView } from "@/components/customers/CustomerDetailView";
import { trpc } from "@/providers/trpc";
import {
  clearLegacyCustomers,
  hasMigratedLegacyCustomers,
  loadLegacyCustomers,
  markLegacyCustomersMigrated,
} from "@/lib/customer-store";

export default function AdminCustomers() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ customerId?: string }>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isCreate = /\/admin\/customers\/new\/?$/.test(location.pathname);
  const isEdit = /\/admin\/customers\/\d+\/edit\/?$/.test(location.pathname);
  const customerId =
    params.customerId && /^\d+$/.test(params.customerId) ? Number(params.customerId) : null;
  const isDetail = customerId != null && !isEdit && !isCreate;

  const utils = trpc.useUtils();
  const { data: customers = [], isLoading } = trpc.customer.list.useQuery();
  const importLegacy = trpc.customer.importLegacy.useMutation();
  const createMutation = trpc.customer.create.useMutation();
  const updateMutation = trpc.customer.update.useMutation();
  const deleteMutation = trpc.customer.delete.useMutation();

  useEffect(() => {
    if (hasMigratedLegacyCustomers()) return;
    const legacy = loadLegacyCustomers();
    if (legacy.length === 0) {
      markLegacyCustomersMigrated();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await importLegacy.mutateAsync({
          customers: legacy.map((c) => {
            const { id, createdAt, ...rest } = c;
            return {
              ...rest,
              legacyId: String(id),
              createdAt: typeof createdAt === "string" ? createdAt : undefined,
              contactPersons: Array.isArray(rest.contactPersons) ? rest.contactPersons : [],
            };
          }),
        });
        if (cancelled) return;
        clearLegacyCustomers();
        markLegacyCustomersMigrated();
        await utils.customer.list.invalidate();
      } catch {
        // Keep legacy data so retry is possible on next visit.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCustomer =
    customerId != null ? customers.find((c) => c.id === customerId) ?? null : null;

  async function handleSave(values: CustomerFormValues) {
    setSaveError(null);
    try {
      const saved =
        isEdit && customerId != null
          ? await updateMutation.mutateAsync({ id: customerId, ...values })
          : await createMutation.mutateAsync(values);
      await utils.customer.list.invalidate();
      navigate(`/admin/customers/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save customer");
    }
  }

  async function handleDelete() {
    if (!selectedCustomer) return;
    const ok = window.confirm(
      `Delete customer "${selectedCustomer.displayName}"? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ id: selectedCustomer.id });
      await utils.customer.list.invalidate();
      navigate("/admin/customers", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete customer");
    }
  }

  if (isCreate) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {saveError ? <p className="mb-3 text-sm text-red-600">{saveError}</p> : null}
        <NewCustomerForm
          key={`customer-create-${location.key}`}
          initialCustomer={undefined}
          onCancel={() => navigate("/admin/customers")}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      </motion.div>
    );
  }

  if (isEdit) {
    if (isLoading) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 flex items-center justify-center gap-2 text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Loading customer…
        </div>
      );
    }
    if (!selectedCustomer) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <p className="text-sm text-gray-600 mb-4">Customer not found.</p>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/customers")}>
            Back to customers
          </Button>
        </div>
      );
    }
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {saveError ? <p className="mb-3 text-sm text-red-600">{saveError}</p> : null}
        <NewCustomerForm
          key={`customer-edit-${selectedCustomer.id}`}
          initialCustomer={selectedCustomer as CustomerRecord}
          onCancel={() => navigate(`/admin/customers/${selectedCustomer.id}`)}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      </motion.div>
    );
  }

  if (isDetail) {
    if (isLoading) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 flex items-center justify-center gap-2 text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Loading customer…
        </div>
      );
    }
    if (!selectedCustomer) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <p className="text-sm text-gray-600 mb-4">Customer not found.</p>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/customers")}>
            Back to customers
          </Button>
        </div>
      );
    }
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {deleteError ? <p className="mb-3 text-sm text-red-600">{deleteError}</p> : null}
        <CustomerDetailView
          customer={selectedCustomer as CustomerRecord}
          onBack={() => {
            setDeleteError(null);
            navigate("/admin/customers");
          }}
          onEdit={() => navigate(`/admin/customers/${selectedCustomer.id}/edit`)}
          onDelete={handleDelete}
          deleting={deleteMutation.isPending}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage customer accounts and details
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setSaveError(null);
            navigate("/admin/customers/new");
          }}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white gap-2"
        >
          <Plus size={16} />
          Add New Customer
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 flex items-center justify-center gap-2 text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          Loading customers…
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <Building2 size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No customers yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Add your first customer to start managing invoices and contacts
          </p>
          <Button
            type="button"
            onClick={() => navigate("/admin/customers/new")}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white gap-2"
          >
            <Plus size={16} />
            Add New Customer
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Customer</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Type</span>
            <span>Place of Supply</span>
          </div>
          <div className="divide-y divide-gray-100">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => navigate(`/admin/customers/${customer.id}`)}
                className="w-full text-left grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-2 sm:gap-3 px-5 py-4 hover:bg-gray-50/80 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#2563EB] truncate dark:text-white">
                    {customer.displayName}
                  </div>
                  {customer.companyName ? (
                    <div className="text-xs text-gray-400 truncate">{customer.companyName}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{customer.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">
                    {customer.mobile || customer.workPhone || "—"}
                  </span>
                </div>
                <div className="text-sm text-gray-600 capitalize">{customer.customerType}</div>
                <div className="text-sm text-gray-600 truncate">
                  {customer.placeOfSupply || "—"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
