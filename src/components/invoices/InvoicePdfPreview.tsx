import { useEffect, useMemo, useRef } from "react";
import { FileText } from "lucide-react";
import {
  buildInvoiceHtml,
  type InvoiceCustomerLike,
  type InvoiceExportOptions,
} from "@/lib/invoice-download";
import type { InvoiceRecord } from "@/lib/invoice-store";
import { cn } from "@/lib/utils";

type InvoicePdfPreviewProps = {
  invoice: InvoiceRecord | null;
  customer?: InvoiceCustomerLike | null;
  useCurrentDate?: boolean;
  className?: string;
  title?: string;
};

export function InvoicePdfPreview({
  invoice,
  customer = null,
  useCurrentDate = true,
  className,
  title = "PDF Preview",
}: InvoicePdfPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const options: InvoiceExportOptions = useMemo(
    () => ({ customer, useCurrentDate }),
    [customer, useCurrentDate],
  );

  const html = useMemo(() => {
    if (!invoice) return null;
    try {
      return buildInvoiceHtml(invoice, options);
    } catch {
      return null;
    }
  }, [invoice, options]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !html) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div
      className={cn(
        "flex flex-col bg-gray-100 border border-gray-200 rounded-xl overflow-hidden min-h-[420px]",
        className,
      )}
    >
      <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2">
        <FileText size={14} className="text-[#2563EB]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {title}
        </span>
      </div>
      <div className="flex-1 min-h-0 bg-[#e5e7eb] p-3 sm:p-4 overflow-auto">
        {html ? (
          <div className="mx-auto w-full max-w-[210mm] bg-white shadow-md rounded-sm overflow-hidden min-h-[280px]">
            <iframe
              ref={iframeRef}
              title={title}
              className="w-full border-0 bg-white"
              style={{ minHeight: "720px", height: "100%" }}
            />
          </div>
        ) : (
          <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-6 text-gray-500">
            <FileText size={28} className="text-gray-300 mb-2" />
            <p className="text-sm font-medium">Preview unavailable</p>
            <p className="text-xs mt-1">
              Select a customer and add line items to see the invoice preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
