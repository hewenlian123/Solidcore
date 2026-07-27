"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SaleCustomer } from "@/app/sales-orders/create-sale-types";

type CustomerKind = "BUSINESS" | "INDIVIDUAL";

type DuplicateMatch = Partial<SaleCustomer> & {
  id: string;
  name: string;
  strength?: "STRONG" | "POSSIBLE";
};

type DuplicateResponse = {
  code?: "CUSTOMER_STRONG_MATCH" | "CUSTOMER_POSSIBLE_MATCH";
  error?: string;
  matches?: DuplicateMatch[];
};

type NewCustomerDialogProps = {
  open: boolean;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onCustomerSelected: (customer: SaleCustomer, jobSiteName?: string) => void;
};

const emptyAddress = {
  address1: "",
  city: "",
  state: "HI",
  zipCode: "",
};

function asCustomer(match: DuplicateMatch): SaleCustomer {
  return {
    id: match.id,
    name: match.name,
    phone: match.phone ?? null,
    email: match.email ?? null,
    installAddress: match.installAddress ?? null,
    billingAddress: match.billingAddress ?? null,
    city: match.city ?? null,
    state: match.state ?? null,
    zipCode: match.zipCode ?? null,
    companyName: match.companyName ?? null,
    customerType: match.customerType ?? null,
    taxExempt: Boolean(match.taxExempt),
    taxRate: match.taxRate ?? null,
    notes: match.notes ?? null,
  };
}

export function NewCustomerDialog({
  open,
  initialName = "",
  onOpenChange,
  onCustomerSelected,
}: NewCustomerDialogProps) {
  const [kind, setKind] = useState<CustomerKind>("BUSINESS");
  const [businessName, setBusinessName] = useState(initialName);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobSiteName, setJobSiteName] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [taxExempt, setTaxExempt] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState("");
  const [duplicateResponse, setDuplicateResponse] =
    useState<DuplicateResponse | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusinessName(initialName);
    setDuplicateResponse(null);
    setDuplicateReason("");
    setError("");
  }, [initialName, open]);

  const identityName = useMemo(
    () => (kind === "BUSINESS" ? businessName.trim() : contactName.trim()),
    [businessName, contactName, kind],
  );

  function resetAndClose() {
    setKind("BUSINESS");
    setBusinessName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setJobSiteName("");
    setAddress(emptyAddress);
    setTaxExempt(false);
    setDuplicateReason("");
    setDuplicateResponse(null);
    setError("");
    onOpenChange(false);
  }

  async function createCustomer() {
    if (!identityName) {
      setError(
        kind === "BUSINESS"
          ? "Business name is required."
          : "Customer name is required.",
      );
      return;
    }
    if (kind === "BUSINESS" && !contactName.trim()) {
      setError("Primary contact is required for a business customer.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError(
        "Add a phone number or email so this customer can be identified safely.",
      );
      return;
    }
    if (
      duplicateResponse?.code === "CUSTOMER_POSSIBLE_MATCH" &&
      !duplicateReason.trim()
    ) {
      setError("Explain why this is a separate customer before creating it.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: identityName,
          companyName: kind === "BUSINESS" ? businessName.trim() : null,
          contactName: contactName.trim(),
          contactRole: kind === "BUSINESS" ? "Primary contact" : "Customer",
          jobSiteName: jobSiteName.trim(),
          customerType: kind === "BUSINESS" ? "COMMERCIAL" : "RESIDENTIAL",
          phone: phone.trim(),
          email: email.trim(),
          installAddress: address.address1.trim(),
          billingAddress: address.address1.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zipCode: address.zipCode.trim(),
          taxExempt,
          notes: [
            contactName.trim() && kind === "BUSINESS"
              ? `Primary contact: ${contactName.trim()}`
              : "",
            jobSiteName.trim() ? `Job site: ${jobSiteName.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          duplicateReviewReason: duplicateReason.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        DuplicateResponse | { data?: SaleCustomer; error?: string };
      if (response.status === 409) {
        setDuplicateResponse(payload as DuplicateResponse);
        setError(
          String(payload.error ?? "Review the matching customer records."),
        );
        return;
      }
      if (!response.ok || !("data" in payload) || !payload.data) {
        throw new Error(
          String(payload.error ?? "Could not create this customer."),
        );
      }
      onCustomerSelected(payload.data, jobSiteName.trim());
      resetAndClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create this customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  const matches = duplicateResponse?.matches ?? [];
  const possibleMatch = duplicateResponse?.code === "CUSTOMER_POSSIBLE_MATCH";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Identity is checked before a second customer record is created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div
            aria-label="Customer type"
            className="grid grid-cols-2 gap-1 rounded-sc border border-border bg-surface-secondary p-1"
          >
            <Button
              variant={kind === "BUSINESS" ? "outline" : "ghost"}
              onClick={() => setKind("BUSINESS")}
              aria-pressed={kind === "BUSINESS"}
            >
              <Building2 aria-hidden="true" className="h-4 w-4" />
              Business
            </Button>
            <Button
              variant={kind === "INDIVIDUAL" ? "outline" : "ghost"}
              onClick={() => setKind("INDIVIDUAL")}
              aria-pressed={kind === "INDIVIDUAL"}
            >
              <UserRound aria-hidden="true" className="h-4 w-4" />
              Individual
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {kind === "BUSINESS" ? (
              <Field
                label="Business name"
                htmlFor="new-customer-business"
                required
              >
                <Input
                  id="new-customer-business"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  autoComplete="organization"
                />
              </Field>
            ) : null}
            <Field
              label={kind === "BUSINESS" ? "Primary contact" : "Customer name"}
              htmlFor="new-customer-contact"
              required
            >
              <Input
                id="new-customer-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Phone" htmlFor="new-customer-phone">
              <Input
                id="new-customer-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </Field>
            <Field label="Email" htmlFor="new-customer-email">
              <Input
                id="new-customer-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Job site</h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              This address will also be available as the delivery snapshot.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Job site name" htmlFor="new-customer-job-site">
                <Input
                  id="new-customer-job-site"
                  value={jobSiteName}
                  onChange={(event) => setJobSiteName(event.target.value)}
                  placeholder="Kailua remodel"
                />
              </Field>
              <Field label="Street address" htmlFor="new-customer-address">
                <Input
                  id="new-customer-address"
                  value={address.address1}
                  onChange={(event) =>
                    setAddress((current) => ({
                      ...current,
                      address1: event.target.value,
                    }))
                  }
                  autoComplete="street-address"
                />
              </Field>
              <Field label="City" htmlFor="new-customer-city">
                <Input
                  id="new-customer-city"
                  value={address.city}
                  onChange={(event) =>
                    setAddress((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  autoComplete="address-level2"
                />
              </Field>
              <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                <Field label="State" htmlFor="new-customer-state">
                  <Input
                    id="new-customer-state"
                    value={address.state}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        state: event.target.value,
                      }))
                    }
                    maxLength={2}
                    autoComplete="address-level1"
                  />
                </Field>
                <Field label="ZIP" htmlFor="new-customer-zip">
                  <Input
                    id="new-customer-zip"
                    value={address.zipCode}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        zipCode: event.target.value,
                      }))
                    }
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </Field>
              </div>
            </div>
          </div>

          <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={taxExempt}
              onChange={(event) => setTaxExempt(event.target.checked)}
              className="h-5 w-5 rounded-sm border-border accent-action"
            />
            Tax exempt
          </label>

          {matches.length > 0 ? (
            <div
              className="border border-warning bg-warning-surface p-4"
              role="alert"
            >
              <div className="flex gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {possibleMatch
                      ? "Possible customer match"
                      : "Existing customer found"}
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {matches.map((match) => (
                      <div
                        key={match.id}
                        className="flex flex-col gap-3 border-t border-warning/25 pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {match.companyName || match.name}
                          </p>
                          <p className="text-xs text-foreground-secondary">
                            {[match.name, match.phone, match.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onCustomerSelected(asCustomer(match));
                            resetAndClose();
                          }}
                        >
                          Use existing
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {possibleMatch ? (
            <Field
              label="Reason to create separate customer"
              htmlFor="duplicate-review-reason"
              required
              hint="This explanation is saved with the customer record."
            >
              <Textarea
                id="duplicate-review-reason"
                value={duplicateReason}
                onChange={(event) => setDuplicateReason(event.target.value)}
                placeholder="Different company, household, or billing entity"
              />
            </Field>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-medium text-critical">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button
            onClick={createCustomer}
            loading={saving}
            disabled={duplicateResponse?.code === "CUSTOMER_STRONG_MATCH"}
          >
            {possibleMatch ? "Create separate customer" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
