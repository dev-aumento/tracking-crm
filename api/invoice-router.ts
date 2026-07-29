import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, adminQuery } from "./middleware";
import { ensureSchema } from "./lib/migrate";
import {
  getCollection,
  insertDoc,
  findById,
  updateById,
  hasMongoConfigured,
} from "./queries/connection";
import { isAuthDisabled } from "./lib/dev-mode";
import { Collections } from "@db/mongo/collections";
import type { InvoiceDoc } from "@db/mongo/types";
import { orgFilter, requireOrganizationId } from "./lib/tenant";
import { assertPermission } from "./lib/permissions";

const lineItemSchema = z.object({
  id: z.string(),
  itemDetails: z.string(),
  quantity: z.number(),
  rate: z.number(),
  discountPercent: z.number(),
  taxPercent: z.number(),
});

const invoiceInputSchema = z.object({
  invoiceNumber: z.string().min(1),
  orderNumber: z.string(),
  customerId: z.number(),
  customerName: z.string().min(1),
  invoiceDate: z.string(),
  terms: z.string(),
  dueDate: z.string(),
  salesperson: z.string(),
  items: z.array(lineItemSchema).min(1),
  customerNotes: z.string(),
  shippingCharges: z.number(),
  taxMode: z.enum(["tds", "tcs", "none"]),
  taxPercent: z.number(),
  adjustment: z.number(),
  roundOff: z.boolean(),
  currency: z.string().min(3).max(3).optional().default("INR"),
  status: z.enum(["draft", "sent", "paid"]),
});

const mockInvoices: InvoiceDoc[] = [];
let mockNextId = 1;

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function toClient(doc: InvoiceDoc) {
  return {
    ...doc,
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt:
      doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

export const invoiceRouter = createRouter({
  list: adminQuery.query(async ({ ctx }) => {
    assertPermission(ctx.user, "invoices.manage");
    if (useMock()) {
      return mockInvoices
        .filter((inv) => inv.organizationId === (ctx.user.organizationId ?? 1))
        .map(toClient);
    }

    await ensureSchema();
    const col = await getCollection<InvoiceDoc>(Collections.invoices);
    const docs = await col
      .find(orgFilter(ctx.user))
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(toClient);
  }),

  get: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.user, "invoices.manage");
      if (useMock()) {
        const doc = mockInvoices.find(
          (inv) =>
            inv.id === input.id && inv.organizationId === (ctx.user.organizationId ?? 1),
        );
        return doc ? toClient(doc) : null;
      }

      await ensureSchema();
      const doc = await findById<InvoiceDoc>(Collections.invoices, input.id);
      if (!doc || doc.organizationId !== requireOrganizationId(ctx.user)) return null;
      return toClient(doc);
    }),

  create: adminQuery
    .input(invoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "invoices.manage");
      const now = new Date();
      const organizationId = requireOrganizationId(ctx.user);

      if (useMock()) {
        const doc: InvoiceDoc = {
          id: mockNextId++,
          organizationId,
          ...input,
          createdBy: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        };
        mockInvoices.unshift(doc);
        return toClient(doc);
      }

      await ensureSchema();
      const doc = await insertDoc<InvoiceDoc>(Collections.invoices, {
        organizationId,
        ...input,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      });
      return toClient(doc);
    }),

  update: adminQuery
    .input(invoiceInputSchema.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "invoices.manage");
      const { id, ...data } = input;
      const now = new Date();

      if (useMock()) {
        const idx = mockInvoices.findIndex(
          (inv) =>
            inv.id === id && inv.organizationId === (ctx.user.organizationId ?? 1),
        );
        if (idx < 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        }
        mockInvoices[idx] = {
          ...mockInvoices[idx]!,
          ...data,
          updatedAt: now,
        };
        return toClient(mockInvoices[idx]!);
      }

      await ensureSchema();
      const existing = await findById<InvoiceDoc>(Collections.invoices, id);
      if (!existing || existing.organizationId !== requireOrganizationId(ctx.user)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      await updateById<InvoiceDoc>(Collections.invoices, id, {
        ...data,
        updatedAt: now,
      });
      const updated = await findById<InvoiceDoc>(Collections.invoices, id);
      return toClient(updated!);
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "invoices.manage");
      const organizationId = requireOrganizationId(ctx.user);

      if (useMock()) {
        const idx = mockInvoices.findIndex(
          (inv) => inv.id === input.id && inv.organizationId === organizationId,
        );
        if (idx < 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        }
        mockInvoices.splice(idx, 1);
        return { success: true };
      }

      await ensureSchema();
      const existing = await findById<InvoiceDoc>(Collections.invoices, input.id);
      if (!existing || existing.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      const col = await getCollection<InvoiceDoc>(Collections.invoices);
      await col.deleteOne({ id: input.id, organizationId });
      return { success: true };
    }),

  importLegacy: adminQuery
    .input(
      z.object({
        invoices: z.array(
          invoiceInputSchema.extend({
            legacyId: z.string().optional(),
            createdAt: z.string().optional(),
            /** Legacy localStorage used string customer ids. */
            legacyCustomerId: z.union([z.string(), z.number()]).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "invoices.manage");
      if (input.invoices.length === 0) return { imported: 0 };

      const organizationId = requireOrganizationId(ctx.user);
      let imported = 0;

      if (useMock()) {
        for (const item of input.invoices) {
          const { legacyId: _l, legacyCustomerId: _c, createdAt, ...data } = item;
          const exists = mockInvoices.some(
            (inv) =>
              inv.organizationId === organizationId &&
              inv.invoiceNumber === data.invoiceNumber,
          );
          if (exists) continue;
          const now = createdAt ? new Date(createdAt) : new Date();
          mockInvoices.unshift({
            id: mockNextId++,
            organizationId,
            ...data,
            createdBy: ctx.user.id,
            createdAt: now,
            updatedAt: now,
          });
          imported += 1;
        }
        return { imported };
      }

      await ensureSchema();
      const col = await getCollection<InvoiceDoc>(Collections.invoices);
      for (const item of input.invoices) {
        const { legacyId: _l, legacyCustomerId: _c, createdAt, ...data } = item;
        const exists = await col.findOne({
          organizationId,
          invoiceNumber: data.invoiceNumber,
        });
        if (exists) continue;
        const now = createdAt ? new Date(createdAt) : new Date();
        await insertDoc<InvoiceDoc>(Collections.invoices, {
          organizationId,
          ...data,
          createdBy: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        });
        imported += 1;
      }
      return { imported };
    }),
});
