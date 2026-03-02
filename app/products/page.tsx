"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { renderTemplateSku } from "@/lib/product-template-engine";
import {
  CATEGORY_LABEL_MAP,
  CATEGORY_OPTIONS,
  UNIT_LABEL_MAP,
  UNIT_OPTIONS,
} from "@/lib/inventory";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Warehouse = {
  id: string;
  name: string;
};

type Supplier = {
  id: string;
  name: string;
  category: string;
};

type ProductCategoryTemplate = {
  id: string;
  categoryId: string;
  categoryKey: string;
  categoryLabel: string;
  titleTemplate: string;
  skuTemplate: string;
  requiredFields: string[];
  fieldOrder: string[];
};

type InventoryGroup = {
  id: string;
  name: string;
  description: string | null;
  _count?: { products: number };
};

type ProductVariantStock = {
  id: string;
  sku: string;
  description?: string | null;
  cost?: number | null;
  price?: number | null;
  width?: number | null;
  height?: number | null;
  color?: string | null;
  onHand: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  galleryImageUrl?: string | null;
  specification: string | null;
  category: string;
  categoryId?: string | null;
  customCategoryName?: string | null;
  brand?: string | null;
  collection?: string | null;
  model?: string | null;
  material?: string | null;
  type?: string | null;
  style?: string | null;
  screenType?: string | null;
  color?: string | null;
  finish?: string | null;
  sizeW?: string | null;
  sizeH?: string | null;
  thicknessMm?: string | null;
  glass?: string | null;
  glassTypeDefault?: string | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
  openingTypeDefault?: string | null;
  rating?: string | null;
  swing?: string | null;
  handing?: string | null;
  uom?: string | null;
  price?: string | null;
  cost?: string | null;
  title?: string | null;
  titleOverride?: boolean;
  skuPrefix?: string | null;
  defaultDescription?: string | null;
  notes?: string | null;
  unit: string;
  costPrice: string | null;
  salePrice: string | null;
  supplierId?: string | null;
  supplier?: Supplier | null;
  groupId?: string | null;
  group?: InventoryGroup | null;
  warehouseId: string;
  warehouse: Warehouse;
  variants?: ProductVariantStock[];
  stockSummary?: {
    onHand: number;
    reserved: number;
    available: number;
  };
  variantCount?: number;
  priceMin?: number | null;
  priceMax?: number | null;
  totalAvailable?: number;
};

type FilterCategory = "ALL" | (typeof CATEGORY_OPTIONS)[number]["value"];

const FILTERS: { label: string; value: FilterCategory }[] = [
  { label: "All", value: "ALL" },
  { label: "Windows", value: "WINDOW" },
  { label: "Flooring", value: "FLOOR" },
  { label: "Mirrors", value: "MIRROR" },
  { label: "Doors", value: "DOOR" },
  { label: "Warehouse Supplies", value: "WAREHOUSE_SUPPLY" },
];
const ADD_NEW_CATEGORY_VALUE = "__ADD_NEW_CATEGORY__";
const TEMPLATE_FIELD_META: Record<
  string,
  { label: string; type?: "text" | "number"; placeholder?: string; min?: string; step?: string }
> = {
  brand: { label: "Brand" },
  collection: { label: "Collection" },
  model: { label: "Model" },
  material: { label: "Material" },
  type: { label: "Type" },
  style: { label: "Style" },
  screen_type: { label: "Screen" },
  color: { label: "Color" },
  finish: { label: "Finish" },
  glass: { label: "Glass" },
  rating: { label: "Rating" },
  swing: { label: "Opening Type" },
  handing: { label: "Sliding Configuration" },
  size_w: { label: "Width", type: "number", min: "0", step: "0.01" },
  size_h: { label: "Height", type: "number", min: "0", step: "0.01" },
  thickness_mm: { label: "Thickness (mm)", type: "number", min: "0", step: "0.01" },
  notes: { label: "Template Notes", placeholder: "Optional notes" },
};

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function toSkuDimensionPart(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.trunc(n));
}

function colorCodeFromColor(color: string) {
  const normalized = String(color ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const map: Record<string, string> = {
    white: "W",
    black: "B",
    gray: "G",
    grey: "G",
    bronze: "Z",
  };
  return map[normalized] ?? normalized.slice(0, 1).toUpperCase();
}

function buildVariantSkuPreview(
  prefix: string,
  width: string,
  height: string,
  color: string,
  glassFinishDefault?: string,
) {
  const p = normalizeSkuValue(prefix);
  const w = toSkuDimensionPart(width);
  const h = toSkuDimensionPart(height);
  const c = colorCodeFromColor(color);
  if (!p || !w || !h || !c) return "";
  const suffix = String(glassFinishDefault ?? "").trim().toUpperCase() === "FROSTED" ? "F" : "";
  return `${p}${w}${h}${c}${suffix}`;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

const SKU_PREFIX_OPTIONS = ["VWW", "DOR", "FLR", "MIR", "WHS"] as const;
const CUSTOM_SKU_PREFIX_VALUE = "__CUSTOM__";

const initialNewProductForm = {
  name: "",
  barcode: "",
  specification: "",
  category: "WINDOW",
  categoryId: "",
  customCategoryName: "",
  brand: "",
  collection: "",
  model: "",
  material: "",
  type: "",
  style: "",
  screenType: "",
  color: "",
  finish: "",
  sizeW: "",
  sizeH: "",
  thicknessMm: "",
  glass: "",
  glassTypeDefault: "TEMPERED_LOW_E_5MM",
  glassFinishDefault: "CLEAR",
  screenDefault: "",
  openingTypeDefault: "",
  rating: "",
  swing: "",
  handing: "",
  uom: "",
  price: "",
  cost: "",
  title: "",
  titleOverride: false,
  skuPrefix: "",
  variantSku: "",
  defaultDescription: "",
  variantDescription: "",
  notes: "",
  unit: "SQM",
  costPrice: "",
  salePrice: "",
  supplierId: "",
  groupId: "",
  warehouseId: "",
};

type NewVariantDraft = {
  id: string;
  variantId?: string;
  width: string;
  height: string;
  color: string;
  sku: string;
  salePrice: string;
  cost: string;
  openingStock: string;
};

let newVariantDraftCounter = 0;

const createEmptyVariantDraft = (): NewVariantDraft => ({
  id: `variant-draft-${++newVariantDraftCounter}`,
  width: "",
  height: "",
  color: "",
  sku: "",
  salePrice: "",
  cost: "",
  openingStock: "0",
});

export default function ProductsPage() {
  const router = useRouter();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<FilterCategory>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [openNewDialog, setOpenNewDialog] = useState(false);
  const [addProductTab, setAddProductTab] = useState<"GENERAL" | "VARIANTS">("GENERAL");
  const [newProductForm, setNewProductForm] = useState(initialNewProductForm);
  const [newProductVariants, setNewProductVariants] = useState<NewVariantDraft[]>([
    createEmptyVariantDraft(),
  ]);
  const [submittingNew, setSubmittingNew] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [skuPrefixCustomMode, setSkuPrefixCustomMode] = useState(false);
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [openGroupDialog, setOpenGroupDialog] = useState(false);
  const [openStockDialog, setOpenStockDialog] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockVariantId, setStockVariantId] = useState("");
  const [stockAdjustmentQty, setStockAdjustmentQty] = useState("");
  const [submittingStock, setSubmittingStock] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [submittingGroup, setSubmittingGroup] = useState(false);
  const [submittingBatchSku, setSubmittingBatchSku] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
  const [skuConflict, setSkuConflict] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupDescription, setEditingGroupDescription] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [customCategoryFilter, setCustomCategoryFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [openColumnMenu, setOpenColumnMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showOptionalColumns, setShowOptionalColumns] = useState({
    group: false,
    specification: false,
    unit: false,
    onHand: false,
    reserved: false,
    supplier: false,
    gallery: false,
  });
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState<string>("UNASSIGNED");
  const [submittingBulkGroup, setSubmittingBulkGroup] = useState(false);

  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const productsQuery = useQuery({
    queryKey: ["products", role, category, groupFilter, customCategoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category !== "ALL") params.set("category", category);
      if (groupFilter !== "ALL") params.set("groupId", groupFilter);
      if (customCategoryFilter !== "ALL") params.set("customCategoryName", customCategoryFilter);
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/products${query}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch products");
      return payload as { data: Product[]; meta: { lowStockCount: number } };
    },
  });

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", role],
    queryFn: async () => {
      const res = await fetch("/api/warehouses", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch warehouses");
      return payload.data as Warehouse[];
    },
    enabled: role !== "SALES",
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", role],
    queryFn: async () => {
      const res = await fetch("/api/suppliers", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch suppliers");
      return payload.data as Supplier[];
    },
    enabled: role !== "WAREHOUSE",
  });

  const groupsQuery = useQuery({
    queryKey: ["inventory-groups", role],
    queryFn: async () => {
      const res = await fetch("/api/inventory-groups", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch inventory groups");
      return payload.data as InventoryGroup[];
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["product-category-templates", role],
    queryFn: async () => {
      const res = await fetch("/api/product-category-templates", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch category templates");
      const rows = payload.data as Array<
        Omit<ProductCategoryTemplate, "requiredFields" | "fieldOrder"> & {
          requiredFields: unknown;
          fieldOrder: unknown;
        }
      >;
      return rows.map((row) => ({
        ...row,
        requiredFields: Array.isArray(row.requiredFields) ? (row.requiredFields as string[]) : [],
        fieldOrder: Array.isArray(row.fieldOrder) ? (row.fieldOrder as string[]) : [],
      })) as ProductCategoryTemplate[];
    },
  });

  const customCategoriesQuery = useQuery({
    queryKey: ["product-custom-categories", role],
    queryFn: async () => {
      const res = await fetch("/api/products?category=OTHER", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch custom categories");
      const rows = (payload.data ?? []) as Product[];
      return Array.from(
        new Set(
          rows
            .map((item) => (item.customCategoryName ?? "").trim())
            .filter((name) => name.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b));
    },
  });

  const displayRows = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);
  const selectedTemplate = useMemo(
    () =>
      (templatesQuery.data ?? []).find(
        (tpl) => tpl.id === newProductForm.categoryId || tpl.categoryKey === newProductForm.category,
      ) ?? null,
    [templatesQuery.data, newProductForm.categoryId, newProductForm.category],
  );
  const templateDataPreview = useMemo(
    () => ({
      brand: newProductForm.brand,
      collection: newProductForm.collection,
      model: newProductForm.model,
      material: newProductForm.material,
      type: newProductForm.type,
      style: newProductForm.style,
      screen_type: newProductForm.screenType,
      screen: newProductForm.screenType,
      color: newProductForm.color,
      finish: newProductForm.finish,
      size_w: newProductForm.sizeW,
      size_h: newProductForm.sizeH,
      thickness_mm: newProductForm.thicknessMm,
      glass: newProductForm.glass,
      glassTypeDefault: newProductForm.glassTypeDefault,
      glassFinishDefault: newProductForm.glassFinishDefault,
      screenDefault: newProductForm.screenDefault,
      openingTypeDefault: newProductForm.openingTypeDefault,
      rating: newProductForm.rating,
      swing: newProductForm.swing,
      handing: newProductForm.handing,
      w: newProductForm.sizeW,
      h: newProductForm.sizeH,
      thk: newProductForm.thicknessMm,
      hand: newProductForm.handing,
    }),
    [newProductForm],
  );
  const autoTitlePreview = useMemo(() => newProductForm.name.trim(), [newProductForm.name]);
  const autoSkuPreview = useMemo(() => {
    const prefix = normalizeSkuValue(newProductForm.skuPrefix);
    const width = Number(newProductForm.sizeW);
    const height = Number(newProductForm.sizeH);
    if (prefix && Number.isFinite(width) && Number.isFinite(height)) {
      return `${prefix}${Math.trunc(width)}${Math.trunc(height)}`;
    }
    if (!selectedTemplate) return "";
    const raw = renderTemplateSku(selectedTemplate.skuTemplate, templateDataPreview, []);
    return normalizeSkuValue(raw);
  }, [newProductForm.skuPrefix, newProductForm.sizeW, newProductForm.sizeH, selectedTemplate, templateDataPreview]);
  const variantSkuOverrideValue = normalizeNullableString(newProductForm.variantSku);
  const hasVariantSkuOverride = Boolean(variantSkuOverrideValue);
  const effectiveSkuValue = normalizeSkuValue((variantSkuOverrideValue ?? autoSkuPreview) || "");
  const skuPrefixSelectValue = useMemo(() => {
    const value = normalizeSkuValue(newProductForm.skuPrefix);
    if (!value) return "";
    if (skuPrefixCustomMode) return CUSTOM_SKU_PREFIX_VALUE;
    return SKU_PREFIX_OPTIONS.includes(value as (typeof SKU_PREFIX_OPTIONS)[number])
      ? value
      : CUSTOM_SKU_PREFIX_VALUE;
  }, [newProductForm.skuPrefix, skuPrefixCustomMode]);
  const customCategoryOptions = customCategoriesQuery.data ?? [];
  const effectiveCustomCategoryOptions =
    newProductForm.category === "OTHER" && newProductForm.customCategoryName?.trim()
      ? Array.from(new Set([...customCategoryOptions, newProductForm.customCategoryName.trim()])).sort((a, b) =>
          a.localeCompare(b),
        )
      : customCategoryOptions;
  const getCategoryLabel = (product: Product) => {
    if (product.category === "OTHER" && product.customCategoryName?.trim()) {
      return product.customCategoryName.trim();
    }
    return CATEGORY_LABEL_MAP[product.category] ?? product.category;
  };
  const templateFieldToFormKey = (field: string): keyof typeof initialNewProductForm => {
    if (field === "size_w") return "sizeW";
    if (field === "size_h") return "sizeH";
    if (field === "thickness_mm") return "thicknessMm";
    if (field === "screen_type" || field === "screen") return "screenType";
    return field as keyof typeof initialNewProductForm;
  };
  const customCategorySelectValue =
    newProductForm.category === "OTHER" && newProductForm.customCategoryName?.trim()
      ? `CUSTOM:${newProductForm.customCategoryName.trim()}`
      : newProductForm.category;
  const optionalColumnCount = Object.values(showOptionalColumns).filter(Boolean).length;
  const isWindowCategory = newProductForm.category === "WINDOW";
  const isSlidingOpeningType =
    String(newProductForm.openingTypeDefault ?? newProductForm.swing ?? "")
      .trim()
      .toUpperCase() === "SLIDING";
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return displayRows;
    return displayRows.filter((row) => {
      const variantSku = (row.variants ?? [])
        .map((item) => item.sku.toLowerCase())
        .join(" ");
      return (
        row.name.toLowerCase().includes(q) ||
        getCategoryLabel(row).toLowerCase().includes(q) ||
        (row.specification ?? "").toLowerCase().includes(q) ||
        (row.warehouse?.name ?? "").toLowerCase().includes(q) ||
        (row.supplier?.name ?? "").toLowerCase().includes(q) ||
        variantSku.includes(q)
      );
    });
  }, [displayRows, searchTerm]);
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedProductIds.includes(row.id));

  const addVariantRow = () => {
    setNewProductVariants((prev) => [...prev, createEmptyVariantDraft()]);
  };

  const deleteVariantRow = (variantId: string) => {
    setNewProductVariants((prev) => {
      const target = prev.find((item) => item.id === variantId);
      if (target?.variantId) {
        setError("Existing variants cannot be deleted in Edit mode. Set stock to 0 if needed.");
        return prev;
      }
      const next = prev.filter((item) => item.id !== variantId);
      return next.length > 0 ? next : [createEmptyVariantDraft()];
    });
  };

  const bulkAddVariantRows = () => {
    setNewProductVariants((prev) => [
      ...prev,
      createEmptyVariantDraft(),
      createEmptyVariantDraft(),
      createEmptyVariantDraft(),
    ]);
  };

  const updateVariantRow = (variantId: string, patch: Partial<NewVariantDraft>) => {
    setNewProductVariants((prev) =>
      prev.map((item) => (item.id === variantId ? { ...item, ...patch } : item)),
    );
  };

  const onCreateProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isEdit = Boolean(editingProductId);
    if (hasVariantSkuOverride && skuConflict) {
      setError("SKU already exists. Please update SKU prefix, size, or override value.");
      return;
    }
    if (!newProductForm.name.trim() || !newProductForm.warehouseId) {
      setError("Product name and warehouse are required.");
      return;
    }
    const isSizeColorDriven = newProductForm.category === "WINDOW";
    const normalizedSkuPrefix = normalizeSkuValue(newProductForm.skuPrefix);
    if (isSizeColorDriven && !normalizedSkuPrefix) {
      setError("SKU Prefix is required for Window products.");
      return;
    }
    const normalizedVariants = newProductVariants.map((item) => {
      const skuPreview = buildVariantSkuPreview(
        normalizedSkuPrefix,
        item.width,
        item.height,
        item.color,
        newProductForm.glassFinishDefault,
      );
      const rawSku = normalizeSkuValue(item.sku);
      const finalSku = rawSku || skuPreview;
      return {
        ...item,
        width: item.width.trim(),
        height: item.height.trim(),
        color: item.color.trim(),
        sku: finalSku,
        skuPreview,
        salePrice: item.salePrice.trim(),
        cost: item.cost.trim(),
        openingStock: item.openingStock.trim(),
      };
    });
    const hasInvalid = normalizedVariants.some((item) => {
      if (!item.sku) return true;
      if (item.sku.includes("-")) return true;
      if (isSizeColorDriven) {
        if (!item.width || !item.height) return true;
        if (!item.color) return true;
        const code = colorCodeFromColor(item.color);
        if (!code) return true;
        const isFrostedDefault = String(newProductForm.glassFinishDefault ?? "").trim().toUpperCase() === "FROSTED";
        const expectedTail = isFrostedDefault ? `${code}F` : code;
        if (!item.sku.endsWith(expectedTail)) return true;
      }
      const salePrice = Number(item.salePrice);
      const cost = Number(item.cost);
      const openingStock = Number(item.openingStock);
      return (
        !Number.isFinite(salePrice) ||
        !Number.isFinite(cost) ||
        !Number.isFinite(openingStock) ||
        salePrice < 0 ||
        cost < 0 ||
        openingStock < 0
      );
    });
    if (hasInvalid) {
      if (isSizeColorDriven && normalizedVariants.some((item) => !item.width || !item.height)) {
        setError("Size is required.");
        return;
      }
      if (isSizeColorDriven && normalizedVariants.some((item) => !item.color)) {
        setError("Color is required.");
        return;
      }
      if (normalizedVariants.some((item) => item.sku.includes("-"))) {
        setError("SKU cannot contain hyphen.");
        return;
      }
      setError("Each variant requires SKU, Sale Price, Cost, and non-negative Opening Stock.");
      return;
    }
    const uniqueCount = new Set(normalizedVariants.map((item) => item.sku)).size;
    if (uniqueCount !== normalizedVariants.length) {
      setError("Variant SKUs must be unique within the product.");
      return;
    }
    const skuChecks = await Promise.all(
      Array.from(new Set(normalizedVariants.map((item) => item.sku))).map(async (sku) => {
        const params = new URLSearchParams({ sku });
        if (editingProductId) params.set("productId", editingProductId);
        const res = await fetch(`/api/products/sku/check?${params.toString()}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to validate SKU");
        return { sku, exists: Boolean(payload?.data?.exists) };
      }),
    );
    const conflict = skuChecks.find((item) => item.exists);
    if (conflict) {
      setError("SKU already exists.");
      return;
    }
    setSubmittingNew(true);
    setError(null);
    setNotice(null);
    try {
      const primaryVariant = newProductVariants[0];
      const nextCostPrice = primaryVariant?.cost?.trim() ? primaryVariant.cost : newProductForm.costPrice;
      const nextSalePrice = primaryVariant?.salePrice?.trim() ? primaryVariant.salePrice : newProductForm.salePrice;
      const res = await fetch(isEdit ? `/api/products/${editingProductId}` : "/api/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          ...newProductForm,
          costPrice: nextCostPrice || "0",
          salePrice: nextSalePrice || "0",
          categoryId: isEdit ? newProductForm.categoryId : "",
          variantSku: variantSkuOverrideValue,
          skuOverride: null,
          variants: newProductVariants.map((item) => ({
            id: item.variantId || undefined,
            sku:
              normalizeSkuValue(item.sku) ||
              buildVariantSkuPreview(
                normalizedSkuPrefix,
                item.width,
                item.height,
                item.color,
                newProductForm.glassFinishDefault,
              ),
            width: Number(item.width || 0),
            height: Number(item.height || 0),
            color: item.color?.trim() || null,
            salePrice: Number(item.salePrice || 0),
            cost: Number(item.cost || 0),
            openingStock: Number(item.openingStock || 0),
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? (isEdit ? "Failed to update product" : "Failed to add product"));

      setOpenNewDialog(false);
      setSkuPrefixCustomMode(false);
      setNewCategoryDraft("");
      setShowNewCategoryInput(false);
      setEditingProductId(null);
      setAddProductTab("GENERAL");
      setNewProductVariants([createEmptyVariantDraft()]);
      setNewProductForm((prev) => ({
        ...initialNewProductForm,
        warehouseId: prev.warehouseId || warehousesQuery.data?.[0]?.id || "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-custom-categories"] });
      if (isEdit && payload?.meta?.prefixChanged && Number(payload?.meta?.prefixRegeneratedCount ?? 0) > 0) {
        setNotice("SKU Prefix updated. Variant SKUs regenerated.");
      } else {
        setNotice(isEdit ? "Product updated successfully." : "Product created successfully.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSubmittingNew(false);
    }
  };

  const applyNewCustomCategory = () => {
    const normalized = newCategoryDraft.trim();
    if (!normalized) {
      setError("Please input a category name first.");
      return;
    }
    setError(null);
    setNewProductForm((prev) => ({
      ...prev,
      category: "OTHER",
      customCategoryName: normalized,
    }));
    setNewCategoryDraft("");
    setShowNewCategoryInput(false);
  };

  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setAddProductTab("GENERAL");
    setNewProductVariants(
      (product.variants ?? []).length > 0
        ? (product.variants ?? []).map((variant) => ({
            id: `variant-${variant.id}`,
            variantId: variant.id,
            width: variant.width != null ? String(variant.width) : "",
            height: variant.height != null ? String(variant.height) : "",
            color: variant.color ?? "",
            sku: variant.sku ?? "",
            salePrice: variant.price != null ? String(variant.price) : product.salePrice ?? "",
            cost: variant.cost != null ? String(variant.cost) : product.costPrice ?? "",
            openingStock: String(variant.onHand ?? 0),
          }))
        : [createEmptyVariantDraft()],
    );
    setSkuPrefixCustomMode(
      Boolean(product.skuPrefix && !SKU_PREFIX_OPTIONS.includes(normalizeSkuValue(product.skuPrefix) as (typeof SKU_PREFIX_OPTIONS)[number])),
    );
    setShowNewCategoryInput(false);
    setNewCategoryDraft("");
    setNewProductForm({
      name: product.name ?? "",
      barcode: product.barcode ?? "",
      specification: product.specification ?? "",
      category: product.category || "WINDOW",
      categoryId: product.categoryId ?? "",
      customCategoryName: product.customCategoryName ?? "",
      brand: product.brand ?? "",
      collection: product.collection ?? "",
      model: product.model ?? "",
      material: product.material ?? "",
      type: product.type ?? "",
      style: product.style ?? "",
      screenType: product.screenType ?? "",
      color: product.color ?? "",
      finish: product.finish ?? "",
      sizeW: product.sizeW ? String(product.sizeW) : "",
      sizeH: product.sizeH ? String(product.sizeH) : "",
      thicknessMm: product.thicknessMm ? String(product.thicknessMm) : "",
      glass: product.glass ?? "",
      glassTypeDefault: product.glassTypeDefault ?? "TEMPERED_LOW_E_5MM",
      glassFinishDefault: product.glassFinishDefault ?? "CLEAR",
      screenDefault: product.screenDefault ?? "",
      openingTypeDefault: product.openingTypeDefault ?? "",
      rating: product.rating ?? "",
      swing: product.swing ?? "",
      handing: product.handing ?? "",
      uom: product.uom ?? "",
      price: product.price ? String(product.price) : "",
      cost: product.cost ? String(product.cost) : "",
      title: product.title ?? "",
      titleOverride: Boolean(product.titleOverride),
      skuPrefix: product.skuPrefix ?? "",
      // Keep override empty by default; current variant SKU is shown in Effective SKU preview.
      variantSku: "",
      defaultDescription: product.defaultDescription ?? "",
      variantDescription: product.variants?.[0]?.description ?? "",
      notes: product.notes ?? "",
      unit: product.unit || "SQM",
      costPrice: product.costPrice ? String(product.costPrice) : "",
      salePrice: product.salePrice ? String(product.salePrice) : "",
      supplierId: product.supplierId ?? "",
      groupId: product.groupId ?? "",
      warehouseId: product.warehouseId ?? "",
    });
    setOpenNewDialog(true);
  };

  const runBatchGenerateSku = async () => {
    setSubmittingBatchSku(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/products/sku/batch-generate", {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to batch generate SKU");
      const summary = payload.data ?? {};
      setNotice(
        `Batch done: updated ${summary.updated ?? 0}, conflict ${summary.skippedConflict ?? 0}, no prefix ${summary.skippedNoPrefix ?? 0}, no size ${summary.skippedNoSize ?? 0}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to batch generate SKU");
    } finally {
      setSubmittingBatchSku(false);
    }
  };

  const openAdjustStock = (product: Product) => {
    const variants = product.variants ?? [];
    if (variants.length === 0) {
      setError("No product variant found. Please save product first.");
      return;
    }
    setError(null);
    setStockProduct(product);
    setStockVariantId(variants[0]?.id ?? "");
    setStockAdjustmentQty("");
    setOpenStockDialog(true);
  };

  const submitAdjustStock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockProduct) return;
    setSubmittingStock(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${stockProduct.id}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          variantId: stockVariantId,
          adjustmentQty: Number(stockAdjustmentQty),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to adjust stock");
      setOpenStockDialog(false);
      setStockProduct(null);
      setStockVariantId("");
      setStockAdjustmentQty("");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSubmittingStock(false);
    }
  };

  useEffect(() => {
    setNewProductForm((prev) => ({
      ...prev,
      title: prev.titleOverride ? prev.title : autoTitlePreview,
    }));
  }, [autoTitlePreview]);

  useEffect(() => {
    if (!openNewDialog) {
      setSkuConflict(false);
      setSkuChecking(false);
      return;
    }
    if (!hasVariantSkuOverride) {
      setSkuConflict(false);
      setSkuChecking(false);
      return;
    }

    let cancelled = false;
    setSkuChecking(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sku: effectiveSkuValue });
        if (editingProductId) params.set("productId", editingProductId);
        const res = await fetch(`/api/products/sku/check?${params.toString()}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to validate SKU");
        if (!cancelled) setSkuConflict(Boolean(payload?.data?.exists));
      } catch {
        if (!cancelled) setSkuConflict(false);
      } finally {
        if (!cancelled) setSkuChecking(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [effectiveSkuValue, editingProductId, hasVariantSkuOverride, openNewDialog, role]);

  useEffect(() => {
    if (!templatesQuery.data?.length) return;
    setNewProductForm((prev) => {
      if (prev.categoryId) return prev;
      const matched = templatesQuery.data.find((tpl) => tpl.categoryKey === prev.category);
      if (!matched) return prev;
      return { ...prev, categoryId: matched.id };
    });
  }, [templatesQuery.data]);

  useEffect(() => {
    if (!openNewDialog) return;
    if (newProductForm.warehouseId) return;
    const fallbackWarehouseId = warehousesQuery.data?.[0]?.id;
    if (!fallbackWarehouseId) return;
    setNewProductForm((prev) =>
      prev.warehouseId ? prev : { ...prev, warehouseId: fallbackWarehouseId },
    );
  }, [openNewDialog, newProductForm.warehouseId, warehousesQuery.data]);

  const uploadProductImage = async (productId: string, file: File) => {
    setUploadingImageId(productId);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/products/${productId}/gallery`, {
        method: "POST",
        headers: { "x-user-role": role },
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to upload product image");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload product image");
    } finally {
      setUploadingImageId(null);
    }
  };

  const createGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newGroupName.trim()) return;
    setSubmittingGroup(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDescription.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create group");
      setNewGroupName("");
      setNewGroupDescription("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-groups"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setSubmittingGroup(false);
    }
  };

  const startEditGroup = (group: InventoryGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setEditingGroupDescription(group.description ?? "");
  };

  const saveEditGroup = async () => {
    if (!editingGroupId || !editingGroupName.trim()) return;
    setSubmittingGroup(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory-groups/${editingGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          name: editingGroupName.trim(),
          description: editingGroupDescription.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update group");
      setEditingGroupId(null);
      setEditingGroupName("");
      setEditingGroupDescription("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group");
    } finally {
      setSubmittingGroup(false);
    }
  };

  const toggleSelectOne = (productId: string, checked: boolean) => {
    setSelectedProductIds((prev) =>
      checked ? Array.from(new Set([...prev, productId])) : prev.filter((id) => id !== productId),
    );
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedProductIds((prev) =>
        prev.filter((id) => !filteredRows.some((row) => row.id === id)),
      );
      return;
    }
    setSelectedProductIds((prev) =>
      Array.from(new Set([...prev, ...filteredRows.map((row) => row.id)])),
    );
  };

  const bulkAssignGroup = async () => {
    if (selectedProductIds.length === 0) {
      setError("Please select at least one product for bulk assign.");
      return;
    }
    setSubmittingBulkGroup(true);
    setError(null);
    try {
      const res = await fetch("/api/products/bulk-group", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          productIds: selectedProductIds,
          groupId: bulkGroupId === "UNASSIGNED" ? null : bulkGroupId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to bulk assign group");
      setSelectedProductIds([]);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-groups"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk assign group");
    } finally {
      setSubmittingBulkGroup(false);
    }
  };

  const deleteGroup = async (group: InventoryGroup) => {
    const ok = window.confirm(`Delete group "${group.name}"? Products in this group will be unassigned.`);
    if (!ok) return;
    setSubmittingGroup(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory-groups/${group.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete group");
      if (groupFilter === group.id) setGroupFilter("ALL");
      await queryClient.invalidateQueries({ queryKey: ["inventory-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
    } finally {
      setSubmittingGroup(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    const ok = window.confirm(`Delete product "${product.name}"? This cannot be undone.`);
    if (!ok) return;
    setDeletingProductId(product.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete product");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-custom-categories"] });
      setNotice("Product deleted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeletingProductId(null);
    }
  };

  useEffect(() => {
    setSelectedProductIds((prev) => prev.filter((id) => displayRows.some((row) => row.id === id)));
  }, [displayRows]);

  if (!mounted) {
    return (
      <section className="mx-auto max-w-[1320px]">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-sm text-slate-500">Loading product management...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1320px] space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Product Management</h1>
          <p className="text-sm text-slate-500">Enterprise product master, pricing, and stock visibility.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runBatchGenerateSku}
            disabled={submittingBatchSku}
            className="ios-secondary-btn inline-flex h-10 items-center justify-center gap-2 px-3 text-sm disabled:opacity-60"
          >
            {submittingBatchSku ? "Generating..." : "Batch Generate SKU"}
          </button>
          <button
            type="button"
            onClick={() => setOpenGroupDialog(true)}
            className="ios-secondary-btn inline-flex h-10 items-center justify-center gap-2 px-3 text-sm"
          >
            Manage Groups
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingProductId(null);
              setAddProductTab("GENERAL");
              setNewProductVariants([createEmptyVariantDraft()]);
              setSkuPrefixCustomMode(false);
              setShowNewCategoryInput(false);
              setNewCategoryDraft("");
              setNewProductForm((prev) => ({
                ...initialNewProductForm,
                warehouseId: prev.warehouseId || warehousesQuery.data?.[0]?.id || "",
              }));
              setOpenNewDialog(true);
            }}
            className="ios-primary-btn inline-flex h-10 items-center justify-center gap-2 px-4 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setCategory(item.value);
                  if (item.value !== "OTHER") setCustomCategoryFilter("ALL");
                }}
                className={`h-9 rounded-lg px-3 text-sm transition ${
                  category === item.value
                    ? "bg-slate-800 font-semibold text-white"
                    : "bg-slate-100 font-normal text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name / SKU / variant..."
            className="ios-input h-9 w-full md:w-72"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="ios-input h-9 min-w-[200px] bg-white px-3 text-sm"
          >
            <option value="ALL">All Groups</option>
            {(groupsQuery.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={customCategoryFilter}
            onChange={(e) => {
              const next = e.target.value;
              setCustomCategoryFilter(next);
              if (next !== "ALL") setCategory("OTHER");
            }}
            className="ios-input h-9 min-w-[220px] bg-white px-3 text-sm"
          >
            <option value="ALL">All Custom Categories</option>
            {customCategoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenColumnMenu((prev) => !prev)}
              className="ios-secondary-btn h-9 px-3 text-sm"
            >
              Optional Columns ({optionalColumnCount})
            </button>
            {openColumnMenu ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white p-2 shadow">
                {(
                  [
                    ["group", "Group"],
                    ["specification", "Specification"],
                    ["unit", "Unit"],
                    ["onHand", "On Hand"],
                    ["reserved", "Reserved"],
                    ["supplier", "Supplier"],
                    ["gallery", "Gallery"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showOptionalColumns[key]}
                      onChange={(e) =>
                        setShowOptionalColumns((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Selected: {selectedProductIds.length}</span>
          <select
            value={bulkGroupId}
            onChange={(e) => setBulkGroupId(e.target.value)}
            className="ios-input h-9 min-w-[210px] bg-white px-3 text-sm"
          >
            <option value="UNASSIGNED">Assign to: Unassigned</option>
            {(groupsQuery.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                Assign to: {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selectedProductIds.length === 0 || submittingBulkGroup}
            onClick={bulkAssignGroup}
            className="ios-primary-btn h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingBulkGroup ? "Applying..." : "Apply Group"}
          </button>
          <button
            type="button"
            disabled={selectedProductIds.length === 0}
            onClick={() => setSelectedProductIds([])}
            className="ios-secondary-btn h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <div className="hidden md:block">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-white">
                <TableRow className="bg-white shadow-[inset_0_-1px_0_0_#E5E7EB] hover:bg-white">
                  <TableHead className="w-12 bg-white">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      aria-label="Select all visible products"
                    />
                  </TableHead>
                  <TableHead className="bg-white">Product Name</TableHead>
                  <TableHead className="bg-white">Category</TableHead>
                  {showOptionalColumns.group ? <TableHead className="bg-white">Group</TableHead> : null}
                  {showOptionalColumns.specification ? <TableHead className="bg-white">Specification</TableHead> : null}
                  {showOptionalColumns.unit ? <TableHead className="bg-white">Unit</TableHead> : null}
                  <TableHead className="bg-white text-right">Variants</TableHead>
                  <TableHead className="bg-white text-right">Price Range</TableHead>
                  {showOptionalColumns.onHand ? <TableHead className="bg-white text-right">On Hand</TableHead> : null}
                  {showOptionalColumns.reserved ? <TableHead className="bg-white text-right">Reserved</TableHead> : null}
                  <TableHead className="bg-white text-right">Available</TableHead>
                  <TableHead className="bg-white">Warehouse</TableHead>
                  {showOptionalColumns.supplier ? <TableHead className="bg-white">Preferred Supplier</TableHead> : null}
                  {showOptionalColumns.gallery ? <TableHead className="bg-white">Gallery</TableHead> : null}
                  <TableHead className="bg-white text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7 + optionalColumnCount} className="text-center text-slate-500">
                      Loading product data...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7 + optionalColumnCount} className="text-center text-slate-500">
                      No products yet
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((product) => {
                    return (
                      <TableRow
                        id={`product-row-${product.id}`}
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        className={`group h-12 cursor-pointer border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50 transition-colors duration-150 hover:bg-slate-100/80 ${
                          highlightId === product.id ? "ring-2 ring-[#164E63]/30" : ""
                        }`}
                        onClick={() => {
                          router.push(`/products/${product.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            router.push(`/products/${product.id}`);
                          }
                        }}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(product.id)}
                            onChange={(e) => toggleSelectOne(product.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${product.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">{product.name}</TableCell>
                        <TableCell>{getCategoryLabel(product)}</TableCell>
                        {showOptionalColumns.group ? <TableCell>{product.group?.name ?? "-"}</TableCell> : null}
                        {showOptionalColumns.specification ? <TableCell>{product.specification || "-"}</TableCell> : null}
                        {showOptionalColumns.unit ? (
                          <TableCell>{UNIT_LABEL_MAP[product.unit] ?? product.unit}</TableCell>
                        ) : null}
                        <TableCell className="text-right font-semibold text-slate-900">
                          {Number(product.variantCount ?? product.variants?.length ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900">
                          {product.priceMin != null && product.priceMax != null
                            ? product.priceMin === product.priceMax
                              ? `$${Number(product.priceMin).toFixed(2)}`
                              : `$${Number(product.priceMin).toFixed(2)} - $${Number(product.priceMax).toFixed(2)}`
                            : role === "WAREHOUSE" || product.salePrice == null
                              ? "Spec Confirmed"
                              : `$${Number(product.salePrice).toFixed(2)}`}
                        </TableCell>
                        {showOptionalColumns.onHand ? (
                          <TableCell className="text-right">{Number(product.stockSummary?.onHand ?? 0).toFixed(2)}</TableCell>
                        ) : null}
                        {showOptionalColumns.reserved ? (
                          <TableCell className="text-right">
                            {Number(product.stockSummary?.reserved ?? 0).toFixed(2)}
                          </TableCell>
                        ) : null}
                        <TableCell
                          className={`text-right ${
                            Number(product.totalAvailable ?? product.stockSummary?.available ?? 0) <= 0
                              ? "font-semibold text-rose-600"
                              : "font-semibold text-emerald-700"
                          }`}
                        >
                          {Number(product.totalAvailable ?? product.stockSummary?.available ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell>{product.warehouse?.name ?? "-"}</TableCell>
                        {showOptionalColumns.supplier ? <TableCell>{product.supplier?.name ?? "-"}</TableCell> : null}
                        {showOptionalColumns.gallery ? (
                          <TableCell>
                          {product.category === "FLOOR" || product.category === "DOOR" ? (
                            <div className="flex items-center gap-2">
                              <ThumbImage src={product.galleryImageUrl ?? ""} alt={product.name} />
                              <label
                                className="ios-secondary-btn inline-flex h-10 cursor-pointer items-center px-3 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {uploadingImageId === product.id ? "Uploading..." : "Upload Image"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) uploadProductImage(product.id, file);
                                  }}
                                />
                              </label>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right group-hover:rounded-r-lg">
                          <div className="inline-flex w-full items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditProduct(product);
                              }}
                              className="ios-secondary-btn h-10 px-4 text-sm"
                            >
                              Edit
                            </button>
                            {role !== "SALES" ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAdjustStock(product);
                                }}
                                className="ios-secondary-btn h-10 px-4 text-sm"
                              >
                                Adjust Stock
                              </button>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`Delete ${product.name}`}
                              title="Delete product"
                              disabled={deletingProductId === product.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteProduct(product);
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 disabled:opacity-40"
                            >
                              {deletingProductId === product.id ? (
                                <span className="text-[11px] font-medium">...</span>
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                            <span
                              className="ml-1 inline-flex items-center text-slate-400 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                              aria-hidden="true"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2 p-3 md:hidden">
          {filteredRows.map((product) => {
            return (
              <article
                id={`product-row-${product.id}`}
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  router.push(`/products/${product.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    router.push(`/products/${product.id}`);
                  }
                }}
                className={`rounded-xl border border-slate-100 bg-white p-3 transition-colors duration-150 hover:bg-slate-50 ${
                  highlightId === product.id ? "ring-2 ring-[#164E63]/30" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{product.name}</h3>
                  <span className="text-xs text-slate-500">
                    {getCategoryLabel(product)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Variants: {Number(product.variantCount ?? product.variants?.length ?? 0)} · Price:{" "}
                  {product.priceMin != null && product.priceMax != null
                    ? product.priceMin === product.priceMax
                      ? `$${Number(product.priceMin).toFixed(2)}`
                      : `$${Number(product.priceMin).toFixed(2)} - $${Number(product.priceMax).toFixed(2)}`
                    : role === "WAREHOUSE" || product.salePrice == null
                      ? "Spec Confirmed"
                      : `$${Number(product.salePrice).toFixed(2)}`}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Stock: On Hand {Number(product.stockSummary?.onHand ?? 0).toFixed(2)} / Reserved{" "}
                  {Number(product.stockSummary?.reserved ?? 0).toFixed(2)} / Available{" "}
                  {Number(product.totalAvailable ?? product.stockSummary?.available ?? 0).toFixed(2)}
                </p>
                <p className="mt-1 text-sm text-slate-600">Warehouse: {product.warehouse?.name ?? "-"}</p>
                {showOptionalColumns.supplier ? (
                  <p className="mt-1 text-sm text-slate-600">Supplier: {product.supplier?.name ?? "-"}</p>
                ) : null}
                {(product.category === "FLOOR" || product.category === "DOOR") && (
                  <div className="mt-2 flex items-center gap-2">
                    <ThumbImage src={product.galleryImageUrl ?? ""} alt={product.name} />
                    <label className="ios-secondary-btn inline-flex h-10 cursor-pointer items-center px-3 text-xs">
                      {uploadingImageId === product.id ? "Uploading..." : "Upload Product Image"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) uploadProductImage(product.id, file);
                        }}
                      />
                    </label>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditProduct(product);
                      }}
                      className="ios-secondary-btn h-10 px-3 text-sm"
                    >
                      Edit
                    </button>
                    {role !== "SALES" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAdjustStock(product);
                        }}
                        className="ios-secondary-btn h-10 px-3 text-sm"
                      >
                        Adjust Stock
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Delete ${product.name}`}
                      title="Delete product"
                      disabled={deletingProductId === product.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteProduct(product);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    >
                      {deletingProductId === product.id ? (
                        <span className="text-[11px] font-medium">...</span>
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {openNewDialog ? (
        <Modal
          title={editingProductId ? "Edit Product" : "Add Product"}
          onClose={() => {
            setOpenNewDialog(false);
            setEditingProductId(null);
            setAddProductTab("GENERAL");
            setNewProductVariants([createEmptyVariantDraft()]);
            setSkuPrefixCustomMode(false);
          }}
          maxWidthClass="max-w-4xl"
        >
          <form className="space-y-5" onSubmit={onCreateProduct}>
            <p className="text-sm text-slate-500">
              {editingProductId
                ? "Update product details, pricing, stock baseline, and mappings."
                : "Build product and variants in a compact two-step flow."}
            </p>

            {true ? (
              <>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setAddProductTab("GENERAL")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      addProductTab === "GENERAL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddProductTab("VARIANTS")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      addProductTab === "VARIANTS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    Variants & Inventory
                  </button>
                </div>

                {addProductTab === "GENERAL" ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">General</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <InputField
                        label="Product Name"
                        value={newProductForm.name}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, name: value }))}
                        required
                      />
                      <div className="space-y-2">
                        <span className="text-sm text-slate-600">Category</span>
                        <select
                          value={customCategorySelectValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === ADD_NEW_CATEGORY_VALUE) {
                              setShowNewCategoryInput(true);
                              setNewCategoryDraft("");
                              setNewProductForm((prev) => ({
                                ...prev,
                                category: "OTHER",
                                customCategoryName: "",
                                categoryId: "",
                              }));
                              return;
                            }
                            if (value.startsWith("CUSTOM:")) {
                              const customName = value.slice("CUSTOM:".length).trim();
                              setShowNewCategoryInput(false);
                              setNewProductForm((prev) => ({
                                ...prev,
                                category: "OTHER",
                                categoryId: "",
                                customCategoryName: customName,
                              }));
                              return;
                            }
                            setShowNewCategoryInput(false);
                            setNewProductForm((prev) => ({
                              ...prev,
                              category: value,
                              categoryId: "",
                              customCategoryName: "",
                            }));
                          }}
                          className="ios-input h-12 w-full bg-white px-3 text-sm"
                        >
                          {(templatesQuery.data ?? []).map((item) => (
                            <option key={item.id} value={item.categoryKey}>
                              {item.categoryLabel}
                            </option>
                          ))}
                          {effectiveCustomCategoryOptions.map((item) => (
                            <option key={item} value={`CUSTOM:${item}`}>
                              {item}
                            </option>
                          ))}
                          <option value={ADD_NEW_CATEGORY_VALUE}>+ Add New Category...</option>
                        </select>
                        {(showNewCategoryInput ||
                          (newProductForm.category === "OTHER" && !newProductForm.customCategoryName?.trim())) ? (
                          <div className="flex gap-2">
                            <input
                              value={newCategoryDraft}
                              onChange={(event) => setNewCategoryDraft(event.target.value)}
                              placeholder="e.g. Hardware"
                              className="ios-input h-10 w-full px-3 text-sm"
                            />
                            <button
                              type="button"
                              onClick={applyNewCustomCategory}
                              className="ios-secondary-btn h-10 px-3 text-xs"
                            >
                              Add
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <SelectField
                        label="Unit"
                        value={newProductForm.unit}
                        options={UNIT_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, unit: value }))}
                      />
                      <div className="space-y-1">
                        <InputField
                          label={`SKU Prefix${newProductForm.category === "WINDOW" ? " *" : ""}`}
                          value={newProductForm.skuPrefix}
                          onChange={(value) =>
                            setNewProductForm((prev) => ({ ...prev, skuPrefix: normalizeSkuValue(value) }))
                          }
                          placeholder="VWW"
                          required={newProductForm.category === "WINDOW"}
                        />
                        <p className="text-xs text-slate-500">
                          Used to auto-generate variant SKU. Example: VWW3636B. No hyphen.
                        </p>
                      </div>
                      <SelectField
                        label="Preferred Supplier (Optional)"
                        value={newProductForm.supplierId}
                        options={[
                          { label: "Not Set", value: "" },
                          ...(suppliersQuery.data ?? []).map((item) => ({
                            label: `${item.name} (${item.category})`,
                            value: item.id,
                          })),
                        ]}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, supplierId: value }))}
                      />
                      <InputField
                        label="Glass Choice (Legacy)"
                        value={newProductForm.glass}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, glass: value }))}
                        placeholder="e.g. Tempered / Laminated / Low-E"
                      />
                      <SelectField
                        label="Glass Type Default"
                        value={newProductForm.glassTypeDefault}
                        options={[
                          { label: "Tempered Low-E 5mm", value: "TEMPERED_LOW_E_5MM" },
                          { label: "Tempered Low-E 5mm Frosted", value: "TEMPERED_LOW_E_5MM_FROSTED" },
                          { label: "Tempered Clear 5mm", value: "TEMPERED_CLEAR_5MM" },
                          { label: "Other", value: "OTHER" },
                        ]}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, glassTypeDefault: value }))}
                      />
                      <SelectField
                        label="Glass Finish Default"
                        value={newProductForm.glassFinishDefault}
                        options={[
                          { label: "Clear", value: "CLEAR" },
                          { label: "Frosted", value: "FROSTED" },
                        ]}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, glassFinishDefault: value }))}
                      />
                      <InputField
                        label="Screen Default"
                        value={newProductForm.screenDefault}
                        onChange={(value) =>
                          setNewProductForm((prev) => ({ ...prev, screenDefault: value, screenType: value }))
                        }
                        placeholder="e.g. Full Screen / Half Screen / No Screen"
                      />
                      <SelectField
                        label="Opening Type"
                        value={newProductForm.openingTypeDefault}
                        options={[
                          { label: "Not Set", value: "" },
                          ...(isWindowCategory
                            ? [
                                { label: "Fixed", value: "FIXED" },
                                { label: "Sliding", value: "SLIDING" },
                                { label: "Single Hung", value: "SINGLE_HUNG" },
                                { label: "Double Hung", value: "DOUBLE_HUNG" },
                                { label: "Casement", value: "CASEMENT" },
                                { label: "Awning", value: "AWNING" },
                              ]
                            : [
                                { label: "Sliding", value: "SLIDING" },
                                { label: "Single Swing", value: "SINGLE_SWING" },
                                { label: "Double Swing", value: "DOUBLE_SWING" },
                              ]),
                        ]}
                        onChange={(value) =>
                          setNewProductForm((prev) => ({
                            ...prev,
                            openingTypeDefault: value,
                            swing: value,
                            type: isWindowCategory ? value : prev.type,
                            handing: String(value ?? "").trim().toUpperCase() === "SLIDING" ? prev.handing : "",
                          }))
                        }
                      />
                      {isWindowCategory && isSlidingOpeningType ? (
                        <SelectField
                          label="Sliding Configuration"
                          value={newProductForm.handing}
                          options={[
                            { label: "Not Set", value: "" },
                            { label: "XO", value: "XO" },
                            { label: "OX", value: "OX" },
                            { label: "XOX", value: "XOX" },
                            { label: "OXO", value: "OXO" },
                            { label: "XXO", value: "XXO" },
                            { label: "OXX", value: "OXX" },
                          ]}
                          onChange={(value) =>
                            setNewProductForm((prev) => ({
                              ...prev,
                              handing: value,
                              openingTypeDefault: prev.openingTypeDefault || "SLIDING",
                            }))
                          }
                        />
                      ) : null}
                      <TextareaField
                        label="Default Description"
                        value={newProductForm.defaultDescription}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, defaultDescription: value }))}
                        rows={3}
                        placeholder="Used when variant-level description is empty."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">Variants & Inventory</h4>
                      <div className="inline-flex items-center gap-2">
                        <button type="button" onClick={bulkAddVariantRows} className="ios-secondary-btn h-9 px-3 text-xs">
                          Bulk Add 3
                        </button>
                        <button type="button" onClick={addVariantRow} className="ios-primary-btn h-9 px-3 text-xs">
                          Add Variant
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-600">Variant Title</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600">Size (WxH)</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600">Color</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-600">SKU</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-600">Sale Price</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-600">Cost</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-600">Opening Stock</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-600">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newProductVariants.map((variant, index) => {
                            const w = toSkuDimensionPart(variant.width);
                            const h = toSkuDimensionPart(variant.height);
                            const sizeLabel = w && h ? `${w}"x${h}"` : "";
                            const colorLabel = variant.color.trim();
                            const autoVariantTitle = `${newProductForm.name.trim() || "Product"}${
                              sizeLabel ? `-${sizeLabel}` : ""
                            }${colorLabel ? `(${colorLabel})` : ""}`;
                            const skuPreview = buildVariantSkuPreview(
                              normalizeSkuValue(newProductForm.skuPrefix),
                              variant.width,
                              variant.height,
                              variant.color,
                              newProductForm.glassFinishDefault,
                            );
                            return (
                              <tr key={variant.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">
                                  <p className="text-sm">{autoVariantTitle || `Variant ${index + 1}`}</p>
                                  <p className="text-xs text-slate-500">SKU preview: {skuPreview || "-"}</p>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={variant.width}
                                      onChange={(event) => updateVariantRow(variant.id, { width: event.target.value })}
                                      className="ios-input h-9 w-20 px-2 text-right text-sm"
                                      placeholder="36"
                                    />
                                    <span className="text-xs text-slate-500">x</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={variant.height}
                                      onChange={(event) => updateVariantRow(variant.id, { height: event.target.value })}
                                      className="ios-input h-9 w-20 px-2 text-right text-sm"
                                      placeholder="36"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={variant.color}
                                    onChange={(event) => updateVariantRow(variant.id, { color: event.target.value })}
                                    placeholder={newProductForm.category === "WINDOW" ? "Required" : "Optional"}
                                    className="ios-input h-9 w-32 px-2 text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={variant.sku}
                                    onChange={(event) =>
                                      updateVariantRow(variant.id, { sku: normalizeSkuValue(event.target.value) })
                                    }
                                    onBlur={() => {
                                      if (variant.sku.trim()) return;
                                      if (!skuPreview) return;
                                      updateVariantRow(variant.id, { sku: skuPreview });
                                    }}
                                    placeholder={skuPreview || "e.g. VWW3636W"}
                                    className="ios-input h-9 w-full px-2 text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.salePrice}
                                    onChange={(event) => updateVariantRow(variant.id, { salePrice: event.target.value })}
                                    className="ios-input h-9 w-28 px-2 text-right text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.cost}
                                    onChange={(event) => updateVariantRow(variant.id, { cost: event.target.value })}
                                    className="ios-input h-9 w-28 px-2 text-right text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.openingStock}
                                    onChange={(event) => updateVariantRow(variant.id, { openingStock: event.target.value })}
                                    className="ios-input h-9 w-28 px-2 text-right text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => deleteVariantRow(variant.id)}
                                    className="text-xs text-slate-500 hover:text-rose-600"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Basic Information</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <InputField
                  label="Product Name"
                  value={newProductForm.name}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, name: value }))}
                  required
                />
                <InputField
                  label="Barcode / QR Value"
                  value={newProductForm.barcode}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, barcode: value }))}
                  placeholder="Used for quick scan lookup"
                />
                <InputField
                  label="Specification"
                  value={newProductForm.specification}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, specification: value }))}
                  placeholder="e.g. 48 x 96 in"
                />
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">Category</span>
                  <select
                    value={customCategorySelectValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === ADD_NEW_CATEGORY_VALUE) {
                        setShowNewCategoryInput(true);
                        setNewCategoryDraft("");
                        setNewProductForm((prev) => ({
                          ...prev,
                          category: "OTHER",
                          customCategoryName: "",
                        }));
                        return;
                      }
                      if (value.startsWith("CUSTOM:")) {
                        const customName = value.slice("CUSTOM:".length).trim();
                        setShowNewCategoryInput(false);
                        setNewProductForm((prev) => ({
                          ...prev,
                          category: "OTHER",
                          categoryId: selectedTemplate?.id ?? prev.categoryId,
                          customCategoryName: customName,
                        }));
                        return;
                      }
                      const tpl = (templatesQuery.data ?? []).find((item) => item.categoryKey === value);
                      setShowNewCategoryInput(false);
                      setNewProductForm((prev) => ({
                        ...prev,
                        category: value,
                        categoryId: tpl?.id ?? "",
                        customCategoryName: "",
                      }));
                    }}
                    className="ios-input h-12 w-full bg-white px-3 text-sm"
                  >
                    {(templatesQuery.data ?? []).map((item) => (
                      <option key={item.id} value={item.categoryKey}>
                        {item.categoryLabel}
                      </option>
                    ))}
                    {effectiveCustomCategoryOptions.map((item) => (
                      <option key={item} value={`CUSTOM:${item}`}>
                        {item}
                      </option>
                    ))}
                    <option value={ADD_NEW_CATEGORY_VALUE}>+ Add New Category...</option>
                  </select>
                  {(showNewCategoryInput ||
                    (newProductForm.category === "OTHER" && !newProductForm.customCategoryName?.trim())) ? (
                    <div className="flex gap-2">
                      <input
                        value={newCategoryDraft}
                        onChange={(event) => setNewCategoryDraft(event.target.value)}
                        placeholder="e.g. Hardware"
                        className="ios-input h-10 w-full px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={applyNewCustomCategory}
                        className="ios-secondary-btn h-10 px-3 text-xs"
                      >
                        Add
                      </button>
                    </div>
                  ) : null}
                  {newProductForm.category === "OTHER" && newProductForm.customCategoryName?.trim() ? (
                    <p className="text-xs text-slate-500">Selected custom category: {newProductForm.customCategoryName}</p>
                  ) : null}
                </div>
                {selectedTemplate ? (
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3 md:col-span-2">
                    <p className="text-xs font-medium text-slate-600">Template-driven attributes</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(selectedTemplate?.fieldOrder ?? []).map((field) => {
                        const meta = TEMPLATE_FIELD_META[field];
                        if (!meta) return null;
                        const key = templateFieldToFormKey(field);
                        const required = selectedTemplate?.requiredFields.includes(field) ?? false;
                        return (
                          <InputField
                            key={field}
                            label={`${meta.label}${required ? " *" : ""}`}
                            type={meta.type ?? "text"}
                            min={meta.min}
                            step={meta.step}
                            value={String(newProductForm[key] ?? "")}
                            placeholder={meta.placeholder}
                            onChange={(value) => setNewProductForm((prev) => ({ ...prev, [key]: value }))}
                            required={required}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3 md:col-span-2">
                  <p className="text-xs font-medium text-slate-600">Smart title preview</p>
                  <div className="grid gap-3 md:grid-cols-1">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Title</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewProductForm((prev) => ({
                              ...prev,
                              titleOverride: false,
                              title: autoTitlePreview,
                            }))
                          }
                          className="ios-secondary-btn h-8 px-2 text-xs"
                        >
                          Reset to Auto
                        </button>
                      </div>
                      <input
                        value={newProductForm.title}
                        onChange={(event) =>
                          setNewProductForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                            titleOverride: true,
                          }))
                        }
                        placeholder={autoTitlePreview || "Auto title will appear here"}
                        className="ios-input h-10 w-full px-3 text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3 md:col-span-2">
                  <p className="text-xs font-medium text-slate-600">Variant SKU (No Hyphen)</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-sm text-slate-600">SKU Prefix (optional)</span>
                      <select
                        value={skuPrefixSelectValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === CUSTOM_SKU_PREFIX_VALUE) {
                            setSkuPrefixCustomMode(true);
                            setNewProductForm((prev) => ({ ...prev, skuPrefix: "" }));
                            return;
                          }
                          setSkuPrefixCustomMode(false);
                          setNewProductForm((prev) => ({ ...prev, skuPrefix: normalizeSkuValue(value) }));
                        }}
                        className="ios-input h-12 w-full bg-white px-3 text-sm"
                      >
                        <option value="">Not Set</option>
                        {SKU_PREFIX_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                        <option value={CUSTOM_SKU_PREFIX_VALUE}>Custom Prefix...</option>
                      </select>
                    </label>
                    <InputField
                      label="Variant SKU Override (optional)"
                      value={newProductForm.variantSku}
                      onChange={(value) =>
                        setNewProductForm((prev) => ({
                          ...prev,
                          variantSku: normalizeSkuValue(value),
                        }))
                      }
                      placeholder="Leave empty to auto-generate"
                    />
                  </div>
                  {skuPrefixCustomMode ? (
                    <InputField
                      label="Custom SKU Prefix"
                      value={newProductForm.skuPrefix}
                      onChange={(value) =>
                        setNewProductForm((prev) => ({
                          ...prev,
                          skuPrefix: normalizeSkuValue(value),
                        }))
                      }
                      placeholder="e.g. VWW"
                    />
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Auto SKU Preview: <span className="font-semibold text-slate-700">{autoSkuPreview || "-"}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Effective SKU: <span className="font-semibold text-slate-700">{effectiveSkuValue || "-"}</span>
                  </p>
                  <p className={`text-xs ${skuConflict ? "text-rose-600" : "text-emerald-700"}`}>
                    {skuChecking
                      ? "Checking SKU uniqueness..."
                      : skuConflict
                        ? "SKU already exists. Please change prefix/size or override."
                        : "SKU is available."}
                  </p>
                  <TextareaField
                    label="Variant Description (for order/PDF)"
                    value={newProductForm.variantDescription}
                    onChange={(value) => setNewProductForm((prev) => ({ ...prev, variantDescription: value }))}
                    rows={3}
                    placeholder="Shown on sales order/invoice line when this variant is selected."
                  />
                </div>
                <SelectField
                  label="Unit"
                  value={newProductForm.unit}
                  options={UNIT_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, unit: value }))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Pricing</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <InputField
                  label="Cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProductForm.costPrice}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, costPrice: value }))}
                  required
                />
                <InputField
                  label="Sale Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProductForm.salePrice}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, salePrice: value }))}
                  required
                />
                <InputField
                  label="Template Price (optional)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProductForm.price}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, price: value }))}
                />
                <InputField
                  label="Template Cost (optional)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProductForm.cost}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, cost: value }))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Warehouse & Linking</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SelectField
                  label="Warehouse"
                  value={newProductForm.warehouseId}
                  options={(warehousesQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, warehouseId: value }))}
                />
                <SelectField
                  label="Preferred Supplier"
                  value={newProductForm.supplierId}
                  options={[
                    { label: "Not Set", value: "" },
                    ...(suppliersQuery.data ?? []).map((item) => ({
                      label: `${item.name} (${item.category})`,
                      value: item.id,
                    })),
                  ]}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, supplierId: value }))}
                />
                <SelectField
                  label="Inventory Group"
                  value={newProductForm.groupId}
                  options={[
                    { label: "Unassigned", value: "" },
                    ...(groupsQuery.data ?? []).map((item) => ({
                      label: item.name,
                      value: item.id,
                    })),
                  ]}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, groupId: value }))}
                />
                <InputField
                  label="UOM (optional)"
                  value={newProductForm.uom}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, uom: value }))}
                  placeholder="e.g. set / sqft / piece"
                />
                <InputField
                  label="Notes (optional)"
                  value={newProductForm.notes}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, notes: value }))}
                />
                <TextareaField
                  label="Default Description"
                  value={newProductForm.defaultDescription}
                  onChange={(value) => setNewProductForm((prev) => ({ ...prev, defaultDescription: value }))}
                  rows={3}
                  placeholder="Used when variant description is empty."
                />
              </div>
            </div>
              </>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpenNewDialog(false);
                  setAddProductTab("GENERAL");
                  setNewProductVariants([createEmptyVariantDraft()]);
                  setSkuPrefixCustomMode(false);
                }}
                className="ios-secondary-btn h-11 px-5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingNew}
                className="ios-primary-btn h-11 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingNew ? "Submitting..." : editingProductId ? "Save Product" : "Create Product"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {openStockDialog && stockProduct ? (
        <Modal
          title={`Adjust Stock · ${stockProduct.name}`}
          onClose={() => {
            setOpenStockDialog(false);
            setStockProduct(null);
          }}
        >
          <form className="space-y-4" onSubmit={submitAdjustStock}>
            <p className="text-sm text-slate-500">
              Use a positive number to stock in, negative number to stock out.
            </p>
            <SelectField
              label="Variant"
              value={stockVariantId}
              options={(stockProduct.variants ?? []).map((item) => ({
                value: item.id,
                label: `${item.sku} · Available ${Number(item.available).toFixed(2)}`,
              }))}
              onChange={setStockVariantId}
            />
            <InputField
              label="Adjustment Qty (+/-)"
              type="number"
              step="0.01"
              value={stockAdjustmentQty}
              onChange={setStockAdjustmentQty}
              required
            />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpenStockDialog(false)} className="ios-secondary-btn h-10 flex-1">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingStock}
                className="ios-primary-btn h-10 flex-1 disabled:opacity-60"
              >
                {submittingStock ? "Saving..." : "Save Stock"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {openGroupDialog ? (
        <Modal title="Manage Inventory Groups" onClose={() => setOpenGroupDialog(false)}>
          <form className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3" onSubmit={createGroup}>
            <InputField
              label="Group Name"
              value={newGroupName}
              onChange={setNewGroupName}
              required
            />
            <InputField
              label="Description (Optional)"
              value={newGroupDescription}
              onChange={setNewGroupDescription}
            />
            <button
              type="submit"
              disabled={submittingGroup}
              className="ios-primary-btn h-10 w-full text-sm disabled:opacity-60"
            >
              Add Group
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {(groupsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No groups yet.</p>
            ) : (
              (groupsQuery.data ?? []).map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-100 p-3">
                  {editingGroupId === group.id ? (
                    <div className="space-y-2">
                      <InputField label="Group Name" value={editingGroupName} onChange={setEditingGroupName} />
                      <InputField
                        label="Description"
                        value={editingGroupDescription}
                        onChange={setEditingGroupDescription}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEditGroup}
                          disabled={submittingGroup}
                          className="ios-primary-btn h-9 flex-1 text-xs disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="ios-secondary-btn h-9 flex-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                        <p className="text-xs text-slate-500">{group.description || "-"}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Products: {group._count?.products ?? 0}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditGroup(group)}
                          className="ios-secondary-btn h-8 px-2 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGroup(group)}
                          disabled={submittingGroup}
                          className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Modal>
      ) : null}

    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
  maxWidthClass = "max-w-md",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-lg border border-slate-200/80 bg-white p-6 shadow-md ${maxWidthClass}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={min}
        step={step}
        className="ios-input h-12 w-full px-3 text-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="ios-input h-12 w-full bg-white px-3 text-sm"
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function ThumbImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  if (!src) {
    return <div className="h-10 w-10 rounded-lg bg-slate-100" />;
  }
  return (
    <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-100">
      {!loaded ? <div className="absolute inset-0 animate-pulse bg-slate-200/70" /> : null}
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
