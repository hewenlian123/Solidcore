export type CustomerIdentityCandidate = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
};

export type CustomerIdentityInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  companyName?: string | null;
};

export type CustomerMatchStrength = "STRONG" | "POSSIBLE";

export function normalizeIdentityText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function normalizePhoneDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function classifyCustomerIdentityMatch(
  input: CustomerIdentityInput,
  candidate: CustomerIdentityCandidate,
): CustomerMatchStrength | null {
  const email = normalizeIdentityText(input.email);
  const candidateEmail = normalizeIdentityText(candidate.email);
  const phone = normalizePhoneDigits(input.phone);
  const candidatePhone = normalizePhoneDigits(candidate.phone);

  if (
    (email && email === candidateEmail) ||
    (phone.length >= 7 && phone === candidatePhone)
  ) {
    return "STRONG";
  }

  const name = normalizeIdentityText(input.name);
  const company = normalizeIdentityText(input.companyName);
  const candidateName = normalizeIdentityText(candidate.name);
  const candidateCompany = normalizeIdentityText(candidate.companyName);
  if (
    (name && name === candidateName) ||
    (company && (company === candidateCompany || company === candidateName))
  ) {
    return "POSSIBLE";
  }

  return null;
}
