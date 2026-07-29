export type InvoiceLineItem = {
  id: string;
  itemDetails: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
};

export type InvoiceStatus = "draft" | "sent" | "paid";

export const INVOICE_CURRENCIES = [
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "QAR", label: "QAR — Qatari Riyal" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
] as const;

export type InvoiceCurrencyCode = (typeof INVOICE_CURRENCIES)[number]["code"];

export type InvoiceRecord = {
  id: number;
  invoiceNumber: string;
  orderNumber: string;
  customerId: number;
  customerName: string;
  /** ISO currency code; defaults to INR when missing on older invoices. */
  currency?: string;
  invoiceDate: string;
  terms: string;
  dueDate: string;
  salesperson: string;
  items: InvoiceLineItem[];
  customerNotes: string;
  shippingCharges: number;
  taxMode: "tds" | "tcs" | "none";
  taxPercent: number;
  adjustment: number;
  roundOff: boolean;
  status: InvoiceStatus;
  createdAt: string;
};

export type InvoiceFormValues = Omit<InvoiceRecord, "id" | "createdAt"> & {
  id?: number;
};

export const INVOICES_STORAGE_KEY = "tracker.admin.invoices";
export const INVOICES_MIGRATED_KEY = "tracker.admin.invoices.migrated.v1";

/** Legacy localStorage shape (string ids) used before Mongo persistence. */
export type LegacyInvoiceRecord = Omit<InvoiceRecord, "id" | "customerId"> & {
  id: string | number;
  customerId: string | number;
};

export function loadLegacyInvoices(): LegacyInvoiceRecord[] {
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacyInvoices() {
  localStorage.removeItem(INVOICES_STORAGE_KEY);
}

export function hasMigratedLegacyInvoices(): boolean {
  return localStorage.getItem(INVOICES_MIGRATED_KEY) === "1";
}

export function markLegacyInvoicesMigrated() {
  localStorage.setItem(INVOICES_MIGRATED_KEY, "1");
}

export function nextInvoiceNumber(existing: Pick<InvoiceRecord, "invoiceNumber">[] = []): string {
  const max = existing.reduce((acc, inv) => {
    const match = inv.invoiceNumber.match(/(\d+)\s*$/);
    const num = match ? Number(match[1]) : 0;
    return Number.isFinite(num) ? Math.max(acc, num) : acc;
  }, 0);
  return `Aumento/${max + 1}`;
}

export function lineAmount(item: InvoiceLineItem): number {
  const base = item.quantity * item.rate;
  const afterDiscount = base * (1 - (item.discountPercent || 0) / 100);
  // Tax is applied at invoice level (IGST / TDS / TCS), not per line item.
  return Math.max(0, afterDiscount);
}

export function invoiceSubTotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, item) => sum + lineAmount(item), 0);
}

export function invoiceTotal(invoice: Pick<
  InvoiceRecord,
  "items" | "shippingCharges" | "taxMode" | "taxPercent" | "adjustment" | "roundOff"
>): number {
  const sub = invoiceSubTotal(invoice.items);
  const shipping = Number(invoice.shippingCharges) || 0;
  const adjustment = Number(invoice.adjustment) || 0;
  let total = sub + shipping + adjustment;
  if (invoice.taxPercent > 0) {
    const taxAmount = (sub * invoice.taxPercent) / 100;
    // "none" = Tax/IGST (adds); TCS adds; TDS deducts
    total = invoice.taxMode === "tds" ? total - taxAmount : total + taxAmount;
  }
  if (invoice.roundOff) total = Math.round(total);
  return Math.max(0, total);
}

/** Invoice-level IGST when Tax mode is selected (taxMode "none"). */
export function invoiceIgstAmount(invoice: Pick<
  InvoiceRecord,
  "items" | "taxMode" | "taxPercent"
>): number {
  if (invoice.taxMode !== "none" || !(invoice.taxPercent > 0)) return 0;
  return (invoiceSubTotal(invoice.items) * invoice.taxPercent) / 100;
}

export function formatMoney(value: number, currency = "INR"): string {
  const code = currency || "INR";
  const locale = code === "INR" ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "JPY" ? 0 : 2,
    }).format(value || 0);
  } catch {
    return `${currencySymbol(code)}${(value || 0).toFixed(2)}`;
  }
}

/** Display currency symbol (HTML preview / UI). */
export function currencySymbol(currency = "INR"): string {
  const code = (currency || "INR").toUpperCase();
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
    AUD: "A$",
    CAD: "C$",
    SGD: "S$",
    JPY: "¥",
    CHF: "CHF ",
    NZD: "NZ$",
    SAR: "SAR ",
    QAR: "QAR ",
    HKD: "HK$",
  };
  return symbols[code] || `${code} `;
}

/**
 * Currency prefix for jsPDF built-in fonts (WinAnsi — limited Unicode).
 * Prefer real symbols where the font supports them; fall back otherwise.
 */
export function currencyPdfPrefix(currency = "INR"): string {
  const code = (currency || "INR").toUpperCase();
  const symbols: Record<string, string> = {
    INR: "Rs.", // ₹ is not in Helvetica; Rs. is PDF-safe for file download
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "AED",
    AUD: "A$",
    CAD: "C$",
    SGD: "S$",
    JPY: "¥",
    CHF: "CHF",
    NZD: "NZ$",
    SAR: "SAR",
    QAR: "QAR",
    HKD: "HK$",
  };
  return symbols[code] || code;
}
