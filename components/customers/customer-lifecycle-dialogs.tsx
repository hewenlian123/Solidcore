"use client";

import { useEffect, useState } from "react";
import { Archive, RotateCcw, Search, UsersRound } from "lucide-react";
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
import { cn } from "@/lib/utils";

type CommonProps = {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ArchiveCustomerDialog({
  customerId,
  customerName,
  archived,
  open,
  onOpenChange,
  onSaved,
}: CommonProps & {
  archived: boolean;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const action = archived ? "RESTORE" : "ARCHIVE";

  function close() {
    setReason("");
    setError("");
    onOpenChange(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error ||
            `Could not ${archived ? "restore" : "archive"} this customer.`,
        );
      }
      onSaved();
      close();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not ${archived ? "restore" : "archive"} this customer.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {archived ? "Restore customer" : "Archive customer"}
          </DialogTitle>
          <DialogDescription>
            {archived
              ? `${customerName} will return to active customer search and sales workflows.`
              : `${customerName} will leave active search. Orders and financial history stay intact.`}
          </DialogDescription>
        </DialogHeader>
        <Field
          label={archived ? "Restore reason" : "Archive reason"}
          htmlFor="customer-lifecycle-reason"
          required
        >
          <Textarea
            id="customer-lifecycle-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              archived
                ? "Why is this customer active again?"
                : "Why should this customer leave active workflows?"
            }
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
            {archived ? (
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Archive aria-hidden="true" className="h-4 w-4" />
            )}
            {archived ? "Restore customer" : "Archive customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MergeCandidate = {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
};

export function MergeCustomerDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
  onMerged,
}: CommonProps & {
  onMerged: (targetCustomerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [targetCustomerId, setTargetCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/customers?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not search customers.");
        }
        setCandidates(
          (Array.isArray(payload.data) ? payload.data : []).filter(
            (candidate: MergeCandidate) => candidate.id !== customerId,
          ),
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not search customers.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [customerId, open, query]);

  function close() {
    setQuery("");
    setCandidates([]);
    setTargetCustomerId("");
    setReason("");
    setError("");
    onOpenChange(false);
  }

  async function merge() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${customerId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCustomerId, reason }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not merge these customers.");
      }
      close();
      onMerged(payload.data.targetCustomerId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not merge these customers.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge customer</DialogTitle>
          <DialogDescription>
            Move contacts, Job Sites, Follow-Ups, and notes from {customerName}{" "}
            into one active customer. Historical orders and money records keep
            their original links.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Find merge target" htmlFor="merge-customer-search">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
              />
              <Input
                id="merge-customer-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Name, company, phone, or email"
              />
            </div>
          </Field>

          <div
            aria-label="Merge target"
            className="max-h-56 divide-y divide-border overflow-y-auto border-y border-border"
          >
            {loading ? (
              <p className="px-2 py-4 text-sm text-foreground-secondary">
                Searching customers...
              </p>
            ) : candidates.length === 0 ? (
              <p className="px-2 py-4 text-sm text-foreground-secondary">
                No active customer matches this search.
              </p>
            ) : (
              candidates.map((candidate) => {
                const selected = targetCustomerId === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTargetCustomerId(candidate.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left",
                      selected ? "bg-selected" : "hover:bg-hover",
                    )}
                  >
                    <UsersRound
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-foreground-secondary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {candidate.companyName || candidate.name}
                      </span>
                      <span className="block truncate text-xs text-foreground-secondary">
                        {[candidate.name, candidate.phone, candidate.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <Field label="Merge reason" htmlFor="customer-merge-reason" required>
            <Textarea
              id="customer-merge-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why these records represent the same customer."
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
          <Button
            onClick={merge}
            loading={saving}
            disabled={!targetCustomerId || reason.trim().length < 8}
          >
            <UsersRound aria-hidden="true" className="h-4 w-4" />
            Merge into selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
