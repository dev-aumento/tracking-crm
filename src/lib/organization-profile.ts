export const ORGANIZATION_PROFILE_STORAGE_KEY = "settings-organization-profile";

export type OrgAdditionalField = { id: string; label: string; value: string };

export type OrganizationProfileForm = {
  organizationId: string;
  logoDataUrl: string | null;
  name: string;
  industry: string;
  businessType: string;
  location: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  zip: string;
  state: string;
  phone: string;
  fax: string;
  website: string;
  differentPaymentAddress: boolean;
  paymentAddressLine1: string;
  paymentAddressLine2: string;
  paymentCity: string;
  paymentZip: string;
  paymentState: string;
  paymentCountry: string;
  paymentPhone: string;
  primaryContactName: string;
  primaryContactEmail: string;
  baseCurrency: string;
  fiscalYear: string;
  language: string;
  timeZone: string;
  dateFormat: string;
  companyIdType: string;
  companyIdValue: string;
  taxIdType: string;
  taxIdValue: string;
  additionalFields: OrgAdditionalField[];
};

export const DEFAULT_ORGANIZATION_PROFILE: OrganizationProfileForm = {
  organizationId: "12345678",
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

export function loadOrganizationProfile(): OrganizationProfileForm {
  try {
    const raw = localStorage.getItem(ORGANIZATION_PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ORGANIZATION_PROFILE };
    const parsed = JSON.parse(raw) as Partial<OrganizationProfileForm>;
    return {
      ...DEFAULT_ORGANIZATION_PROFILE,
      ...parsed,
      additionalFields: Array.isArray(parsed.additionalFields)
        ? parsed.additionalFields
        : [],
    };
  } catch {
    return { ...DEFAULT_ORGANIZATION_PROFILE };
  }
}

export function formatOrganizationAddress(org: OrganizationProfileForm): string[] {
  const lines: string[] = [];
  if (org.addressLine1.trim()) lines.push(org.addressLine1.trim());
  if (org.addressLine2.trim()) lines.push(org.addressLine2.trim());
  const cityLine = [org.city, org.state, org.zip].filter((p) => p?.trim()).join(" ");
  if (cityLine) {
    const withCountry = org.location?.trim()
      ? `${cityLine}, ${org.location.trim()}`
      : cityLine;
    lines.push(withCountry);
  } else if (org.location?.trim()) {
    lines.push(org.location.trim());
  }
  return lines;
}

export function formatCustomerBillingAddress(customer: {
  billingAddress1?: string;
  billingAddress2?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountry?: string;
}): string[] {
  const lines: string[] = [];
  if (customer.billingAddress1?.trim()) lines.push(customer.billingAddress1.trim());
  if (customer.billingAddress2?.trim()) lines.push(customer.billingAddress2.trim());
  const cityState = [customer.billingCity, customer.billingState]
    .filter((p) => p?.trim())
    .join(", ");
  const cityLine = [cityState, customer.billingZip].filter((p) => p?.trim()).join(" ");
  if (cityLine) lines.push(cityLine);
  if (customer.billingCountry?.trim()) lines.push(customer.billingCountry.trim());
  return lines;
}
