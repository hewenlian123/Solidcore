"use client";

import { useEffect, useRef, useState } from "react";
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

type ContactOption = {
  id: string;
  name: string;
};

type CommonDialogProps = {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AddContactDialog({
  customerId,
  open,
  onOpenChange,
  onSaved,
}: CommonDialogProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState("");
  const [possibleMatch, setPossibleMatch] = useState(false);
  const [matches, setMatches] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setName("");
    setRole("");
    setPhone("");
    setEmail("");
    setIsPrimary(false);
    setDuplicateReason("");
    setPossibleMatch(false);
    setMatches([]);
    setError("");
    onOpenChange(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          phone,
          email,
          isPrimary,
          duplicateReviewReason: duplicateReason,
        }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setPossibleMatch(payload.code === "CONTACT_POSSIBLE_MATCH");
        setMatches(Array.isArray(payload.matches) ? payload.matches : []);
        setError(payload.error || "Review the matching contact.");
        return;
      }
      if (!response.ok)
        throw new Error(payload.error || "Could not add contact.");
      onSaved();
      close();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add contact.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>
            A contact is a person connected to this customer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Contact name" htmlFor="contact-name" required>
            <Input
              id="contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="contact-role">
            <Input
              id="contact-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Project manager, buyer, homeowner"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="contact-phone">
              <Input
                id="contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
              />
            </Field>
            <Field label="Email" htmlFor="contact-email">
              <Input
                id="contact-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                inputMode="email"
              />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(event) => setIsPrimary(event.target.checked)}
              className="h-5 w-5 accent-action"
            />
            Primary contact
          </label>
          {matches.length > 0 ? (
            <div className="border border-warning bg-warning-surface p-3">
              <p className="text-sm font-semibold text-foreground">
                Matching contact found
              </p>
              {matches.map((match) => (
                <p
                  key={match.id}
                  className="mt-1 text-sm text-foreground-secondary"
                >
                  {match.name}
                </p>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={close}
              >
                Use existing contact
              </Button>
            </div>
          ) : null}
          {possibleMatch ? (
            <Field
              label="Reason to add separate contact"
              htmlFor="contact-duplicate-reason"
              required
            >
              <Textarea
                id="contact-duplicate-reason"
                value={duplicateReason}
                onChange={(event) => setDuplicateReason(event.target.value)}
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
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddJobSiteDialog({
  customerId,
  contacts,
  open,
  onOpenChange,
  onSaved,
}: CommonDialogProps & { contacts: ContactOption[] }) {
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("HI");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setName("");
    setContactId("");
    setAddress1("");
    setAddress2("");
    setCity("");
    setState("HI");
    setZipCode("");
    setNotes("");
    setError("");
    onOpenChange(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/job-sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactId,
          address1,
          address2,
          city,
          state,
          zipCode,
          notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not add Job Site.");
      onSaved();
      close();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add Job Site.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Job Site</DialogTitle>
          <DialogDescription>
            This location can be selected for future deliveries. Existing order
            snapshots do not change.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Job Site name" htmlFor="job-site-name" required>
            <Input
              id="job-site-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Site contact" htmlFor="job-site-contact">
            <select
              id="job-site-contact"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              className="h-11 w-full rounded-sc border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="">No specific contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Street address" htmlFor="job-site-address" required>
            <Input
              id="job-site-address"
              value={address1}
              onChange={(event) => setAddress1(event.target.value)}
            />
          </Field>
          <Field label="Address line 2" htmlFor="job-site-address-2">
            <Input
              id="job-site-address-2"
              value={address2}
              onChange={(event) => setAddress2(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" htmlFor="job-site-city" required>
              <Input
                id="job-site-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-[1fr_1.5fr] gap-3">
              <Field label="State" htmlFor="job-site-state" required>
                <Input
                  id="job-site-state"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  maxLength={2}
                />
              </Field>
              <Field label="ZIP" htmlFor="job-site-zip" required>
                <Input
                  id="job-site-zip"
                  value={zipCode}
                  onChange={(event) => setZipCode(event.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </div>
          <Field label="Site notes" htmlFor="job-site-notes">
            <Textarea
              id="job-site-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-medium text-critical">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add Job Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddFollowUpDialog({
  customerId,
  defaultOwner,
  open,
  onOpenChange,
  onSaved,
}: CommonDialogProps & { defaultOwner: string }) {
  const [owner, setOwner] = useState(defaultOwner);
  const [dueAt, setDueAt] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const creationKeyRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setOwner(defaultOwner);
    creationKeyRef.current = requestKey();
  }, [defaultOwner, open]);

  function close() {
    setOwner(defaultOwner);
    setDueAt("");
    setNextAction("");
    setError("");
    creationKeyRef.current = "";
    onOpenChange(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/follow-ups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": creationKeyRef.current,
        },
        body: JSON.stringify({ owner, dueAt, nextAction }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not create Follow-Up.");
      onSaved();
      close();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create Follow-Up.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Follow-Up</DialogTitle>
          <DialogDescription>
            Assign a specific next action and due date.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Owner" htmlFor="follow-up-owner" required>
            <Input
              id="follow-up-owner"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            />
          </Field>
          <Field label="Due date and time" htmlFor="follow-up-due" required>
            <Input
              id="follow-up-due"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
          <Field label="Next action" htmlFor="follow-up-action" required>
            <Textarea
              id="follow-up-action"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Call customer with updated lead time"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-medium text-critical">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Create Follow-Up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddNoteDialog({
  customerId,
  open,
  onOpenChange,
  onSaved,
}: CommonDialogProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not add note.");
      setNote("");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add activity note</DialogTitle>
          <DialogDescription>
            Record the outcome and next relevant context.
          </DialogDescription>
        </DialogHeader>
        <Field label="Note" htmlFor="activity-note" required>
          <Textarea
            id="activity-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-32"
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-medium text-critical">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteFollowUpDialog({
  customerId,
  followUp,
  open,
  onOpenChange,
  onSaved,
}: CommonDialogProps & {
  followUp: { id: string; nextAction: string } | null;
}) {
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setOutcome("");
    setError("");
    onOpenChange(false);
  }

  async function save() {
    if (!followUp) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/customers/${customerId}/follow-ups/${followUp.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "COMPLETE",
            completionNote: outcome,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not complete Follow-Up.");
      }
      await onSaved();
      close();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not complete Follow-Up.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Follow-Up</DialogTitle>
          <DialogDescription>
            {followUp?.nextAction || "Record the outcome of this next action."}
          </DialogDescription>
        </DialogHeader>
        <Field label="Outcome" htmlFor="follow-up-outcome" required>
          <Textarea
            id="follow-up-outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="What happened, and what is the next relevant context?"
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-medium text-critical">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Complete Follow-Up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
