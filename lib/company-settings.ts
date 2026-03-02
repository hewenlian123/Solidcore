export const COMPANY_SETTINGS = {
  name: "Solidcore Building Supply",
  address: "Company Address Placeholder",
  phone: "Company Phone Placeholder",
  email: "company@email.placeholder",
  // Optional configurable PDF theme colors (hex, e.g. "#21527f").
  pdf_theme_primary: "#4b5563",
  pdf_theme_title: "#111827",
  pdf_theme_text: "#1f2937",
  pdf_theme_muted: "#6b7280",
  // Enterprise PDF settings (safe additive extension).
  company_logo_url: "",
  accepted_payment_methods: ["Cash", "Credit Card", "Check", "Bank Transfer"] as string[],
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_routing_number: "",
  invoice_terms_text:
    "Payment due per terms stated on invoice. Late balances may be subject to additional charges.",
  // Backward-compat alias for existing callers.
  logoUrl: "",
};
