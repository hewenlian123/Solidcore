"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { calculateAvailable } from "@/lib/inventory-availability";

type PurchaseOrderLine = {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  unit: string;
  expectedQty: string | number;
  receivedQty: string | number;
  closedShortQty: string | number;
  unitCost: string | number;
  notes: string | null;
  variant?: {
    inventoryStock: {
      onHand: string | number;
      reserved: string | number;
      hold: string | number;
      incoming: string | number;
      inTransit: string | number;
    } | null;
  };
};

type ReceiptItem = {
  id: string;
  sku: string;
  title: string;
  unit: string;
  expectedQty: string;
  priorReceivedQty: string;
  acceptedQty: string;
  damagedQty: string;
  holdQty: string;
  overageQty: string;
  shortageQty: string;
  wrongItemQty: string;
  closedShortQty: string;
  newReceivedQty: string;
  remainingQty: string;
  availableImpact: string;
  exceptionNote: string | null;
};

type Receipt = {
  id: string;
  status: string;
  actor: string;
  approvalActor: string | null;
  occurredAt: string;
  items: ReceiptItem[];
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedArrival: string | null;
  totalCost: string | number;
  notes: string | null;
  supplier: {
    id: string;
    name: string;
    contactName: string | null;
    phone: string | null;
  } | null;
  items: PurchaseOrderLine[];
  receipts: Receipt[];
};

type ReceiptDraft = {
  acceptedQty: string;
  damagedQty: string;
  holdQty: string;
  shortageQty: string;
  wrongItemQty: string;
  closedShortQty: string;
  exceptionNote: string;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quantity(value: unknown) {
  const parsed = number(value);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function dateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function legacyLines(po: PurchaseOrder): PurchaseOrderLine[] {
  if (po.items.length > 0) return po.items;
  const parsed = safeJsonParse(po.notes);
  if (!Array.isArray(parsed?.items)) return [];
  return parsed.items
    .map((item: Record<string, unknown>) => ({
      id: "",
      variantId: String(item.variantId ?? ""),
      sku: String(item.sku ?? ""),
      title: String(item.variantName ?? item.sku ?? "PO item"),
      unit: "box",
      expectedQty: number(item.suggestedQtyBoxes),
      receivedQty: 0,
      closedShortQty: 0,
      unitCost: number(item.unitCost),
      notes: String(item.lineNotes ?? "").trim() || null,
    }))
    .filter(
      (item: PurchaseOrderLine) =>
        item.variantId && number(item.expectedQty) > 0,
    );
}

function blankDraft(line: PurchaseOrderLine): ReceiptDraft {
  const remaining = Math.max(
    number(line.expectedQty) -
      number(line.receivedQty) -
      number(line.closedShortQty),
    0,
  );
  return {
    acceptedQty: String(remaining),
    damagedQty: "0",
    holdQty: "0",
    shortageQty: "0",
    wrongItemQty: "0",
    closedShortQty: "0",
    exceptionNote: "",
  };
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<PurchaseOrder | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReceiptDraft>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestKeyRef = useRef("");
  const inFlightRef = useRef(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/purchase-orders/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load purchase order.");
      }
      const po = payload.data as PurchaseOrder;
      setData(po);
      const lines = legacyLines(po);
      setDrafts(
        Object.fromEntries(
          lines.map((line) => [line.id || line.variantId, blankDraft(line)]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load purchase order.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void load();
  }, [id, role]);

  const lines = useMemo(() => (data ? legacyLines(data) : []), [data]);
  const canReceive =
    Boolean(data) &&
    String(data?.status ?? "").toUpperCase() !== "RECEIVED" &&
    lines.length > 0;

  const updateDraft = (
    key: string,
    field: keyof ReceiptDraft,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          acceptedQty: "0",
          damagedQty: "0",
          holdQty: "0",
          shortageQty: "0",
          wrongItemQty: "0",
          closedShortQty: "0",
          exceptionNote: "",
        }),
        [field]: value,
      },
    }));
  };

  const confirmReceipt = async () => {
    if (!data || inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      setReceiving(true);
      setError(null);
      setNotice(null);
      if (!requestKeyRef.current) {
        requestKeyRef.current = crypto.randomUUID();
      }
      const items = lines.map((line) => {
        const key = line.id || line.variantId;
        const draft = drafts[key] ?? blankDraft(line);
        return {
          purchaseOrderItemId: line.id,
          variantId: line.variantId,
          acceptedQty: number(draft.acceptedQty),
          damagedQty: number(draft.damagedQty),
          holdQty: number(draft.holdQty),
          shortageQty: number(draft.shortageQty),
          wrongItemQty: number(draft.wrongItemQty),
          closedShortQty: number(draft.closedShortQty),
          exceptionNote: draft.exceptionNote,
        };
      });
      const response = await fetch(`/api/purchase-orders/${data.id}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "Idempotency-Key": requestKeyRef.current,
        },
        body: JSON.stringify({ items }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to confirm receipt.");
      }
      const receipt = payload.data.receipt as Receipt;
      setNotice(
        payload.data.idempotent
          ? `Receipt ${receipt.id} was already posted.`
          : `Receipt ${receipt.id} posted.`,
      );
      requestKeyRef.current = "";
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to confirm receipt.",
      );
    } finally {
      inFlightRef.current = false;
      setReceiving(false);
    }
  };

  if (loading) {
    return (
      <p className="py-12 text-sm text-[var(--sc-color-text-secondary)]">
        Loading purchase order...
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-12 text-sm text-[var(--sc-color-text-secondary)]">
        Purchase order not found.
      </p>
    );
  }

  return (
    <section className="space-y-8" data-testid="receiving-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sc-color-divider)] pb-6">
        <div>
          <Link
            href="/purchasing/orders"
            className="text-sm text-[var(--sc-color-accent)] hover:underline"
          >
            Purchase Orders
          </Link>
          <h1 className="mt-2 text-[28px] font-semibold leading-9">
            {data.poNumber}
          </h1>
          <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
            {data.supplier?.name ?? "Unknown supplier"} · {data.status} ·{" "}
            {money(data.totalCost)}
          </p>
          <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
            Expected {dateTime(data.expectedArrival)}
          </p>
        </div>
        <button
          type="button"
          onClick={confirmReceipt}
          disabled={!canReceive || receiving}
          aria-busy={receiving}
          className="ios-primary-btn min-h-11 px-4 disabled:opacity-50"
          data-testid="confirm-receipt"
        >
          {receiving ? "Confirming..." : "Confirm Receipt"}
        </button>
      </header>

      {error ? (
        <div
          role="alert"
          data-testid="receiving-error"
          className="rounded-md border border-[var(--sc-color-critical)] bg-[var(--sc-color-critical-surface)] px-4 py-3 text-sm text-[var(--sc-color-critical)]"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          data-testid="receiving-success"
          className="rounded-md border border-[var(--sc-color-success)] bg-[var(--sc-color-success-surface)] px-4 py-3 text-sm text-[var(--sc-color-success)]"
        >
          {notice}
        </div>
      ) : null}

      <section aria-labelledby="receipt-lines-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="receipt-lines-heading" className="text-xl font-semibold">
              Receipt quantities
            </h2>
            <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
              Damaged and Hold quantities increase On Hand and Hold, but never
              Available.
            </p>
          </div>
          <p className="text-xs text-[var(--sc-color-text-secondary)]">
            Overage and Closed Short require Owner/Manager approval.
          </p>
        </div>

        <div className="mt-4 divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)]">
          {lines.map((line) => {
            const key = line.id || line.variantId;
            const draft = drafts[key] ?? blankDraft(line);
            const expected = number(line.expectedQty);
            const previouslyReceived = number(line.receivedQty);
            const previouslyClosedShort = number(line.closedShortQty);
            const remainingBefore = Math.max(
              expected - previouslyReceived - previouslyClosedShort,
              0,
            );
            const accepted = number(draft.acceptedQty);
            const damaged = number(draft.damagedQty);
            const held = number(draft.holdQty);
            const physical = accepted + damaged + held;
            const overage = Math.max(physical - remainingBefore, 0);
            const remainingAfter = Math.max(
              remainingBefore -
                Math.min(physical, remainingBefore) -
                number(draft.closedShortQty),
              0,
            );
            const stock = line.variant?.inventoryStock;
            const currentAvailable = stock ? calculateAvailable(stock) : null;
            return (
              <article
                key={key}
                className="py-5"
                data-testid={`receiving-line-${line.variantId}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{line.title}</h3>
                    <p className="text-xs text-[var(--sc-color-text-secondary)]">
                      {line.sku} · {line.unit}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-5 text-right text-xs">
                    <div>
                      <dt className="text-[var(--sc-color-text-muted)]">
                        Expected
                      </dt>
                      <dd className="mt-1 font-medium">{quantity(expected)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--sc-color-text-muted)]">
                        Previously Received
                      </dt>
                      <dd className="mt-1 font-medium">
                        {quantity(previouslyReceived)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--sc-color-text-muted)]">
                        Remaining
                      </dt>
                      <dd className="mt-1 font-medium">
                        {quantity(remainingBefore)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">
                    <span className="block">Accepted</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.acceptedQty}
                      onChange={(event) =>
                        updateDraft(key, "acceptedQty", event.target.value)
                      }
                      className="ios-input mt-1 px-3"
                      aria-label={`${line.title} accepted quantity`}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block">Damaged</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.damagedQty}
                      onChange={(event) =>
                        updateDraft(key, "damagedQty", event.target.value)
                      }
                      className="ios-input mt-1 px-3"
                      aria-label={`${line.title} damaged quantity`}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block">Hold</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.holdQty}
                      onChange={(event) =>
                        updateDraft(key, "holdQty", event.target.value)
                      }
                      className="ios-input mt-1 px-3"
                      aria-label={`${line.title} hold quantity`}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--sc-color-accent)]"
                  aria-expanded={Boolean(expanded[key])}
                >
                  Exceptions
                  {expanded[key] ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                {expanded[key] ? (
                  <div className="mt-2 grid gap-3 border-l-2 border-[var(--sc-color-accent-pale)] pl-4 sm:grid-cols-3">
                    <label className="text-sm">
                      Shortage
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.shortageQty}
                        onChange={(event) =>
                          updateDraft(key, "shortageQty", event.target.value)
                        }
                        className="ios-input mt-1 px-3"
                      />
                    </label>
                    <label className="text-sm">
                      Wrong Item
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.wrongItemQty}
                        onChange={(event) =>
                          updateDraft(key, "wrongItemQty", event.target.value)
                        }
                        className="ios-input mt-1 px-3"
                      />
                    </label>
                    <label className="text-sm">
                      Closed Short
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.closedShortQty}
                        onChange={(event) =>
                          updateDraft(key, "closedShortQty", event.target.value)
                        }
                        className="ios-input mt-1 px-3"
                      />
                    </label>
                    <label className="text-sm sm:col-span-3">
                      Exception note
                      <input
                        value={draft.exceptionNote}
                        onChange={(event) =>
                          updateDraft(key, "exceptionNote", event.target.value)
                        }
                        className="ios-input mt-1 px-3"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--sc-color-text-secondary)]">
                  <span>Overage {quantity(overage)}</span>
                  <span>
                    Remaining after receipt {quantity(remainingAfter)}
                  </span>
                  <span>Available impact +{quantity(accepted)}</span>
                  {currentAvailable !== null ? (
                    <span>Current Available {quantity(currentAvailable)}</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="receipt-history-heading">
        <h2 id="receipt-history-heading" className="text-xl font-semibold">
          Receipt history
        </h2>
        {data.receipts.length === 0 ? (
          <p className="mt-3 border-y border-[var(--sc-color-divider)] py-5 text-sm text-[var(--sc-color-text-secondary)]">
            No receipt events recorded.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)]">
            {data.receipts.map((receipt) => (
              <article key={receipt.id} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    Receipt {receipt.id} · {receipt.actor}
                  </p>
                  <time className="text-xs text-[var(--sc-color-text-secondary)]">
                    {dateTime(receipt.occurredAt)}
                  </time>
                </div>
                {receipt.approvalActor ? (
                  <p className="mt-1 text-xs text-[var(--sc-color-warning)]">
                    Interim Safe Default approval: {receipt.approvalActor}
                  </p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {receipt.items.map((item) => (
                    <p
                      key={item.id}
                      className="text-sm text-[var(--sc-color-text-secondary)]"
                    >
                      {item.title}: Accepted {quantity(item.acceptedQty)},
                      Damaged {quantity(item.damagedQty)}, Hold{" "}
                      {quantity(item.holdQty)}, Overage{" "}
                      {quantity(item.overageQty)}, Closed Short{" "}
                      {quantity(item.closedShortQty)}, Remaining{" "}
                      {quantity(item.remainingQty)}, Available impact +
                      {quantity(item.availableImpact)}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
