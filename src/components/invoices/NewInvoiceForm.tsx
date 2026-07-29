import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CustomerRecord } from "@/components/customers/NewCustomerForm";
import { InvoicePdfPreview } from "@/components/invoices/InvoicePdfPreview";
import {
  formatMoney,
  INVOICE_CURRENCIES,
  invoiceSubTotal,
  invoiceTotal,
  lineAmount,
  nextInvoiceNumber,
  type InvoiceFormValues,
  type InvoiceLineItem,
  type InvoiceRecord,
  type InvoiceStatus,
} from "@/lib/invoice-store";

const fieldClass =
  "h-10 rounded-lg border border-gray-200 bg-white text-sm text-[#1F2937] focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/30";
const selectClass = cn(
  fieldClass,
  "w-full px-3 outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/30",
);

const TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
];

function todayInputDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptyItem(): InvoiceLineItem {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    itemDetails: "",
    quantity: 1,
    rate: 0,
    discountPercent: 0,
    taxPercent: 0,
  };
}

type NewInvoiceFormProps = {
  onCancel: () => void;
  onSave: (invoice: InvoiceFormValues) => void | Promise<void>;
  initialInvoice?: InvoiceRecord;
  customers: CustomerRecord[];
  existingInvoices?: Pick<InvoiceRecord, "invoiceNumber">[];
  saving?: boolean;
};

export function NewInvoiceForm({
  onCancel,
  onSave,
  initialInvoice,
  customers,
  existingInvoices = [],
  saving = false,
}: NewInvoiceFormProps) {
  const isEditing = Boolean(initialInvoice);
  const [customerId, setCustomerId] = useState<number | "">(
    initialInvoice?.customerId ?? "",
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    () => initialInvoice?.invoiceNumber ?? nextInvoiceNumber(existingInvoices),
  );
  const [orderNumber, setOrderNumber] = useState(initialInvoice?.orderNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initialInvoice?.invoiceDate ?? todayInputDate());
  const [terms, setTerms] = useState(initialInvoice?.terms ?? "due_on_receipt");
  const [dueDate, setDueDate] = useState(initialInvoice?.dueDate ?? todayInputDate());
  const [salesperson, setSalesperson] = useState(initialInvoice?.salesperson ?? "");
  const [currency, setCurrency] = useState(
    () => initialInvoice?.currency || "INR",
  );
  const [items, setItems] = useState<InvoiceLineItem[]>(
    () => (initialInvoice?.items?.length ? initialInvoice.items : [emptyItem()]),
  );
  const [customerNotes, setCustomerNotes] = useState(
    initialInvoice?.customerNotes ?? "Thanks for your business.",
  );
  const [shippingCharges, setShippingCharges] = useState(initialInvoice?.shippingCharges ?? 0);
  const [taxMode, setTaxMode] = useState<"tds" | "tcs" | "none">(initialInvoice?.taxMode ?? "none");
  const [taxPercent, setTaxPercent] = useState(initialInvoice?.taxPercent ?? 0);
  const [adjustment, setAdjustment] = useState(initialInvoice?.adjustment ?? 0);
  const [roundOff, setRoundOff] = useState(initialInvoice?.roundOff ?? false);
  const [markAsPaid, setMarkAsPaid] = useState(initialInvoice?.status === "paid");
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );
  const subTotal = invoiceSubTotal(items);
  const total = invoiceTotal({
    items,
    shippingCharges,
    taxMode,
    taxPercent,
    adjustment,
    roundOff,
  });
  const paymentMade = markAsPaid ? total : 0;
  const balanceDue = markAsPaid ? 0 : total;
  const igstAmount =
    taxMode === "none" && taxPercent > 0
      ? (subTotal * Number(taxPercent)) / 100
      : 0;
  const tdsTcsAmount =
    (taxMode === "tds" || taxMode === "tcs") && taxPercent > 0
      ? (subTotal * Number(taxPercent)) / 100
      : 0;

  const previewInvoice = useMemo<InvoiceRecord | null>(() => {
    const previewItems = items.filter((item) => item.itemDetails.trim());
    if (!selectedCustomer && previewItems.length === 0 && !invoiceNumber.trim()) {
      return null;
    }
    return {
      id: initialInvoice?.id ?? 0,
      invoiceNumber: invoiceNumber.trim() || "Aumento/—",
      orderNumber: orderNumber.trim(),
      customerId: typeof customerId === "number" ? customerId : 0,
      customerName: selectedCustomer?.displayName || "Select a customer",
      currency,
      invoiceDate: invoiceDate || todayInputDate(),
      terms,
      dueDate: dueDate || invoiceDate || todayInputDate(),
      salesperson: salesperson.trim(),
      items: previewItems.length > 0 ? previewItems : [
        {
          id: "preview_placeholder",
          itemDetails: "Item details will appear here",
          quantity: 0,
          rate: 0,
          discountPercent: 0,
          taxPercent: 0,
        },
      ],
      customerNotes,
      shippingCharges: Number(shippingCharges) || 0,
      taxMode,
      taxPercent: Number(taxPercent) || 0,
      adjustment: Number(adjustment) || 0,
      roundOff,
      status: markAsPaid ? "paid" : (initialInvoice?.status === "paid" ? "sent" : (initialInvoice?.status ?? "draft")),
      createdAt: initialInvoice?.createdAt ?? new Date().toISOString(),
    };
  }, [
    adjustment,
    customerId,
    customerNotes,
    currency,
    dueDate,
    initialInvoice?.createdAt,
    initialInvoice?.id,
    initialInvoice?.status,
    invoiceDate,
    invoiceNumber,
    items,
    markAsPaid,
    orderNumber,
    roundOff,
    salesperson,
    selectedCustomer,
    shippingCharges,
    taxMode,
    taxPercent,
    terms,
  ]);

  function updateItem(id: string, patch: Partial<InvoiceLineItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  async function persist(status: InvoiceStatus) {
    if (customerId === "" || !selectedCustomer) {
      setError("Please select a customer.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }
    if (!invoiceDate) {
      setError("Invoice date is required.");
      return;
    }
    const validItems = items.filter((item) => item.itemDetails.trim());
    if (validItems.length === 0) {
      setError("Add at least one item.");
      return;
    }

    const resolvedStatus: InvoiceStatus =
      status === "draft" ? "draft" : markAsPaid ? "paid" : status;

    await onSave({
      id: initialInvoice?.id,
      invoiceNumber: invoiceNumber.trim(),
      orderNumber: orderNumber.trim(),
      customerId,
      customerName: selectedCustomer.displayName,
      currency,
      invoiceDate,
      terms,
      dueDate: dueDate || invoiceDate,
      salesperson: salesperson.trim(),
      items: validItems.map((item) => ({ ...item, taxPercent: 0 })),
      customerNotes,
      shippingCharges: Number(shippingCharges) || 0,
      taxMode,
      taxPercent: Number(taxPercent) || 0,
      adjustment: Number(adjustment) || 0,
      roundOff,
      status: resolvedStatus,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">
            {isEditing ? "Edit Invoice" : "New Invoice"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEditing
              ? "Update invoice details and line items"
              : "Create and save a customer invoice"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-gray-200 text-gray-600"
        >
          <X size={16} />
          Close
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 gap-5">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">
                  Customer Name *
                </Label>
                <select
                  value={customerId === "" ? "" : String(customerId)}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : "";
                    setCustomerId(nextId);
                    if (typeof nextId === "number") {
                      const customer = customers.find((c) => c.id === nextId);
                      if (customer?.currency) setCurrency(customer.currency);
                    }
                    setError(null);
                  }}
                  className={cn(selectClass, "w-full")}
                >
                  <option value="">Select or add a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    Invoice# *
                  </Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    Currency
                  </Label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={selectClass}
                  >
                    {INVOICE_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                    {!INVOICE_CURRENCIES.some((c) => c.code === currency) && currency ? (
                      <option value={currency}>{currency}</option>
                    ) : null}
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    Order Number
                  </Label>
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Invoice Date *
                </Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Terms</Label>
                <select
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className={selectClass}
                >
                  {TERMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Salesperson
                </Label>
                <Input
                  value={salesperson}
                  onChange={(e) => setSalesperson(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:grid grid-cols-[minmax(0,2fr)_70px_90px_80px_90px_36px] gap-2">
              <span>Item Details</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>Disc %</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_70px_90px_80px_90px_36px] gap-2 items-center"
                >
                  <Input
                    value={item.itemDetails}
                    onChange={(e) => updateItem(item.id, { itemDetails: e.target.value })}
                    placeholder="Type or click to select an item"
                    className={fieldClass}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.id, { quantity: Number(e.target.value) || 0 })
                    }
                    className={fieldClass}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(item.id, { rate: Number(e.target.value) || 0 })}
                    className={fieldClass}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.discountPercent}
                    onChange={(e) =>
                      updateItem(item.id, { discountPercent: Number(e.target.value) || 0 })
                    }
                    className={fieldClass}
                  />
                  <div className="text-sm font-medium text-gray-700 text-right">
                    {formatMoney(lineAmount(item), currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="justify-self-end text-gray-400 hover:text-red-500"
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="border-gray-200 text-gray-700 gap-2"
              >
                <Plus size={16} />
                Add New Row
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <Label className="text-sm font-medium text-gray-700">Customer Notes</Label>
              <Textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                rows={3}
                className="rounded-lg border-gray-200"
              />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Sub Total</span>
                <span className="font-medium text-gray-800">{formatMoney(subTotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm text-gray-600">Shipping Charges</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={shippingCharges}
                  onChange={(e) => setShippingCharges(Number(e.target.value) || 0)}
                  className={cn(fieldClass, "max-w-[140px]")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "tds" | "tcs" | "none")} className={cn(selectClass, "w-[110px]")}>
                  <option value="none">Tax</option>
                  <option value="tds">TDS</option>
                  <option value="tcs">TCS</option>
                </select>
                <Input type="number" min={0} step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value) || 0)} className={cn(fieldClass, "w-[90px]")}/>
                <span className="text-sm text-gray-500">%</span>
                {taxMode === "none" && taxPercent > 0 ? (
                  <span className="ml-auto text-sm font-medium text-gray-800">
                    {formatMoney(igstAmount, currency)}
                  </span>
                ) : null}
                {(taxMode === "tds" || taxMode === "tcs") && taxPercent > 0 ? (
                  <span className="ml-auto text-sm font-medium text-gray-800">
                    {taxMode === "tds" ? "-" : "+"}
                    {formatMoney(tdsTcsAmount, currency)}
                  </span>
                ) : null}
              </div>
              {taxMode === "none" && taxPercent > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">IGST ({taxPercent}%)</span>
                  <span className="font-medium text-gray-800">{formatMoney(igstAmount, currency)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm text-gray-600">Adjustment</Label>
                <Input type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value) || 0)} className={cn(fieldClass, "max-w-[140px]")}/>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} className="accent-[#2563EB]"/>
                Round Off
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={markAsPaid} onChange={(e) => setMarkAsPaid(e.target.checked)} className="accent-[#2563EB]"/>
                Mark as Paid
              </label>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-base font-semibold text-[#1F2937]">
                  Total ({currency})
                </span>
                <span className="text-xl font-bold text-[#1F2937]">{formatMoney(total, currency)}</span>
              </div>
              {markAsPaid ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 text-semibold">Payment Made</span>
                    <span className="font-medium text-red-600">
                      (-){" "}
                      {paymentMade.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-[#1F2937]">Balance Due</span>
                    <span className="text-base font-bold text-[#1F2937]">
                      {formatMoney(balanceDue, currency)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => void persist("draft")} className="border-gray-200 text-gray-700">
              {saving ? "Saving…" : isEditing ? "Update as Draft" : "Save as Draft"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void persist("sent")} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white">
              {saving ? "Saving…" : isEditing ? "Update" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} className="border-gray-200 text-gray-600">
              Cancel
            </Button>
          </div>
        </div>

        <InvoicePdfPreview
          invoice={previewInvoice}
          customer={selectedCustomer ?? null}
          useCurrentDate
          className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)]"
        />
      </div>
    </div>
  );
}
