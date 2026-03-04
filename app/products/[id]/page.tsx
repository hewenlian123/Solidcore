"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/components/layout/role-provider";
import { formatQuantity, formatQuantityWithUnit } from "@/lib/quantity-format";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";
import { formatSubtitle, getEffectiveSpecs } from "@/lib/specs/effective";

type ProductDetail = {
  id: string;
  name: string;
  category: string;
  unit?: string | null;
  skuPrefix?: string | null;
  slidingConfigDefault?: string | null;
  glassTypeDefault?: string | null;
  glassCoatingDefault?: string | null;
  glassThicknessMmDefault?: number | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
  openingTypeDefault?: string | null;
  flooringMaterial?: string | null;
  flooringWearLayer?: string | null;
  flooringThicknessMm?: number | null;
  flooringPlankLengthIn?: number | null;
  flooringPlankWidthIn?: number | null;
  flooringInstallation?: string | null;
  flooringUnderlayment?: string | null;
  flooringBoxCoverageSqft?: number | null;
  supplier?: { id: string; name: string; category?: string | null } | null;
};

type ProductVariant = {
  id: string;
  productId: string;
  sku: string;
  displayName: string | null;
  imageUrl?: string | null;
  skuSuffix: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  color: string | null;
  glassTypeOverride: string | null;
  slidingConfigOverride: string | null;
  glassCoatingOverride: string | null;
  glassThicknessMmOverride: number | null;
  glassFinishOverride: string | null;
  screenOverride: string | null;
  openingTypeOverride: string | null;
  screenType: string | null;
  slideDirection: string | null;
  variantType: string | null;
  thicknessMm: number | null;
  boxSqft: number | null;
  archivedAt?: string | null;
  price: number | null;
  cost: number | null;
  reorderLevel: number;
  reorderQty: number;
  onHand: number;
  reserved: number;
  available: number;
};

type BulkVariantDraft = {
  id: string;
  width: string;
  height: string;
  color: string;
  price: string;
  cost: string;
  openingStock: string;
};

let bulkDraftCounter = 0;

function createEmptyBulkVariantDraft(): BulkVariantDraft {
  bulkDraftCounter += 1;
  return {
    id: `bulk-variant-${bulkDraftCounter}`,
    width: "",
    height: "",
    color: "",
    price: "",
    cost: "",
    openingStock: "0",
  };
}

function toSizeText(width: number | null, height: number | null) {
  if (!width || !height) return "-";
  return `${Math.trunc(width)}x${Math.trunc(height)}`;
}

function toVariantName(productName: string, variant: ProductVariant, category?: string | null) {
  const displayName = String(variant.displayName ?? "").trim();
  if (displayName) return displayName;
  const size = variant.width && variant.height ? `${Math.trunc(variant.width)}"x${Math.trunc(variant.height)}"` : "";
  const color = variant.color ? `(${variant.color})` : "";
  if (size && color) return `${productName}-${size}${color}`;
  if (size) return `${productName}-${size}`;
  if (color) return `${productName}${color}`;
  return productName;
}

function getStockAlertState(available: number, reorderLevel: number) {
  if (available <= reorderLevel) return "LOW" as const;
  if (available <= reorderLevel * 1.5) return "WARNING" as const;
  return null;
}

function formatStockWithUnit(value: number, unit: string | null | undefined) {
  return formatQuantityWithUnit(value, unit);
}

function formatMoney(value: number) {
  return `$${Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  return `${Math.round(Number(value ?? 0)).toLocaleString("en-US")}%`;
}

type VariantFormProfile =
  | "FLOOR"
  | "WINDOW"
  | "MIRROR"
  | "SHOWER"
  | "FLOOR_ACCESSORY"
  | "TILE_EDGE"
  | "NICHE"
  | "UNKNOWN";

function resolveVariantFormProfile(product?: ProductDetail | null): VariantFormProfile {
  const category = String(product?.category ?? "").trim().toUpperCase();
  const name = String(product?.name ?? "").trim().toUpperCase();
  const source = `${category} ${name}`;
  if (category === "FLOOR") return "FLOOR";
  if (category === "WINDOW" || source.includes("SLIDING DOOR")) return "WINDOW";
  if (category === "MIRROR" || source.includes("LED MIRROR")) return "MIRROR";
  if (source.includes("SHOWER") || source.includes("GLASS DOOR")) return "SHOWER";
  if (source.includes("ACCESSORY") || source.includes("T MOLDING") || source.includes("STAIR")) return "FLOOR_ACCESSORY";
  if (source.includes("TILE") || source.includes("EDGE")) return "TILE_EDGE";
  if (source.includes("NICHE")) return "NICHE";
  return "UNKNOWN";
}

function normalizeFlooringInstallationForField(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "click") return "Click";
  if (raw === "glue" || raw === "glue_down" || raw === "gluedown") return "Glue";
  if (raw === "float" || raw === "floating") return "Float";
  return String(value ?? "").trim();
}

function normalizeUnderlaymentForField(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("attached")) return "Attached";
  if (raw.includes("separate")) return "Separate";
  if (raw === "none" || raw.includes("no underlayment")) return "None";
  return String(value ?? "").trim();
}

function formatFlooringSummary(product?: ProductDetail | null) {
  if (!product) return "";
  const size =
    product.flooringPlankLengthIn && product.flooringPlankWidthIn
      ? `${product.flooringPlankLengthIn}x${product.flooringPlankWidthIn}`
      : "";
  const underlayment =
    product.flooringUnderlayment === "ATTACHED"
      ? "Attached Underlayment"
      : product.flooringUnderlayment === "NONE"
        ? "No Underlayment"
        : "";
  const parts = [
    product.flooringMaterial || "",
    product.flooringWearLayer || "",
    product.flooringThicknessMm ? `${product.flooringThicknessMm}mm` : "",
    size,
    product.flooringInstallation === "CLICK"
      ? "Click"
      : product.flooringInstallation === "GLUE_DOWN"
        ? "GlueDown"
        : "",
    underlayment,
    product.flooringBoxCoverageSqft ? `Box: ${product.flooringBoxCoverageSqft} sqft` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function extractValidationWarnings(payload: any): string[] {
  const warningsRaw = payload?.meta?.validationWarnings;
  if (!Array.isArray(warningsRaw)) return [];
  return warningsRaw
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
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
  const [creatingBulk, setCreatingBulk] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [counting, setCounting] = useState(false);
  const [stockCountOpen, setStockCountOpen] = useState(false);
  const [adjustQty, setAdjustQty] = useState("1");
  const [actualCount, setActualCount] = useState("");
  const [countNote, setCountNote] = useState("");
  const [createOpeningStock, setCreateOpeningStock] = useState("0");
  const [notice, setNotice] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadingVariantImageId, setUploadingVariantImageId] = useState<string | null>(null);
  const [dragOverVariantId, setDragOverVariantId] = useState<string | null>(null);
  const [dragOverDetailImage, setDragOverDetailImage] = useState(false);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showCreateOverrides, setShowCreateOverrides] = useState(false);
  const [showBulkOverrides, setShowBulkOverrides] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkVariantDraft[]>([createEmptyBulkVariantDraft()]);
  const [bulkOverrides, setBulkOverrides] = useState({
    glassFinishOverride: "",
    screenOverride: "",
    openingTypeOverride: "",
    slidingConfigOverride: "",
  });
  const [draft, setDraft] = useState<{
    displayName: string;
    sku: string;
    skuOverride: string;
    skuSuffix: string;
    width: string;
    height: string;
    color: string;
    glassTypeOverride: string;
    slidingConfigOverride: string;
    glassCoatingOverride: string;
    glassThicknessMmOverride: string;
    glassFinishOverride: string;
    screenOverride: string;
    openingTypeOverride: string;
    variantType: string;
    thicknessMm: string;
    boxSqft: string;
    screenType: string;
    slideDirection: string;
    price: string;
    cost: string;
    reorderLevel: string;
    reorderQty: string;
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

  const archivedVariantsQuery = useQuery({
    queryKey: ["product-variants", id, role, "archived"],
    enabled: Boolean(id) && showArchived,
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}/variants?showArchived=true`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch variants.");
      return (payload.data ?? []) as ProductVariant[];
    },
  });

  const variants = useMemo(
    () => (showArchived ? archivedVariantsQuery.data ?? [] : variantsQuery.data ?? []),
    [showArchived, archivedVariantsQuery.data, variantsQuery.data],
  );
  const summaryStats = useMemo(() => {
    const rows = variants ?? [];
    const totalVariants = rows.length;
    const totalStock = rows.reduce((sum, row) => sum + Number(row.onHand ?? 0), 0);
    const totalCostValue = rows.reduce(
      (sum, row) => sum + Number(row.onHand ?? 0) * Number(row.cost ?? 0),
      0,
    );
    const totalRetailValue = rows.reduce(
      (sum, row) => sum + Number(row.onHand ?? 0) * Number(row.price ?? 0),
      0,
    );
    const marginRows = rows.filter((row) => Number(row.price ?? 0) > 0);
    const avgMarginPct =
      marginRows.length === 0
        ? 0
        : marginRows.reduce((sum, row) => {
            const price = Number(row.price ?? 0);
            const cost = Number(row.cost ?? 0);
            return sum + ((price - cost) / price) * 100;
          }, 0) / marginRows.length;
    const lowStockVariants = rows.filter(
      (row) => Number(row.onHand ?? 0) <= Number(row.reorderLevel ?? 0),
    ).length;

    return {
      totalVariants,
      totalStock,
      totalCostValue,
      totalRetailValue,
      avgMarginPct,
      lowStockVariants,
    };
  }, [variants]);
  const createSkuPreview = useMemo(() => {
    if (!draft) return "-";
    const normalizedDirectSku = String(draft.sku ?? "").toUpperCase().replace(/\s+/g, "").trim();
    if (normalizedDirectSku) return normalizedDirectSku;
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
  const formProfile = useMemo(() => resolveVariantFormProfile(productQuery.data), [productQuery.data]);
  const effectiveSpecs = useMemo(
    () => getEffectiveSpecs(productQuery.data, draft),
    [productQuery.data, draft],
  );
  const effectiveSubtitle = useMemo(() => {
    if (String(productQuery.data?.category ?? "") === "FLOOR") return formatFlooringSummary(productQuery.data);
    return formatSubtitle(effectiveSpecs);
  }, [effectiveSpecs, productQuery.data]);
  const defaultsSubtitle = useMemo(
    () =>
      String(productQuery.data?.category ?? "") === "FLOOR"
        ? formatFlooringSummary(productQuery.data)
        : formatSubtitle(getEffectiveSpecs(productQuery.data, null)),
    [productQuery.data],
  );
  const bulkEffectiveSpecs = useMemo(
    () =>
      getEffectiveSpecs(productQuery.data, {
        glassFinishOverride: bulkOverrides.glassFinishOverride || null,
        screenOverride: bulkOverrides.screenOverride || null,
        openingTypeOverride: bulkOverrides.openingTypeOverride || null,
        slidingConfigOverride: bulkOverrides.slidingConfigOverride || null,
      }),
    [productQuery.data, bulkOverrides],
  );
  const bulkSubtitle = useMemo(
    () =>
      String(productQuery.data?.category ?? "") === "FLOOR"
        ? formatFlooringSummary(productQuery.data)
        : formatSubtitle(bulkEffectiveSpecs),
    [bulkEffectiveSpecs, productQuery.data],
  );
  const isBulkSliding = useMemo(
    () => String(bulkEffectiveSpecs.openingType ?? "").trim().toLowerCase() === "sliding",
    [bulkEffectiveSpecs.openingType],
  );
  const filledBulkRowCount = useMemo(
    () =>
      bulkRows.filter(
        (row) =>
          row.width.trim() ||
          row.height.trim() ||
          row.color.trim() ||
          row.price.trim() ||
          row.cost.trim(),
      ).length,
    [bulkRows],
  );
  const isEffectiveSliding = useMemo(
    () => String(effectiveSpecs.openingType ?? "").trim().toLowerCase() === "sliding",
    [effectiveSpecs.openingType],
  );

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
    const isFlooring = resolveVariantFormProfile(productQuery.data) === "FLOOR";
    const fallbackLength =
      productQuery.data?.flooringPlankLengthIn != null
        ? String(productQuery.data.flooringPlankLengthIn)
        : "";
    const fallbackWidth =
      productQuery.data?.flooringPlankWidthIn != null
        ? String(productQuery.data.flooringPlankWidthIn)
        : "";
    const fallbackThickness =
      productQuery.data?.flooringThicknessMm != null
        ? String(productQuery.data.flooringThicknessMm)
        : "";
    const fallbackWearLayer = productQuery.data?.flooringWearLayer ?? "";
    const fallbackFloorType = productQuery.data?.flooringMaterial ?? "";
    const fallbackInstall = normalizeFlooringInstallationForField(productQuery.data?.flooringInstallation);
    const fallbackUnderlayment = normalizeUnderlaymentForField(productQuery.data?.flooringUnderlayment);
    const fallbackBoxSqft =
      productQuery.data?.flooringBoxCoverageSqft != null
        ? String(productQuery.data.flooringBoxCoverageSqft)
        : "";

    setActiveVariant(variant);
    setCreatingVariant(false);
    setCreatingBulk(false);
    setDraft({
      displayName: variant.displayName ?? "",
      sku: variant.sku ?? "",
      skuOverride: "",
      skuSuffix: variant.skuSuffix ?? "",
      width:
        variant.width != null && Number(variant.width) > 0
          ? String(variant.width)
          : isFlooring
            ? fallbackLength
            : "",
      height:
        variant.height != null && Number(variant.height) > 0
          ? String(variant.height)
          : isFlooring
            ? fallbackWidth
            : "",
      color: variant.color ?? "",
      glassTypeOverride: variant.glassTypeOverride ?? "",
      slidingConfigOverride: variant.slidingConfigOverride ?? "",
      glassCoatingOverride: variant.glassCoatingOverride ?? "",
      glassThicknessMmOverride:
        variant.glassThicknessMmOverride != null ? String(variant.glassThicknessMmOverride) : "",
      glassFinishOverride: variant.glassFinishOverride ?? "",
      screenOverride:
        isFlooring
          ? normalizeUnderlaymentForField(variant.screenOverride ?? fallbackUnderlayment)
          : (variant.screenOverride ?? ""),
      openingTypeOverride:
        isFlooring
          ? normalizeFlooringInstallationForField(variant.openingTypeOverride ?? fallbackInstall)
          : (variant.openingTypeOverride ?? ""),
      variantType:
        variant.variantType ??
        (isFlooring ? fallbackWearLayer : ""),
      thicknessMm:
        variant.thicknessMm != null
          ? String(variant.thicknessMm)
          : isFlooring
            ? fallbackThickness
            : "",
      boxSqft:
        variant.boxSqft != null
          ? String(variant.boxSqft)
          : isFlooring
            ? fallbackBoxSqft
            : "",
      screenType:
        variant.screenType ??
        (isFlooring ? fallbackFloorType : ""),
      slideDirection: variant.slideDirection ?? "",
      price: variant.price != null ? String(variant.price) : "",
      cost: variant.cost != null ? String(variant.cost) : "",
      reorderLevel: String(variant.reorderLevel ?? 0),
      reorderQty: String(variant.reorderQty ?? 0),
      description: variant.description ?? "",
    });
    setAdjustQty("1");
    setError(null);
    setNotice(null);
  };

  const openCreateVariant = () => {
    setCreatingVariant(true);
    setCreatingBulk(false);
    setActiveVariant(null);
    setDraft({
      displayName: "",
      sku: "",
      skuOverride: "",
      skuSuffix: "",
      width: "",
      height: "",
      color: "",
      glassTypeOverride: "",
      slidingConfigOverride: "",
      glassCoatingOverride: "",
      glassThicknessMmOverride: "",
      glassFinishOverride: "",
      screenOverride: "",
      openingTypeOverride: "",
      variantType: "",
      thicknessMm: "",
      boxSqft: "",
      screenType: "",
      slideDirection: "",
      price: "",
      cost: "",
      reorderLevel: "0",
      reorderQty: "0",
      description: "",
    });
    setShowCreateOverrides(false);
    setCreateOpeningStock("0");
    setError(null);
    setNotice(null);
    setTimeout(() => widthInputRef.current?.focus(), 0);
  };

  const openBulkCreate = () => {
    setCreatingBulk(true);
    setCreatingVariant(false);
    setActiveVariant(null);
    setDraft(null);
    setShowBulkOverrides(false);
    setBulkRows([createEmptyBulkVariantDraft(), createEmptyBulkVariantDraft(), createEmptyBulkVariantDraft()]);
    setBulkOverrides({
      glassFinishOverride: "",
      screenOverride: "",
      openingTypeOverride: "",
      slidingConfigOverride: "",
    });
    setError(null);
    setNotice(null);
  };

  const onCreateVariant = async (keepOpenAfterCreate: boolean) => {
    if (!draft) return;
    const widthNum = Number(draft.width || 0);
    const heightNum = Number(draft.height || 0);
    const colorText = String(draft.color ?? "").trim();
    const profile = formProfile;
    const requiresWidthHeight = ["FLOOR", "WINDOW", "MIRROR", "SHOWER", "NICHE"].includes(profile);
    const requiresLengthOnly = ["FLOOR_ACCESSORY", "TILE_EDGE"].includes(profile);
    const requiresColor = ["FLOOR", "WINDOW", "NICHE", "FLOOR_ACCESSORY"].includes(profile);
    if (
      (requiresWidthHeight && (!Number.isFinite(widthNum) || widthNum <= 0 || !Number.isFinite(heightNum) || heightNum <= 0)) ||
      (requiresLengthOnly && (!Number.isFinite(widthNum) || widthNum <= 0))
    ) {
      setError("Size is required.");
      return;
    }
    if (requiresColor && !colorText) {
      setError("Color is required.");
      return;
    }
    if (!String(draft.displayName ?? "").trim()) {
      setError("Display Name is required.");
      return;
    }
    const comboExists =
      requiresWidthHeight && requiresColor
        ? variants.some(
            (variant) =>
              Number(variant.width ?? 0) === Math.trunc(widthNum) &&
              Number(variant.height ?? 0) === Math.trunc(heightNum) &&
              String(variant.color ?? "").trim().toLowerCase() === colorText.toLowerCase(),
          )
        : false;
    if (comboExists) {
      setError("Duplicate variant combination.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    setValidationWarnings([]);
    try {
      const res = await fetch(`/api/products/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          displayName: draft.displayName || null,
          sku: draft.sku,
          skuSuffix: draft.skuSuffix || null,
          width: draft.width ? Number(draft.width) : null,
          height: draft.height ? Number(draft.height) : null,
          color: draft.color,
          skuOverride: draft.skuOverride || null,
          glassTypeOverride: draft.glassTypeOverride || null,
          slidingConfigOverride: draft.slidingConfigOverride || null,
          glassCoatingOverride: draft.glassCoatingOverride || null,
          glassThicknessMmOverride: draft.glassThicknessMmOverride
            ? Number(draft.glassThicknessMmOverride)
            : null,
          glassFinishOverride: draft.glassFinishOverride || null,
          screenOverride: draft.screenOverride || null,
          openingTypeOverride: draft.openingTypeOverride || null,
          variantType: draft.variantType || null,
          thicknessMm: draft.thicknessMm ? Number(draft.thicknessMm) : null,
          boxSqft: draft.boxSqft ? Number(draft.boxSqft) : null,
          screenType: draft.screenType || null,
          slideDirection: draft.slideDirection || null,
          price: draft.price ? Number(draft.price) : null,
          cost: draft.cost ? Number(draft.cost) : null,
          reorderLevel: draft.reorderLevel ? Number(draft.reorderLevel) : 0,
          reorderQty: draft.reorderQty ? Number(draft.reorderQty) : 0,
          description: draft.description,
          openingStock: Number(createOpeningStock || 0),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create variant.");
      setValidationWarnings(extractValidationWarnings(payload));
      await variantsQuery.refetch();
      setNotice("Variant added");
      if (keepOpenAfterCreate) {
        setCreatingVariant(true);
        setActiveVariant(null);
        setDraft((prev) => ({
          displayName: "",
          sku: "",
          skuOverride: "",
          skuSuffix: "",
          width: "",
          height: "",
          color: prev?.color ?? "",
          glassTypeOverride: prev?.glassTypeOverride ?? "",
          slidingConfigOverride: prev?.slidingConfigOverride ?? "",
          glassCoatingOverride: prev?.glassCoatingOverride ?? "",
          glassThicknessMmOverride: prev?.glassThicknessMmOverride ?? "",
          glassFinishOverride: prev?.glassFinishOverride ?? "",
          screenOverride: prev?.screenOverride ?? "",
          openingTypeOverride: prev?.openingTypeOverride ?? "",
          variantType: prev?.variantType ?? "",
          thicknessMm: prev?.thicknessMm ?? "",
          boxSqft: prev?.boxSqft ?? "",
          screenType: prev?.screenType ?? "",
          slideDirection: prev?.slideDirection ?? "",
          price: "",
          cost: "",
          reorderLevel: prev?.reorderLevel || "0",
          reorderQty: prev?.reorderQty || "0",
          description: "",
        }));
        setCreateOpeningStock("0");
        setTimeout(() => widthInputRef.current?.focus(), 0);
      } else {
        setCreatingVariant(false);
        setActiveVariant(payload.data as ProductVariant);
        setDraft({
          displayName: payload.data?.displayName ?? "",
          sku: payload.data?.sku ?? "",
          skuOverride: "",
          skuSuffix: payload.data?.skuSuffix ?? "",
          width: payload.data?.width != null ? String(payload.data.width) : "",
          height: payload.data?.height != null ? String(payload.data.height) : "",
          color: payload.data?.color ?? "",
          glassTypeOverride: payload.data?.glassTypeOverride ?? "",
          slidingConfigOverride: payload.data?.slidingConfigOverride ?? "",
          glassCoatingOverride: payload.data?.glassCoatingOverride ?? "",
          glassThicknessMmOverride:
            payload.data?.glassThicknessMmOverride != null
              ? String(payload.data.glassThicknessMmOverride)
              : "",
          glassFinishOverride: payload.data?.glassFinishOverride ?? "",
          screenOverride: payload.data?.screenOverride ?? "",
          openingTypeOverride: payload.data?.openingTypeOverride ?? "",
          variantType: payload.data?.variantType ?? "",
          thicknessMm: payload.data?.thicknessMm != null ? String(payload.data.thicknessMm) : "",
          boxSqft: payload.data?.boxSqft != null ? String(payload.data.boxSqft) : "",
          screenType: payload.data?.screenType ?? "",
          slideDirection: payload.data?.slideDirection ?? "",
          price: payload.data?.price != null ? String(payload.data.price) : "",
          cost: payload.data?.cost != null ? String(payload.data.cost) : "",
          reorderLevel: String(payload.data?.reorderLevel ?? 0),
          reorderQty: String(payload.data?.reorderQty ?? 0),
          description: payload.data?.description ?? "",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create variant.");
    } finally {
      setSaving(false);
    }
  };

  const onCreateBulkVariants = async () => {
    const normalizedRows = bulkRows
      .map((row) => ({
        ...row,
        width: row.width.trim(),
        height: row.height.trim(),
        color: row.color.trim(),
        price: row.price.trim(),
        cost: row.cost.trim(),
        openingStock: row.openingStock.trim(),
      }))
      .filter(
        (row) =>
          row.width || row.height || row.color || row.price || row.cost,
      );
    if (normalizedRows.length === 0) {
      setError("Add at least one bulk row.");
      return;
    }
    const invalid = normalizedRows.find((row) => {
      const width = Number(row.width);
      const height = Number(row.height);
      const price = Number(row.price || "0");
      const cost = Number(row.cost || "0");
      const openingStock = Number(row.openingStock || "0");
      return (
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0 ||
        !row.color ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !Number.isFinite(openingStock) ||
        openingStock < 0
      );
    });
    if (invalid) {
      setError("Each bulk row requires valid width, height, color, price, cost, and opening stock.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setValidationWarnings([]);
    try {
      const res = await fetch(`/api/products/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          rows: normalizedRows.map((row) => ({
            width: Number(row.width),
            height: Number(row.height),
            color: row.color,
            price: Number(row.price || "0"),
            cost: Number(row.cost || "0"),
            openingStock: Number(row.openingStock || "0"),
          })),
          glassFinishOverride: bulkOverrides.glassFinishOverride || null,
          screenOverride: bulkOverrides.screenOverride || null,
          openingTypeOverride: bulkOverrides.openingTypeOverride || null,
          slidingConfigOverride:
            String(bulkOverrides.openingTypeOverride).trim().toLowerCase() === "sliding"
              ? bulkOverrides.slidingConfigOverride || null
              : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create variants.");
      setValidationWarnings(extractValidationWarnings(payload));
      await variantsQuery.refetch();
      setNotice(`Created ${Array.isArray(payload.data) ? payload.data.length : normalizedRows.length} variants.`);
      setCreatingBulk(false);
      setBulkRows([createEmptyBulkVariantDraft()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create variants.");
    } finally {
      setSaving(false);
    }
  };

  const onUpdateVariant = async () => {
    if (!activeVariant || !draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setValidationWarnings([]);
    try {
      const res = await fetch(`/api/products/${id}/variants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          variantId: activeVariant.id,
          displayName: draft.displayName || null,
          sku: String(draft.sku ?? "").toUpperCase().replace(/\s+/g, ""),
          skuOverride: draft.skuOverride || null,
          skuSuffix: draft.skuSuffix || null,
          width: draft.width ? Number(draft.width) : null,
          height: draft.height ? Number(draft.height) : null,
          color: draft.color,
          glassTypeOverride: draft.glassTypeOverride || null,
          slidingConfigOverride: draft.slidingConfigOverride || null,
          glassCoatingOverride: draft.glassCoatingOverride || null,
          glassThicknessMmOverride: draft.glassThicknessMmOverride
            ? Number(draft.glassThicknessMmOverride)
            : null,
          glassFinishOverride: draft.glassFinishOverride || null,
          screenOverride: draft.screenOverride || null,
          openingTypeOverride: draft.openingTypeOverride || null,
          variantType: draft.variantType || null,
          thicknessMm: draft.thicknessMm ? Number(draft.thicknessMm) : null,
          boxSqft: draft.boxSqft ? Number(draft.boxSqft) : null,
          screenType: draft.screenType || null,
          slideDirection: draft.slideDirection || null,
          price: draft.price ? Number(draft.price) : null,
          cost: draft.cost ? Number(draft.cost) : null,
          reorderLevel: draft.reorderLevel ? Number(draft.reorderLevel) : 0,
          reorderQty: draft.reorderQty ? Number(draft.reorderQty) : 0,
          description: draft.description,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update variant.");
      setValidationWarnings(extractValidationWarnings(payload));
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

  const onOpenStockCount = () => {
    if (!activeVariant) return;
    setActualCount(String(Number(activeVariant.onHand ?? 0)));
    setCountNote("");
    setStockCountOpen(true);
  };

  const onApplyStockCount = async () => {
    if (!activeVariant) return;
    const parsedActual = Number(actualCount);
    if (!Number.isFinite(parsedActual) || parsedActual < 0) {
      setError("Actual Count must be a valid number >= 0.");
      return;
    }
    setCounting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/inventory/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          variantId: activeVariant.id,
          actualCount: parsedActual,
          note: countNote || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to apply stock count.");
      await variantsQuery.refetch();
      const next = variantsQuery.data?.find((row) => row.id === activeVariant.id);
      if (next) openVariant(next);
      const delta = Number(payload.data?.delta ?? 0);
      if (delta === 0) {
        setNotice("No change");
      } else {
        setNotice(
          `Adjusted ${delta > 0 ? "+" : ""}${formatStockWithUnit(
            Math.abs(delta),
            productQuery.data?.unit,
          )}.`,
        );
      }
      setStockCountOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply stock count.");
    } finally {
      setCounting(false);
    }
  };

  const isAllowedImageFile = (file: File) => {
    const mime = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return true;
    return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp");
  };

  const showInvalidImageTypeToast = () => {
    setUploadToast("Only jpg, png, webp allowed");
  };

  const uploadVariantImage = async (variantId: string, file: File) => {
    setUploadingVariantImageId(variantId);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/products/${id}/variants/${variantId}/images`, {
        method: "POST",
        headers: { "x-user-role": role },
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to upload variant image.");
      const refreshed = await variantsQuery.refetch();
      if (showArchived) await archivedVariantsQuery.refetch();
      const next = refreshed.data?.find((row) => row.id === variantId);
      if (next && activeVariant?.id === variantId) openVariant(next);
      setNotice("Variant image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload variant image.");
    } finally {
      setUploadingVariantImageId(null);
    }
  };

  const removeVariantImage = async (variantId: string) => {
    setUploadingVariantImageId(variantId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/products/${id}/variants/${variantId}/images`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to delete variant image.");
      const refreshed = await variantsQuery.refetch();
      if (showArchived) await archivedVariantsQuery.refetch();
      const next = refreshed.data?.find((row) => row.id === variantId);
      if (next && activeVariant?.id === variantId) openVariant(next);
      setNotice("Variant image deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete variant image.");
    } finally {
      setUploadingVariantImageId(null);
    }
  };

  useEffect(() => {
    if (!uploadToast) return;
    const timer = window.setTimeout(() => setUploadToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [uploadToast]);

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
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="ios-secondary-btn h-9 px-3 text-sm"
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
          <button type="button" onClick={openBulkCreate} className="ios-secondary-btn h-9 px-3 text-sm">
            + Bulk Add Variants
          </button>
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
      {uploadToast ? (
        <div className="fixed bottom-4 right-4 z-[60] rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 shadow">
          {uploadToast}
        </div>
      ) : null}
      {validationWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Validation warnings: {validationWarnings.join(" ")}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <article className="linear-card p-3">
          <p className="text-[11px] text-slate-500">Total Variants</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatQuantity(summaryStats.totalVariants)} variants
          </p>
        </article>
        <article className="linear-card p-3">
          <p className="text-[11px] text-slate-500">Total Stock</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatStockWithUnit(summaryStats.totalStock, productQuery.data?.unit)}
          </p>
        </article>
        <article className="linear-card p-3">
          <p className="text-[11px] text-slate-500">Total Cost Value</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(summaryStats.totalCostValue)}</p>
        </article>
        <article className="linear-card p-3">
          <p className="text-[11px] text-slate-500">Total Retail Value</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(summaryStats.totalRetailValue)}</p>
        </article>
        <article className="linear-card p-3">
          <p className="text-[11px] text-slate-500">Avg Margin %</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatPercent(summaryStats.avgMarginPct)}</p>
        </article>
        <article
          className={`p-3 ${
            summaryStats.lowStockVariants > 0
              ? "linear-card border-amber-200 bg-amber-50/70"
              : "linear-card"
          }`}
        >
          <p
            className={`text-[11px] ${
              summaryStats.lowStockVariants > 0 ? "text-amber-700" : "text-slate-500"
            }`}
          >
            Low Stock Variants
          </p>
          <p
            className={`mt-1 text-lg font-semibold ${
              summaryStats.lowStockVariants > 0 ? "text-amber-800" : "text-slate-900"
            }`}
          >
            {formatQuantity(summaryStats.lowStockVariants)} low stock
          </p>
        </article>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-white">
              <TableRow className="bg-white shadow-[inset_0_-1px_0_0_#E5E7EB] hover:bg-white">
                <TableHead className="w-[64px]">Image</TableHead>
                <TableHead>Variant Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Size (WxH)</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">OnHand</TableHead>
                <TableHead className="text-right">Reorder Level</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hydrated || variantsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-slate-500">Loading variants...</TableCell>
                </TableRow>
              ) : variants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-slate-500">No variants.</TableCell>
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
                    <TableCell>
                      <label
                        className={`relative inline-flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-slate-50 ${
                          dragOverVariantId === variant.id
                            ? "border-sky-400 ring-2 ring-sky-300"
                            : "border-slate-200"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverVariantId(variant.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragOverVariantId !== variant.id) setDragOverVariantId(variant.id);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverVariantId((prev) => (prev === variant.id ? null : prev));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverVariantId(null);
                          const file = e.dataTransfer?.files?.[0];
                          if (!file) return;
                          if (!isAllowedImageFile(file)) {
                            showInvalidImageTypeToast();
                            return;
                          }
                          void uploadVariantImage(variant.id, file);
                        }}
                      >
                        {variant.imageUrl ? (
                          <img src={variant.imageUrl} alt={variant.displayName ?? variant.sku} className="h-full w-full object-cover" />
                        ) : (
                          <Camera className="h-4 w-4 text-slate-400" />
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = "";
                            if (!file) return;
                            if (!isAllowedImageFile(file)) {
                              showInvalidImageTypeToast();
                              return;
                            }
                            void uploadVariantImage(variant.id, file);
                          }}
                        />
                      </label>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {toVariantName(productQuery.data?.name ?? "Product", variant, productQuery.data?.category)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{variant.sku}</span>
                        {variant.archivedAt ? (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{toSizeText(variant.width, variant.height)}</TableCell>
                    <TableCell>{variant.color ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {variant.price != null ? `$${Number(variant.price ?? 0).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {variant.cost != null ? `$${Number(variant.cost ?? 0).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatStockWithUnit(Number(variant.onHand ?? 0), productQuery.data?.unit)}
                    </TableCell>
                    <TableCell className="text-right">{Number(variant.reorderLevel ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const stockState = getStockAlertState(variant.available, variant.reorderLevel);
                        const numberClass =
                          stockState === "LOW"
                            ? "text-rose-700"
                            : stockState === "WARNING"
                              ? "text-amber-700"
                              : "text-slate-900";
                        return (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className={`font-medium ${numberClass}`}>
                              {formatStockWithUnit(Number(variant.available ?? 0), productQuery.data?.unit)}
                            </span>
                            {stockState ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  stockState === "LOW"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {stockState}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
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

      {creatingBulk || ((activeVariant || creatingVariant) && draft) ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          onClick={() => {
            setCreatingBulk(false);
            setCreatingVariant(false);
            setActiveVariant(null);
            setDraft(null);
          }}
        >
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">
              {creatingBulk ? "Bulk Add Variants" : creatingVariant ? "Add Variant" : "Variant Detail"}
            </h3>
            {!creatingBulk && !creatingVariant && activeVariant ? (
              <p className="mt-1 text-sm text-slate-500">
                {toVariantName(productQuery.data?.name ?? "Product", activeVariant, productQuery.data?.category)}
              </p>
            ) : null}
            {creatingBulk ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Defaults: {defaultsSubtitle || "-"}
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkOverrides((prev) => !prev)}
                  className="ios-secondary-btn h-9 px-3 text-sm"
                >
                  {showBulkOverrides ? "Hide Batch Overrides" : "Batch Override Specs (optional)"}
                </button>
                {showBulkOverrides ? (
                  <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-sm text-slate-600">Finish (batch)</span>
                        <select
                          value={bulkOverrides.glassFinishOverride}
                          onChange={(e) =>
                            setBulkOverrides((prev) => ({ ...prev, glassFinishOverride: e.target.value }))
                          }
                          className="ios-input h-10 w-full bg-white px-3 text-sm"
                        >
                          <option value="">Use Product Default ({productQuery.data?.glassFinishDefault ?? "-"})</option>
                          <option value="Clear">Clear</option>
                          <option value="Frosted">Frosted</option>
                        </select>
                      </label>
                      <Input
                        label="Screen (batch)"
                        value={bulkOverrides.screenOverride}
                        onChange={(value) => setBulkOverrides((prev) => ({ ...prev, screenOverride: value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Opening Type (batch)"
                        value={bulkOverrides.openingTypeOverride}
                        onChange={(value) =>
                          setBulkOverrides((prev) => ({
                            ...prev,
                            openingTypeOverride: value,
                            slidingConfigOverride:
                              value.trim().toLowerCase() === "sliding" ? prev.slidingConfigOverride : "",
                          }))
                        }
                      />
                      {isBulkSliding ? (
                        <Input
                          label="Sliding Config (batch)"
                          value={bulkOverrides.slidingConfigOverride}
                          onChange={(value) =>
                            setBulkOverrides((prev) => ({ ...prev, slidingConfigOverride: value }))
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Specifications (Effective Batch)</p>
                  <p className="mt-1">{bulkSubtitle || "-"}</p>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-slate-500">
                    <span>W</span><span>H</span><span>Color</span><span>Price</span><span>Cost</span><span>Stock</span><span></span>
                  </div>
                  {bulkRows.map((row) => {
                    const skuPreview =
                      generateVariantSku({
                        skuPrefix: productQuery.data?.skuPrefix ?? "",
                        width: Number(row.width || 0),
                        height: Number(row.height || 0),
                        color: row.color,
                        glassFinish: bulkEffectiveSpecs.glassFinish,
                        manualSkuOverride: null,
                      }).effectiveSku || "-";
                    return (
                      <div key={row.id} className="space-y-1 rounded-md border border-slate-100 p-2">
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2">
                          <input value={row.width} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, width: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <input value={row.height} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, height: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <input value={row.color} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, color: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <input value={row.price} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, price: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <input value={row.cost} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, cost: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <input value={row.openingStock} onChange={(e) => setBulkRows((prev) => prev.map((item) => item.id === row.id ? { ...item, openingStock: e.target.value } : item))} className="ios-input h-9 px-2 text-sm" />
                          <button type="button" onClick={() => setBulkRows((prev) => prev.length > 1 ? prev.filter((item) => item.id !== row.id) : prev)} className="ios-secondary-btn h-9 px-2 text-xs">Del</button>
                        </div>
                        <p className="text-xs text-slate-500">SKU Preview: {skuPreview}</p>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setBulkRows((prev) => [...prev, createEmptyBulkVariantDraft()])}
                    className="ios-secondary-btn h-9 px-3 text-sm"
                  >
                    + Add Row
                  </button>
                </div>
              </div>
            ) : draft ? (
            <div className="mt-4 space-y-3">
              {!creatingVariant && activeVariant ? (
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">Image</span>
                  {activeVariant.imageUrl ? (
                    <div
                      className={`relative overflow-hidden rounded-xl border bg-slate-50 ${
                        dragOverDetailImage ? "border-sky-400 ring-2 ring-sky-300" : "border-slate-200"
                      }`}
                    >
                      <label
                        className="block cursor-pointer"
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverDetailImage(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!dragOverDetailImage) setDragOverDetailImage(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverDetailImage(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverDetailImage(false);
                          const file = e.dataTransfer?.files?.[0];
                          if (!file) return;
                          if (!isAllowedImageFile(file)) {
                            showInvalidImageTypeToast();
                            return;
                          }
                          void uploadVariantImage(activeVariant.id, file);
                        }}
                      >
                        <img
                          src={activeVariant.imageUrl}
                          alt={activeVariant.displayName ?? activeVariant.sku}
                          className="h-40 w-full object-cover"
                        />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = "";
                            if (!file) return;
                            if (!isAllowedImageFile(file)) {
                              showInvalidImageTypeToast();
                              return;
                            }
                            void uploadVariantImage(activeVariant.id, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void removeVariantImage(activeVariant.id)}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white"
                        aria-label="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      className={`flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-slate-50 text-slate-500 transition hover:bg-slate-100 ${
                        dragOverDetailImage ? "border-sky-400 ring-2 ring-sky-300" : "border-slate-300"
                      }`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverDetailImage(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!dragOverDetailImage) setDragOverDetailImage(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverDetailImage(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverDetailImage(false);
                        const file = e.dataTransfer?.files?.[0];
                        if (!file) return;
                        if (!isAllowedImageFile(file)) {
                          showInvalidImageTypeToast();
                          return;
                        }
                        void uploadVariantImage(activeVariant.id, file);
                      }}
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-sm font-medium">Upload Image</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.currentTarget.value = "";
                          if (!file) return;
                          if (!isAllowedImageFile(file)) {
                            showInvalidImageTypeToast();
                            return;
                          }
                          void uploadVariantImage(activeVariant.id, file);
                        }}
                      />
                    </label>
                  )}
                  {uploadingVariantImageId === activeVariant.id ? (
                    <p className="text-xs text-slate-500">Uploading image...</p>
                  ) : null}
                </div>
              ) : creatingVariant ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Save the variant first, then upload one image (jpg, png, webp).
                </div>
              ) : null}
              <Input
                label="Display Name"
                value={draft.displayName}
                onChange={(v) => setDraft((prev) => (prev ? { ...prev, displayName: v } : prev))}
                required
                placeholder="e.g. Santafe Oak or Albany Elm"
              />
              <Input
                label="SKU"
                value={draft.sku}
                required
                onChange={(v) =>
                  setDraft((prev) =>
                    prev ? { ...prev, sku: String(v ?? "").toUpperCase().replace(/\s+/g, "") } : prev,
                  )
                }
              />
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">SKU Preview</span>
                <div className="ios-input flex h-10 items-center bg-slate-50 px-3 text-sm text-slate-700">
                  {createSkuPreview}
                </div>
                {draft.skuOverride ? (
                  <p className="text-xs text-slate-500">Manual SKU (not auto-updated).</p>
                ) : null}
              </label>
              {String(productQuery.data?.category ?? "").toUpperCase() !== "FLOOR" ? (
                <Input
                  label="Variant SKU Override (optional)"
                  value={draft.skuOverride}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, skuOverride: v } : prev))}
                />
              ) : null}
              {creatingVariant ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Defaults: {defaultsSubtitle || "-"}
                </div>
              ) : null}
              {formProfile === "FLOOR" ? (
                <>
                  <Input
                    label="Type / Category"
                    value={draft.screenType}
                    onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenType: v } : prev))}
                    placeholder="e.g. LVP"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Plank Length (in)"
                      value={draft.width}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))}
                      inputRef={creatingVariant ? widthInputRef : undefined}
                    />
                    <Input
                      label="Plank Width (in)"
                      value={draft.height}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))}
                    />
                  </div>
                  <Input label="Color / Style" value={draft.color} onChange={(v) => setDraft((prev) => (prev ? { ...prev, color: v } : prev))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Thickness (mm)" value={draft.thicknessMm} onChange={(v) => setDraft((prev) => (prev ? { ...prev, thicknessMm: v } : prev))} />
                    <Input label="Wear Layer (mil)" value={draft.variantType} onChange={(v) => setDraft((prev) => (prev ? { ...prev, variantType: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Core Thickness (mm)" value={draft.glassThicknessMmOverride} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassThicknessMmOverride: v } : prev))} />
                    <Input label="Box Coverage (sqft)" value={draft.boxSqft} onChange={(v) => setDraft((prev) => (prev ? { ...prev, boxSqft: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label="Installation Type"
                      value={draft.openingTypeOverride}
                      options={["Click", "Glue", "Float"]}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))}
                    />
                    <Select
                      label="Underlayment"
                      value={draft.screenOverride}
                      options={["Attached", "Separate", "None"]}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))}
                    />
                  </div>
                </>
              ) : formProfile === "WINDOW" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Width (in)"
                      value={draft.width}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))}
                      inputRef={creatingVariant ? widthInputRef : undefined}
                    />
                    <Input label="Height (in)" value={draft.height} onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Color" value={draft.color} options={["White", "Black"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, color: v } : prev))} />
                    <Select label="Glass Type" value={draft.glassTypeOverride} options={["Low-E", "Clear", "Tempered"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassTypeOverride: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Frame Material" value={draft.slidingConfigOverride} options={["Vinyl", "Aluminum"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, slidingConfigOverride: v } : prev))} />
                    <Select label="Screen" value={draft.screenOverride} options={["Yes", "No"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))} />
                  </div>
                  <Input label="Lock Type" value={draft.slideDirection} onChange={(v) => setDraft((prev) => (prev ? { ...prev, slideDirection: v } : prev))} />
                </>
              ) : formProfile === "MIRROR" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Width (in)"
                      value={draft.width}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))}
                      inputRef={creatingVariant ? widthInputRef : undefined}
                    />
                    <Input label="Height (in)" value={draft.height} onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Shape" value={draft.variantType} options={["Round", "Rectangle", "Square"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, variantType: v } : prev))} />
                    <Select label="Frame" value={draft.glassFinishOverride} options={["Frameless", "Black", "Gold"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassFinishOverride: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select label="Anti-Fog" value={draft.glassTypeOverride} options={["No", "Yes"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassTypeOverride: v } : prev))} />
                    <Select label="Dimmable" value={draft.slidingConfigOverride} options={["No", "Yes"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, slidingConfigOverride: v } : prev))} />
                    <Select label="Color Changeable" value={draft.screenOverride} options={["No", "Yes"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))} />
                  </div>
                </>
              ) : formProfile === "SHOWER" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Width (in)"
                      value={draft.width}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))}
                      inputRef={creatingVariant ? widthInputRef : undefined}
                    />
                    <Input label="Height (in)" value={draft.height} onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Glass Thickness (mm)" value={draft.thicknessMm} onChange={(v) => setDraft((prev) => (prev ? { ...prev, thicknessMm: v } : prev))} />
                    <Select label="Glass Type" value={draft.glassTypeOverride} options={["Clear", "Frosted", "Tempered"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassTypeOverride: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Frame Material" value={draft.openingTypeOverride} options={["SS304", "Aluminum", "Frameless"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))} />
                    <Select label="Color / Finish" value={draft.glassFinishOverride} options={["Silver", "Black", "Gold"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassFinishOverride: v } : prev))} />
                  </div>
                  <Select label="Door Type" value={draft.slidingConfigOverride} options={["Sliding", "Pivot", "Bi-fold"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, slidingConfigOverride: v } : prev))} />
                </>
              ) : formProfile === "FLOOR_ACCESSORY" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Accessory Type" value={draft.variantType} options={["T Molding", "Stair Bullnose", "Corner Round", "Baseboard", "F Molding", "G Molding", "Stair Plank", "Stair Sticker"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, variantType: v } : prev))} />
                    <Input label="Length (feet)" value={draft.width} onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))} inputRef={creatingVariant ? widthInputRef : undefined} />
                  </div>
                  <Input label="Color / Style" value={draft.color} onChange={(v) => setDraft((prev) => (prev ? { ...prev, color: v } : prev))} />
                </>
              ) : formProfile === "TILE_EDGE" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Edge Type" value={draft.variantType} options={["Bullnose", "L-Angle", "Square", "Quadec"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, variantType: v } : prev))} />
                    <Select label="Material" value={draft.openingTypeOverride} options={["Stainless Steel", "Aluminum"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Finish" value={draft.glassFinishOverride} options={["Silver Brushed", "Silver Mirror", "Gold"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassFinishOverride: v } : prev))} />
                    <Input label="Length (feet)" value={draft.width} onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))} inputRef={creatingVariant ? widthInputRef : undefined} />
                  </div>
                </>
              ) : formProfile === "NICHE" ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Input label="Width (in)" value={draft.width} onChange={(v) => setDraft((prev) => (prev ? { ...prev, width: v } : prev))} inputRef={creatingVariant ? widthInputRef : undefined} />
                    <Input label="Height (in)" value={draft.height} onChange={(v) => setDraft((prev) => (prev ? { ...prev, height: v } : prev))} />
                    <Input label="Depth (in)" value={draft.slideDirection} onChange={(v) => setDraft((prev) => (prev ? { ...prev, slideDirection: v } : prev))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Color" value={draft.color} options={["Black", "Gray", "White"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, color: v } : prev))} />
                    <Select label="Material" value={draft.openingTypeOverride} options={["Stainless Steel"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))} />
                  </div>
                  <Select label="LED" value={draft.screenOverride} options={["No", "Yes"]} onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))} />
                </>
              ) : (
                <>
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
                </>
              )}
              {creatingVariant && formProfile === "UNKNOWN" ? (
                <button
                  type="button"
                  onClick={() => setShowCreateOverrides((prev) => !prev)}
                  className="ios-secondary-btn h-9 px-3 text-sm"
                >
                  {showCreateOverrides ? "Hide Override Specs" : "Override Specs (optional)"}
                </button>
              ) : null}
              {(formProfile === "UNKNOWN" || (!creatingVariant && formProfile === "WINDOW")) && (!creatingVariant || showCreateOverrides) ? (
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Override Specs (optional)</p>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                openingTypeOverride: "",
                                slidingConfigOverride: "",
                                glassTypeOverride: "",
                                glassCoatingOverride: "",
                                glassThicknessMmOverride: "",
                                glassFinishOverride: "",
                                screenOverride: "",
                              }
                            : prev,
                        )
                      }
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Reset all to Product Default
                    </button>
                  </div>
                  {String(productQuery.data?.category ?? "").toUpperCase() !== "FLOOR" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-sm text-slate-600">Glass Finish Override</span>
                        <select
                          value={draft.glassFinishOverride}
                          onChange={(e) => setDraft((prev) => (prev ? { ...prev, glassFinishOverride: e.target.value } : prev))}
                          className="ios-input h-10 w-full bg-white px-3 text-sm"
                        >
                          <option value="">Use Product Default ({productQuery.data?.glassFinishDefault ?? "-"})</option>
                          <option value="Clear">Clear</option>
                          <option value="Frosted">Frosted</option>
                        </select>
                      </label>
                      <Input
                        label="Glass Type Override"
                        value={draft.glassTypeOverride}
                        onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassTypeOverride: v } : prev))}
                      />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Coating Override"
                      value={draft.glassCoatingOverride}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassCoatingOverride: v } : prev))}
                    />
                    <Input
                      label="Thickness Override (mm)"
                      value={draft.glassThicknessMmOverride}
                      onChange={(v) => setDraft((prev) => (prev ? { ...prev, glassThicknessMmOverride: v } : prev))}
                    />
                  </div>
                  {String(productQuery.data?.category ?? "").toUpperCase() !== "FLOOR" ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="Opening Type Override"
                          value={draft.openingTypeOverride}
                          onChange={(v) => setDraft((prev) => (prev ? { ...prev, openingTypeOverride: v } : prev))}
                        />
                        {isEffectiveSliding ? (
                          <Input
                            label="Sliding Config Override"
                            value={draft.slidingConfigOverride}
                            onChange={(v) => setDraft((prev) => (prev ? { ...prev, slidingConfigOverride: v } : prev))}
                          />
                        ) : (
                          <Input
                            label="Screen Override"
                            value={draft.screenOverride}
                            onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))}
                          />
                        )}
                      </div>
                      {isEffectiveSliding ? (
                        <Input
                          label="Screen Override"
                          value={draft.screenOverride}
                          onChange={(v) => setDraft((prev) => (prev ? { ...prev, screenOverride: v } : prev))}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Specifications (Effective)</p>
                <p className="mt-1">{effectiveSubtitle || "No effective specs."}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Sale Price" value={draft.price} onChange={(v) => setDraft((prev) => (prev ? { ...prev, price: v } : prev))} />
                <Input label="Cost" value={draft.cost} onChange={(v) => setDraft((prev) => (prev ? { ...prev, cost: v } : prev))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Reorder Level"
                  value={draft.reorderLevel}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, reorderLevel: v } : prev))}
                />
                <Input
                  label="Reorder Qty"
                  value={draft.reorderQty}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, reorderQty: v } : prev))}
                />
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
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              {creatingBulk ? (
                <button
                  type="button"
                  onClick={() => {
                    void onCreateBulkVariants();
                  }}
                  disabled={saving || filledBulkRowCount === 0}
                  className="ios-primary-btn h-9 px-3 text-sm"
                >
                  {saving ? "Creating..." : `Create ${filledBulkRowCount} Variants`}
                </button>
              ) : creatingVariant ? (
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
                <>
                  <button
                    type="button"
                    onClick={onUpdateVariant}
                    disabled={saving}
                    className="ios-primary-btn h-9 px-3 text-sm"
                  >
                    {saving ? "Updating..." : "Update"}
                  </button>
                  {activeVariant ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        setError(null);
                        setNotice(null);
                        try {
                          const res = await fetch(`/api/products/${id}/variants`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", "x-user-role": role },
                            body: JSON.stringify({
                              variantId: activeVariant.id,
                              archive: !activeVariant.archivedAt,
                            }),
                          });
                          const payload = await res.json();
                          if (!res.ok) throw new Error(payload.error ?? "Failed to update archive status.");
                          await variantsQuery.refetch();
                          await archivedVariantsQuery.refetch();
                          setNotice(activeVariant.archivedAt ? "Variant restored." : "Variant archived.");
                          setActiveVariant(null);
                          setDraft(null);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to update archive status.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="ios-secondary-btn h-9 px-3 text-sm"
                    >
                      {activeVariant.archivedAt ? "Unarchive" : "Archive"}
                    </button>
                  ) : null}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setCreatingBulk(false);
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
                    Use positive or negative number. Current on-hand:{" "}
                    {formatStockWithUnit(Number(activeVariant.onHand ?? 0), productQuery.data?.unit)}
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
                  <button type="button" onClick={onOpenStockCount} className="ios-secondary-btn h-9 px-3 text-sm">
                    Stock Count
                  </button>
                  {activeVariant ? (
                    <Link
                      href={`/inventory/movements?variantId=${activeVariant.id}`}
                      className="ios-secondary-btn h-9 px-3 text-sm"
                    >
                      View Movements
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {stockCountOpen && activeVariant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-md">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-slate-900">Stock Count</h3>
              <p className="mt-1 text-xs text-slate-500">Variant: {activeVariant.sku}</p>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Current On Hand</span>
                <input
                  value={Number(activeVariant.onHand ?? 0).toFixed(2)}
                  disabled
                  className="ios-input h-10 w-full bg-slate-50 px-3 text-sm text-slate-500"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Actual Count</span>
                <input
                  value={actualCount}
                  onChange={(e) => setActualCount(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="ios-input h-10 w-full px-3 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Count Note (optional)</span>
                <textarea
                  value={countNote}
                  onChange={(e) => setCountNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStockCountOpen(false)}
                disabled={counting}
                className="ios-secondary-btn h-9 px-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApplyStockCount}
                disabled={counting}
                className="ios-primary-btn h-9 px-3 text-sm disabled:opacity-60"
              >
                {counting ? "Applying..." : "Apply Adjustment"}
              </button>
            </div>
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
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        ref={inputRef}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="ios-input h-10 w-full px-3 text-sm"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="ios-input h-10 w-full bg-white px-3 text-sm">
        <option value="">Not Set</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
