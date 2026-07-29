import { useState } from "react";
import { ArrowLeft, Pencil, Download, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  invoiceSubTotal,
  invoiceTotal,
  lineAmount,
  type InvoiceRecord,
} from "@/lib/invoice-store";
import {
  downloadInvoiceAsCsv,
  downloadInvoiceAsPdf,
  printInvoice,
} from "@/lib/invoice-download";
import type { CustomerRecord } from "@/components/customers/NewCustomerForm";
import { InvoicePdfPreview } from "@/components/invoices/InvoicePdfPreview";

const TERMS_LABEL: Record<string, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
};

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type InvoiceDetailViewProps = {
  invoice: InvoiceRecord;
  customer?: CustomerRecord | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  deleting?: boolean;
};

export function InvoiceDetailView({
  invoice,
  customer = null,
  onBack,
  onEdit,
  onDelete,
  deleting = false,
}: InvoiceDetailViewProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const subTotal = invoiceSubTotal(invoice.items);
  const total = invoiceTotal(invoice);
  const currency = invoice.currency || "INR";
  const exportOptions = { customer, useCurrentDate: true };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] mb-2"
          >
            <ArrowLeft size={14} />
            Back to invoices
          </button>
          <h1 className="text-2xl font-bold text-[#1F2937]">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {invoice.customerName} · {currency} ·{" "}
            <span className="capitalize">{invoice.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onEdit}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white gap-2"
          >
            <Pencil size={14} />
            Edit
          </Button>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDownloadOpen((open) => !open)}
              className="border-gray-200 text-gray-700 gap-2"
            >
              <Download size={14} />
              Download
              <ChevronDown size={14} />
            </Button>
            {downloadOpen ? (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    void downloadInvoiceAsPdf(invoice, exportOptions);
                    setDownloadOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    printInvoice(invoice, exportOptions);
                    setDownloadOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Print
                </button>
              </div>
            ) : null}
          </div>
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50 gap-2"
            >
              <Trash2 size={14} />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="border-gray-200 text-gray-700"
          >
            Close
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Customer</div>
              <div className="font-semibold text-[#1F2937] mt-1">{invoice.customerName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Invoice Date</div>
              <div className="font-medium text-[#1F2937] mt-1">
                {formatDate(invoice.invoiceDate)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Due Date</div>
              <div className="font-medium text-[#1F2937] mt-1">{formatDate(invoice.dueDate)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Terms</div>
              <div className="font-medium text-[#1F2937] mt-1">
                {TERMS_LABEL[invoice.terms] || invoice.terms || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Order Number</div>
              <div className="font-medium text-[#1F2937] mt-1">{invoice.orderNumber || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Salesperson</div>
              <div className="font-medium text-[#1F2937] mt-1">{invoice.salesperson || "—"}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[minmax(140px,2fr)_70px_90px_80px_100px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>Discount</span>
                  <span>Amount</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {invoice.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(140px,2fr)_70px_90px_80px_100px] gap-2 px-4 py-3 text-sm items-center"
                    >
                      <span className="text-[#1F2937] font-medium">{item.itemDetails}</span>
                      <span className="text-gray-600">{item.quantity}</span>
                      <span className="text-gray-600">{formatMoney(item.rate, currency)}</span>
                      <span className="text-gray-600">{item.discountPercent}%</span>
                      <span className="font-semibold text-[#1F2937]">
                        {formatMoney(lineAmount(item), currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                Customer Notes
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {invoice.customerNotes || "—"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Sub Total</span>
                <span className="font-semibold">{formatMoney(subTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">{formatMoney(invoice.shippingCharges, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {invoice.taxMode === "none"
                    ? invoice.taxPercent > 0
                      ? `IGST (${invoice.taxPercent}%)`
                      : "Tax"
                    : `${invoice.taxMode.toUpperCase()} (${invoice.taxPercent}%)`}
                </span>
                <span className="font-medium">
                  {invoice.taxPercent > 0
                    ? `${invoice.taxMode === "tds" ? "-" : ""}${formatMoney((subTotal * invoice.taxPercent) / 100, currency)}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Adjustment</span>
                <span className="font-medium">{formatMoney(invoice.adjustment, currency)}</span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-base font-semibold text-[#1F2937]">Total ({currency})</span>
                <span className="text-xl font-bold text-[#1F2937]">{formatMoney(total, currency)}</span>
              </div>
              {invoice.status === "paid" ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 text-semibold">Payment Made</span>
                    <span className="font-medium text-red-600">
                      (-){" "}
                      {total.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-[#1F2937]">Balance Due</span>
                    <span className="text-base font-bold text-[#1F2937]">
                      {formatMoney(0, currency)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <InvoicePdfPreview
          invoice={invoice}
          customer={customer}
          useCurrentDate
          className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)]"
        />
      </div>
    </div>
  );
}
