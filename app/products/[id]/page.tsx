"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/components/layout/role-provider";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";
import { getEffectiveSpecs, getInternalSpecLine } from "@/lib/specs/glass";

type ProductDetail = {
  id: string;
  name: string;
  category: string;
  skuPrefix?: string | null;
  glassTypeDefault?: string | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
  openingTypeDefault?: string | null;
  supplier?: { id: string; name: string; category?: string | null } | null;
};

type ProductVariant = {
  id: string;
  productId: string;
  sku: string;
  description: string | null;
  width: number | null;
  height: number | null;
  color: string | null;
  glassTypeOverride: string | null;
  glassFinishOverride: string | null;
  screenOverride: string | null;
  openingTypeOverride: string | null;
  price: number | null;
  cost: number | null;
  onHand: number;
  reserved: number;
  available: number;
};

function toSizeText(width: number | null, height: number | null) {
  if (!width || !height) return "-";
  return `${Math.trunc(width)}x${Math.trunc(height)}`;
}

function toVariantName(productName: string, variant: ProductVariant) {
  const size = variant.width && variant.height ? `${Math.trunc(variant.width)}"x${Math.trunc(variant.height)}"` : "";
  const color = variant.color ? `(${variant.color})` : "";
  if (size && color) return `${productName}-${size}${color}`;
  if (size) return `${productName}-${size}`;
  if (color) return `${productName}${color}`;
  return productName;
}

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");
  const openVariantId = String(searchParams?.get("variantId") ?? "").trim();
  const { role } = useRole();
  const [activeVariant, setActiveVariant] = useState<ProductVariant | null>(null);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustQty, setAdjustQty] = useState("1");
  const [createOpeningStock, setCreateOpeningStock] = useState("0");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<{
    sku: string;
    skuOverride: string;
    width: string;
    height: string;
    color: string;
    glassTypeOverride: string;
    glassFinishOverride: string;
    screenOverride: string;
    openingTypeOverride: string;
    price: string;
    cost: string;
    description: string;
  } | null>(null);
  const widthInputRef = useRef<HTMLInputElement | null>(null);

  const productQuery = useQuery({
    queryKey: ["product-detail", id, role],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch product.");
      return payload.data as ProductDetail;
    },
  });

  const variantsQuery = useQuery({
    queryKey: ["product-variants", id, role],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}/variants`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch variants.");
      return (payload.data ?? []) as ProductVariant[];
    },
  });

  const variants = useMemo(() => variantsQuery.data ?? [], [variantsQuery.data]);
  const createSkuPreview = useMemo(() => {
    if (!creatingVariant || !draft) return "-";
    const specs = getEffectiveSpecs(productQuery.data, draft);
    return (
      generateVariantSku({
        skuPrefix: productQuery.data?.skuPrefix ?? "",
        width: Number(draft.width || 0),
        height: Number(draft.height || 0),
        color: draft.color,
        glassFinish: specs.glassFinish,
        manualSkuOverride: draft.skuOverride || null,
      }).effectiveSku || "-"
    );
  }, [creatingVariant, draft, productQuery.data]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!openVariantId) return;
    if (activeVariant?.id === openVariantId) return;
    const target = variants.find((variant) => variant.id === openVariantId);
    if (!target) return;
    openVariant(target);
  }, [activeVariant?.id, openVariantId, variants]);

  const openVariant = (variant: ProductVariant) => {
    setActiveVariant(variant);
    setCreatingVariant(false);
    setDraft({
      sku: variant.sku ?? "",
      skuOverride: "",
      width: variant.width != null ? String(variant.width) : "",
      height: variant.height != null ? String(variant.height) : "",
      color: variant.color ?? "",
      glassTypeOverride: variant.glassTypeOverride ?? "",
      glassFinishOverride: variant.glassFinishOverride ?? "",
      screenOverride: variant.screenOverride ?? "",
      openingTypeOverride: variant.openingTypeOverride ?? "",
      price: variant.price != null ? String(variant.price) : "",
      cost: variant.cost != null ? String(variant.cost) : "",
      description: variant.description ?? "",
    });
    setAdjustQty("1");
    setError(null);
    setNotice(null);
  };

  const openCreateVariant = () => {
    setCreatingVariant(true);
    setActiveVariant(null);
    setDraft({
      sku: "",
      skuOverride: "",
      width: "",
      height: "",
      color: "",
      glassTypeOverride: "",
      glassFinishOverride: "",
      screenOverride: "",
      openingTypeOverride: "",
      price: "",
      cost: "",
      description: "",
    });
    setCreateOpeningStock("0");
    setError(null);
    setNotice(null);
    setTimeout(() => widthInputRef.current?.focus(), 0);
  };

  const onCreateVariant = async (keepOpenAfterCreate: boolean) => {
    if (!draft) return;
    const widthNum = Number(draft.width || 0);
    const heightNum = Number(draft.height || 0);
    const colorText = String(draft.color ?? "").trim();
    if (!Number.isFinite(widthNum) || widthNum <= 0 || !Number.isFinite(heightNum) || heightNum <= 0) {
      setError("Size is required.");
      return;
    }
    if (!colorText) {
      setError("Color is required.");
      return;
    }
    const comboExists = variants.some(
      (variant) =>
        Number(variant.width ?? 0) === Math.trunc(widthNum) &&
        Number(variant.height ?? 0) === Math.trunc(heightNum) &&
        String(variant.color ?? "").trim().toLowerCase() === colorText.toLowerCase(),
    );
    if (comboExists) {
      setError("Duplicate variant combination.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/products/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          width: draft.width ? Number(draft.width) : null,
          height: draft.height ? Number(draft.height) : null,
          color: draft.color,
          skuOverride: draft.skuOverride || null,
          glassTypeOverride: draft.glassTypeOverride || null,
          glassFinishOverride: draft.glassFinishOverride || null,
          screenOverride: draft.screenOverride || null,
          openingTypeOverride: draft.openingTypeOverride || null,
          price: draft.price ? Number(draft.price) : null,
          cost: draft.cost ? Number(draft.cost) : null,
          description: draft.description,
          openingStock: Number(createOpeningStock || 0),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create variant.");
      await variantsQuery.refetch();
      setNotice("Variant added");
      if (keepOpenAfterCreate) {
        setCreatingVariant(true);
        setActiveVariant(null);
        setDraft((prev) => ({
          sku: "",
          skuOverride: "",
          width: "",
          height: "",
          color: prev?.color ?? "",
          glassTypeOverride: prev?.glassTypeOverride ?? "",
          glassFinishOverride: prev?.glassFinishOverride ?? "",
          screenOverride: prev?.screenOverride ?? "",
          openingTypeOverride: prev?.openingTypeOverride ?? "",
          price: "",
          cost: "",
          description: "",
        }));
        setCreateOpeningStock("0");
        setTimeout(() => widthInputRef.current?.focus(), 0);
      } else {
        setCreatingVariant(false);
        setActiveVariant(payload.data as ProductVariant);
        setDraft({
          sku: payload.data?.sku ?? "",
          skuOverride: "",
          width: payload.data?.width != null ? String(payload.data.width) : "",
          height: payload.data?.height != null ? String(payload.data.height) : "",
          color: payload.data?.color ?? "",
          glassTypeOverride: payload.data?.glassTypeOverride ?? "",
          glassFinishOverride: payload.data?.glassFinishOverride ?? "",
          screenOverride: payload.data?.screenOverride ?? "",
          openingTypeOverride: payload.data?.openingTypeOverride ?? "",
          price: payload.data?.price != null ? String(payload.data.price) : "",
          cost: payload.data?.cost != null ? String(payload.data.cost) : "",
          description: payload.data?.description ?? "",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create variant.");
    } finally {
      setSaving(false);
    }
  };

  const onUpdateVariant = async () => {
    if (!activeVariant || !draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/products/${id}/variants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          variantId: activeVariant.id,
          sku: String(draft.sku ?? "").toUpperCase().replace(/\s+/g, ""),
          skuOverride: draft.skuOverride || null,
          width: draft.width ? Number(draft.width) : null,
          height: draft.height ? Number(draft.height) : null,
          color: draft.color,
          glassTypeOverride: draft.glassTypeOverride || null,
          glassFinishOverride: draft.glassFinishOverride || null,
          screenOverride: draft.screenOverride || null,
          openingTypeOverride: draft.openingTypeOverride || null,
          price: draft.price ? Number(draft.price) : null,
          cost: draft.cost ? Number(draft.cost) : null,
          description: draft.description,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update variant.");
      await variantsQuery.refetch();
      const next = variantsQuery.data?.find((row) => row.id === activeVariant.id) ?? payload.data;
      if (next) openVariant(next as ProductVariant);
      setNotice("Variant updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update variant.");
    } finally {
      setSaving(false);
    }
  };

  const onAdjustStock = async () => {
    if (!activeVariant) return;
    setAdjusting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/products/${id}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          variantId: activeVariant.id,
          adjustmentQty: Number(adjustQty),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to adjust stock.");
      await variantsQuery.refetch();
      const next = variantsQuery.data?.find((row) => row.id === activeVariant.id);
      if (next) openVariant(next);
      setNotice("Stock adjusted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock.");
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="linear-card flex items-start justify-between p-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{productQuery.data?.name ?? "Product"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Category: {productQuery.data?.category ?? "-"} · SKU Prefix: {productQuery.data?.skuPrefix ?? "-"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Preferred Supplier: {productQuery.data?.supplier?.name ?? "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openCreateVariant} className="ios-primary-btn h-9 px-3 text-sm">
            + Add Variant
          </button>
          <button type="button" onClick={() => router.push("/products")} className="ios-secondary-btn h-9 px-3 text-sm">
            Back to Products
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-white">
              <TableRow className="bg-white shadow-[inset_0_-1px_0_0_#E5E7EB] hover:bg-white">
                <TableHead>Variant Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Size (WxH)</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">OnHand</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hydrated || variantsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">Loading variants...</TableCell>
                </TableRow>
              ) : variants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">No variants.</TableCell>
                </TableRow>
              ) : (
                variants.map((variant) => (
                  <TableRow
                    key={variant.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => openVariant(variant)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        openVariant(variant);
                      }
                    }}
                  >
                    <TableCell className="font-semibold text-slate-900">
                      {toVariantName(productQuery.data?.name ?? "Product", variant)}
                    </TableCell>
                    <TableCell>{variant.sku}</TableCell>
                    <TableCell>{toSizeText(variant.width, variant.height)}</TableCell>
                    <TableCell>{variant.color ?? "-"}</TableCell>
                    <TableCell className="text-right">{variant.price != null ? `$${variant.price.toFixed(2)}` : "-"}</TableCell>
                    <TableCell className="text-right">{variant.cost != null ? `$${variant.cost.toFixed(2)}` : "-"}</TableCell>
                    <TableCell className="text-right">{variant.onHand.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{variant.available.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVariant(variant);
                        }}
                        className="ios-secondary-btn h-8 px-2 text-xs"
                      >
                        Details
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {(activeVariant || creatingVariant) && draft ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          onClick={() => {
            setCreatingVariant(false);
            setActiveVariant(null);
            setDraft(null);
          }}
        >
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{creatingVariant ? "Add Variant" : "Variant Detail"}</h3>
            {!creatingVariant && activeVariant ? (
              <p className="mt-1 text-sm text-slate-500">{toVariantName(productQuery.data?.name ?? "Product", activeVariant)}</p>
            ) : null}
            <div className="mt-4 space-y-3">
              {creatingVariant ? (
                <label className="block space-y-1">
                  <span className="text-sm text-slate-600">SKU Preview</span>
                  <div className="ios-input flex h-10 items-center bg-slate-50 px-3 text-sm text-slate-700">
                    {createSkuPreview}
                  </div>
                  {draft.skuOverride ? (
                    <p className="text-xs text-slate-500">Manual SKU (not auto-updated by finish).</p>
                  ) : null}
                </label>
              ) : (
                <Input label="SKU" value={draft.sku} onChange={(v) => setDraft((prev) => (prev ? { ...prev, sku: v } : prev))} />
              )}
              {creatingVariant ? (
                <Input
                  label="Variant SKU Override (optional)"
                  value={draft.skuOverride}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, skuOverride: v } : prev))}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Width"
                  value={draft.width}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))}
                  inputRef={creatingVariant ? widthInputRef : undefined}
                />
                <Input label="Height" value={draft.height} onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))} />
              </div>
              <Input label="Color" value={draft.color} onChange={(v) => setDraft((prev) => (prev ? { ...prev, color: v } : prev))} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-sm text-slate-600">Glass Type Override</span>
                  <select
                    value={draft.glassTypeOverride}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, glassTypeOverride: e.target.value } : prev))}
                    className="ios-input h-10 w-full bg-white px-3 text-sm"
                  >
                    <option value="">Use Default</option>
                    <option value="TEMPERED_LOW_E_5MM">Tempered Low-E 5mm</option>
                    <option value="TEMPERED_LOW_E_5MM_FROSTED">Tempered Low-E 5mm Frosted</option>
                    <option value="TEMPERED_CLEAR_5MM">Tempered Clear 5mm</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm text-slate-600">Glass Finish Override</span>
                  <select
                    value={draft.glassFinishOverride}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, glassFinishOverride: e.target.value } : prev))}
                    className="ios-input h-10 w-full bg-white px-3 text-sm"
                  >
                    <option value="">Use Default</option>
                    <option value="CLEAR">Clear</option>
                    <option value="FROSTED">Frosted</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Screen Override"
                  value={draft.screenOverride}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))}
                />
                <Input
                  label="Opening Type Override"
                  value={draft.openingTypeOverride}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))}
                />
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Specifications (Effective)</p>
                <p className="mt-1">
                  {getInternalSpecLine(getEffectiveSpecs(productQuery.data, draft)) || "No effective specs."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Sale Price" value={draft.price} onChange={(v) => setDraft((prev) => (prev ? { ...prev, price: v } : prev))} />
                <Input label="Cost" value={draft.cost} onChange={(v) => setDraft((prev) => (prev ? { ...prev, cost: v } : prev))} />
              </div>
              {creatingVariant ? (
                <Input label="Opening Stock" value={createOpeningStock} onChange={setCreateOpeningStock} />
              ) : null}
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Description</span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                  className="ios-input w-full px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {creatingVariant ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void onCreateVariant(true);
                    }}
                    disabled={saving}
                    className="ios-primary-btn h-9 px-3 text-sm"
                  >
                    {saving ? "Creating..." : "Create & Add Another"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onCreateVariant(false);
                    }}
                    disabled={saving}
                    className="ios-secondary-btn h-9 px-3 text-sm"
                  >
                    {saving ? "Creating..." : "Create & Close"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onUpdateVariant}
                  disabled={saving}
                  className="ios-primary-btn h-9 px-3 text-sm"
                >
                  {saving ? "Updating..." : "Update"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCreatingVariant(false);
                  setActiveVariant(null);
                  setDraft(null);
                }}
                className="ios-secondary-btn h-9 px-3 text-sm"
              >
                Close
              </button>
            </div>

            {!creatingVariant ? (
              <div className="mt-6 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">Adjust Stock</p>
                {activeVariant ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Use positive or negative number. Current on-hand: {activeVariant.onHand.toFixed(2)}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="ios-input h-9 w-28 px-2 text-right text-sm"
                  />
                  <button type="button" onClick={onAdjustStock} disabled={adjusting} className="ios-secondary-btn h-9 px-3 text-sm">
                    {adjusting ? "Applying..." : "Adjust Stock"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} className="ios-input h-10 w-full px-3 text-sm" />
    </label>
  );
}
