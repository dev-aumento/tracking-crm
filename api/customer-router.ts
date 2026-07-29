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
import type { CustomerDoc, InvoiceDoc } from "@db/mongo/types";
import { orgFilter, requireOrganizationId } from "./lib/tenant";
import { assertPermission } from "./lib/permissions";

const contactPersonSchema = z.object({
  salutation: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  workPhone: z.string(),
  mobile: z.string(),
});

const customerInputSchema = z.object({
  customerType: z.enum(["business", "individual"]),
  salutation: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  companyName: z.string(),
  displayName: z.string().min(1),
  currency: z.string(),
  email: z.string(),
  workPhone: z.string(),
  mobile: z.string(),
  gstTreatment: z
    .enum([
      "registered_business",
      "registered_composition",
      "unregistered_business",
      "consumer",
      "overseas",
      "sez",
      "deemed_export",
    ])
    .optional()
    .default("registered_business"),
  gstNumber: z.string(),
  businessLegalName: z.string().optional().default(""),
  businessTradeName: z.string().optional().default(""),
  placeOfSupply: z.string(),
  pan: z.string(),
  taxPreference: z.enum(["taxable", "tax_exempt"]),
  paymentTerms: z.string(),
  billingCountry: z.string(),
  billingAddress1: z.string(),
  billingAddress2: z.string(),
  billingCity: z.string(),
  billingState: z.string(),
  billingZip: z.string(),
  billingPhone: z.string(),
  shippingCountry: z.string(),
  shippingAddress1: z.string(),
  shippingAddress2: z.string(),
  shippingCity: z.string(),
  shippingState: z.string(),
  shippingZip: z.string(),
  shippingPhone: z.string(),
  contactPersons: z.array(contactPersonSchema).default([]),
  customFieldLabel: z.string(),
  customFieldValue: z.string(),
  remarks: z.string(),
});

type MockCustomer = CustomerDoc;
const mockCustomers: MockCustomer[] = [];
let mockNextId = 1;

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function toClient(doc: CustomerDoc) {
  return {
    ...doc,
    gstTreatment:
      doc.gstTreatment ||
      (doc.gstNumber?.trim() ? "registered_business" : "unregistered_business"),
    businessLegalName: doc.businessLegalName || "",
    businessTradeName: doc.businessTradeName || "",
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt:
      doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

export const customerRouter = createRouter({
  list: adminQuery.query(async ({ ctx }) => {
    assertPermission(ctx.user, "customers.manage");
    if (useMock()) {
      return mockCustomers
        .filter((c) => c.organizationId === (ctx.user.organizationId ?? 1))
        .map(toClient);
    }

    await ensureSchema();
    const col = await getCollection<CustomerDoc>(Collections.customers);
    const docs = await col
      .find(orgFilter(ctx.user))
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(toClient);
  }),

  get: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.user, "customers.manage");
      if (useMock()) {
        const doc = mockCustomers.find(
          (c) => c.id === input.id && c.organizationId === (ctx.user.organizationId ?? 1),
        );
        return doc ? toClient(doc) : null;
      }

      await ensureSchema();
      const doc = await findById<CustomerDoc>(Collections.customers, input.id);
      if (!doc || doc.organizationId !== requireOrganizationId(ctx.user)) return null;
      return toClient(doc);
    }),

  create: adminQuery
    .input(customerInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "customers.manage");
      const now = new Date();
      const organizationId = requireOrganizationId(ctx.user);

      if (useMock()) {
        const doc: MockCustomer = {
          id: mockNextId++,
          organizationId,
          ...input,
          createdBy: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        };
        mockCustomers.unshift(doc);
        return toClient(doc);
      }

      await ensureSchema();
      const doc = await insertDoc<CustomerDoc>(Collections.customers, {
        organizationId,
        ...input,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      });
      return toClient(doc);
    }),

  update: adminQuery
    .input(customerInputSchema.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "customers.manage");
      const { id, ...data } = input;
      const now = new Date();

      if (useMock()) {
        const idx = mockCustomers.findIndex(
          (c) => c.id === id && c.organizationId === (ctx.user.organizationId ?? 1),
        );
        if (idx < 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
        }
        mockCustomers[idx] = {
          ...mockCustomers[idx]!,
          ...data,
          updatedAt: now,
        };
        return toClient(mockCustomers[idx]!);
      }

      await ensureSchema();
      const existing = await findById<CustomerDoc>(Collections.customers, id);
      if (!existing || existing.organizationId !== requireOrganizationId(ctx.user)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }

      await updateById<CustomerDoc>(Collections.customers, id, {
        ...data,
        updatedAt: now,
      });
      const updated = await findById<CustomerDoc>(Collections.customers, id);
      return toClient(updated!);
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "customers.manage");
      const organizationId = requireOrganizationId(ctx.user);

      if (useMock()) {
        const idx = mockCustomers.findIndex(
          (c) => c.id === input.id && c.organizationId === organizationId,
        );
        if (idx < 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
        }
        mockCustomers.splice(idx, 1);
        return { success: true };
      }

      await ensureSchema();
      const existing = await findById<CustomerDoc>(Collections.customers, input.id);
      if (!existing || existing.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }

      const invoiceCol = await getCollection<InvoiceDoc>(Collections.invoices);
      const linked = await invoiceCol.countDocuments({
        organizationId,
        customerId: input.id,
      });
      if (linked > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete customer with ${linked} linked invoice(s). Delete those invoices first.`,
        });
      }

      const col = await getCollection<CustomerDoc>(Collections.customers);
      await col.deleteOne({ id: input.id, organizationId });
      return { success: true };
    }),

  /** One-time import of browser-local legacy records into the org database. */
  importLegacy: adminQuery
    .input(
      z.object({
        customers: z.array(
          customerInputSchema.extend({
            legacyId: z.string().optional(),
            createdAt: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.user, "customers.manage");
      if (input.customers.length === 0) return { imported: 0, idMap: {} as Record<string, number> };

      const organizationId = requireOrganizationId(ctx.user);
      let imported = 0;
      const idMap: Record<string, number> = {};

      if (useMock()) {
        for (const item of input.customers) {
          const { legacyId, createdAt, ...data } = item;
          const existing = mockCustomers.find(
            (c) =>
              c.organizationId === organizationId &&
              c.displayName === data.displayName &&
              c.email === data.email,
          );
          if (existing) {
            if (legacyId) idMap[legacyId] = existing.id;
            continue;
          }
          const now = createdAt ? new Date(createdAt) : new Date();
          const doc: MockCustomer = {
            id: mockNextId++,
            organizationId,
            ...data,
            createdBy: ctx.user.id,
            createdAt: now,
            updatedAt: now,
          };
          mockCustomers.unshift(doc);
          if (legacyId) idMap[legacyId] = doc.id;
          imported += 1;
        }
        return { imported, idMap };
      }

      await ensureSchema();
      const col = await getCollection<CustomerDoc>(Collections.customers);
      for (const item of input.customers) {
        const { legacyId, createdAt, ...data } = item;
        const existing = await col.findOne({
          organizationId,
          displayName: data.displayName,
          email: data.email,
        });
        if (existing) {
          if (legacyId) idMap[legacyId] = existing.id;
          continue;
        }
        const now = createdAt ? new Date(createdAt) : new Date();
        const doc = await insertDoc<CustomerDoc>(Collections.customers, {
          organizationId,
          ...data,
          createdBy: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        });
        if (legacyId) idMap[legacyId] = doc.id;
        imported += 1;
      }
      return { imported, idMap };
    }),
});
