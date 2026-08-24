import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { ensureSchema } from "./lib/migrate";
import { findById, hasMongoConfigured, updateById } from "./queries/connection";
import { isAuthDisabled } from "./lib/dev-mode";
import { Collections } from "@db/mongo/collections";
import type { OrganizationBillingProfile, OrganizationDoc } from "@db/mongo/types";
import { findOrganizationById, requireOrganizationId } from "./lib/tenant";
import { hasPermission } from "./lib/permissions";
import { Workspace } from "@contracts/constants";

const additionalFieldSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(200),
  value: z.string().max(500),
});

const billingProfileSchema = z.object({
  logoDataUrl: z.string().max(2_000_000).nullable(),
  name: z.string().min(1).max(200),
  industry: z.string().max(120).default(""),
  businessType: z.string().max(120).default(""),
  location: z.string().min(1).max(120),
  addressLine1: z.string().max(200).default(""),
  addressLine2: z.string().max(200).default(""),
  city: z.string().max(100).default(""),
  zip: z.string().max(30).default(""),
  state: z.string().max(100).default(""),
  phone: z.string().max(40).default(""),
  fax: z.string().max(40).default(""),
  website: z.string().max(200).default(""),
  differentPaymentAddress: z.boolean().default(false),
  paymentAddressLine1: z.string().max(200).default(""),
  paymentAddressLine2: z.string().max(200).default(""),
  paymentCity: z.string().max(100).default(""),
  paymentZip: z.string().max(30).default(""),
  paymentState: z.string().max(100).default(""),
  paymentCountry: z.string().max(120).default("India"),
  paymentPhone: z.string().max(40).default(""),
  primaryContactName: z.string().min(1).max(200),
  primaryContactEmail: z.string().email().max(320),
  baseCurrency: z.string().max(10).default("INR"),
  fiscalYear: z.string().max(40).default("january_december"),
  language: z.string().max(20).default("en"),
  timeZone: z.string().max(80).default("Asia/Kolkata"),
  dateFormat: z.string().max(40).default("dd MMM yyyy"),
  companyIdType: z.string().max(40).default("CIN"),
  companyIdValue: z.string().max(80).default(""),
  taxIdType: z.string().max(40).default("GSTIN"),
  taxIdValue: z.string().max(80).default(""),
  additionalFields: z.array(additionalFieldSchema).max(30).default([]),
});

const EMPTY_PROFILE: OrganizationBillingProfile = {
  logoDataUrl: null,
  name: "",
  industry: "",
  businessType: "",
  location: "India",
  addressLine1: "",
  addressLine2: "",
  city: "",
  zip: "",
  state: "",
  phone: "",
  fax: "",
  website: "",
  differentPaymentAddress: false,
  paymentAddressLine1: "",
  paymentAddressLine2: "",
  paymentCity: "",
  paymentZip: "",
  paymentState: "",
  paymentCountry: "India",
  paymentPhone: "",
  primaryContactName: "",
  primaryContactEmail: "",
  baseCurrency: "INR",
  fiscalYear: "january_december",
  language: "en",
  timeZone: "Asia/Kolkata",
  dateFormat: "dd MMM yyyy",
  companyIdType: "CIN",
  companyIdValue: "",
  taxIdType: "GSTIN",
  taxIdValue: "",
  additionalFields: [],
};

/** In-memory profiles for AUTH_DISABLED / no-Mongo local runs. */
const mockBillingByOrgId = new Map<number, OrganizationBillingProfile>();

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function canReadBillingProfile(user: {
  role?: string | null;
  permissions?: string[] | null;
}) {
  if (hasPermission(user, "invoices.manage")) return true;
  if (hasPermission(user, "customers.manage")) return true;
  if (String(user.role ?? "").toLowerCase() === "admin") return true;
  return false;
}

function canWriteBillingProfile(user: { role?: string | null }) {
  return String(user.role ?? "").toLowerCase() === "admin";
}

function normalizeProfile(
  profile: Partial<OrganizationBillingProfile> | null | undefined,
  fallbackName = "",
): OrganizationBillingProfile {
  return {
    ...EMPTY_PROFILE,
    ...(profile ?? {}),
    name: (profile?.name ?? fallbackName ?? "").trim(),
    additionalFields: Array.isArray(profile?.additionalFields)
      ? profile!.additionalFields
      : [],
  };
}

function toClientProfile(
  orgId: number,
  profile: OrganizationBillingProfile,
  options?: { billingProfileSaved?: boolean },
) {
  return {
    organizationId: String(orgId),
    billingProfileSaved: options?.billingProfileSaved ?? false,
    ...profile,
  };
}

export const organizationRouter = createRouter({
  /** Shared company profile for invoices — admin writes, finance/admin read. */
  getBillingProfile: authedQuery.query(async ({ ctx }) => {
    if (!canReadBillingProfile(ctx.user)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to view organization billing details",
      });
    }

    const orgId = requireOrganizationId(ctx.user);

    if (useMock()) {
      const stored = mockBillingByOrgId.get(orgId);
      return toClientProfile(
        orgId,
        normalizeProfile(stored, Workspace.name),
        { billingProfileSaved: Boolean(stored) },
      );
    }

    await ensureSchema();
    const org = await findOrganizationById(orgId);
    if (!org) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
    }

    return toClientProfile(
      orgId,
      normalizeProfile(org.billingProfile, org.name || Workspace.name),
      { billingProfileSaved: Boolean(org.billingProfile) },
    );
  }),

  updateBillingProfile: authedQuery
    .input(billingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canWriteBillingProfile(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admin can update organization billing details",
        });
      }

      const orgId = requireOrganizationId(ctx.user);
      const profile = normalizeProfile(input, input.name);

      if (useMock()) {
        mockBillingByOrgId.set(orgId, profile);
        return toClientProfile(orgId, profile, { billingProfileSaved: true });
      }

      await ensureSchema();
      const existing = await findById<OrganizationDoc>(Collections.organizations, orgId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const updated = await updateById<OrganizationDoc>(Collections.organizations, orgId, {
        name: profile.name.trim() || existing.name,
        billingProfile: profile,
        updatedAt: new Date(),
      });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      return toClientProfile(
        orgId,
        normalizeProfile(updated.billingProfile, updated.name),
        { billingProfileSaved: true },
      );
    }),
});
