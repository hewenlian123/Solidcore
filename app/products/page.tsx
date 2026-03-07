"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { useRole } from "@/components/layout/role-provider";
import { FlooringSpecs } from "@/components/product/templates/FlooringSpecs";
import { WindowSpecs } from "@/components/product/templates/WindowSpecs";
import { renderTemplateSku } from "@/lib/product-template-engine";
import { formatQuantityWithUnit } from "@/lib/quantity-format";
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
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

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
  displayName?: string | null;
  skuSuffix?: string | null;
  description?: string | null;
  cost?: number | null;
  price?: number | null;
  width?: number | null;
  height?: number | null;
  color?: string | null;
  reorderLevel?: number;
  reorderQty?: number;
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
  frameMaterialDefault?: string | null;
  slidingConfigDefault?: string | null;
  glassTypeDefault?: string | null;
  glassCoatingDefault?: string | null;
  glassThicknessMmDefault?: number | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
  openingTypeDefault?: string | null;
  flooringBrand?: string | null;
  flooringSeries?: string | null;
  flooringMaterial?: string | null;
  flooringWearLayer?: string | null;
  flooringThicknessMm?: number | null;
  flooringPlankLengthIn?: number | null;
  flooringPlankWidthIn?: number | null;
  flooringCoreThicknessMm?: number | null;
  flooringFinish?: string | null;
  flooringEdge?: string | null;
  flooringInstallation?: string | null;
  flooringUnderlayment?: string | null;
  flooringUnderlaymentType?: string | null;
  flooringUnderlaymentMm?: number | null;
  flooringWaterproof?: boolean | null;
  flooringWaterResistance?: string | null;
  flooringWarrantyResidentialYr?: number | null;
  flooringWarrantyCommercialYr?: number | null;
  flooringPiecesPerBox?: number | null;
  flooringBoxCoverageSqft?: number | null;
  flooringLowStockThreshold?: number | null;
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
  hasLowStock?: boolean;
  lowStockVariantCount?: number;
};

type FilterCategory = "ALL" | (typeof CATEGORY_OPTIONS)[number]["value"];

type ImportFieldKey =
  | "sku"
  | "name"
  | "description"
  | "category"
  | "unit"
  | "salePrice"
  | "costPrice"
  | "onHand"
  | "reorderLevel"
  | "width"
  | "height"
  | "color"
  | "warehouseName"
  | "supplierName";

const IMPORT_FIELDS: Array<{ key: ImportFieldKey; label: string; required?: boolean }> = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Product Name", required: true },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "salePrice", label: "Sale Price" },
  { key: "costPrice", label: "Cost Price" },
  { key: "onHand", label: "On Hand" },
  { key: "reorderLevel", label: "Reorder Level" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
  { key: "color", label: "Color" },
  { key: "warehouseName", label: "Warehouse Name" },
  { key: "supplierName", label: "Supplier Name" },
];

function guessImportMapping(columns: string[]) {
  const normalizedEntries = columns.map((column) => ({
    raw: column,
    key: String(column).trim().toLowerCase().replace(/[\s_()-]+/g, ""),
  }));
  const aliases: Record<ImportFieldKey, string[]> = {
    sku: ["sku", "productsku", "variantsku", "itemsku"],
    name: ["name", "productname", "title"],
    description: ["description", "desc", "defaultdescription"],
    category: ["category", "productcategory"],
    unit: ["unit", "uom", "sellingunit"],
    salePrice: ["saleprice", "price", "unitprice"],
    costPrice: ["costprice", "cost", "unitcost"],
    onHand: ["onhand", "stock", "openingstock", "qty", "quantity"],
    reorderLevel: ["reorderlevel", "minstock", "reorder"],
    width: ["width", "w"],
    height: ["height", "h"],
    color: ["color", "colour"],
    warehouseName: ["warehouse", "warehousename"],
    supplierName: ["supplier", "suppliername"],
  };
  const mapping = {} as Record<ImportFieldKey, string>;
  for (const field of IMPORT_FIELDS) {
    const targetAliases = aliases[field.key];
    const hit = normalizedEntries.find((entry) => targetAliases.includes(entry.key));
    if (hit) mapping[field.key] = hit.raw;
  }
  return mapping;
}

const FILTERS: { label: string; value: FilterCategory }[] = [
  { label: "All", value: "ALL" },
  { label: "Windows", value: "WINDOW" },
  { label: "Flooring", value: "FLOOR" },
  { label: "Mirrors", value: "MIRROR" },
  { label: "Doors", value: "DOOR" },
  { label: "Warehouse Supplies", value: "WAREHOUSE_SUPPLY" },
];
const BULK_CATEGORY_OPTIONS = [
  "Flooring",
  "Floor Accessories",
  "LED Mirror",
  "Mirror",
  "Tile Finish Edge",
  "Bathroom Shower Glass Door",
  "Windows",
  "Shampoo Niche",
  "Other",
] as const;
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

function extractValidationWarnings(payload: any): string[] {
  const warningsRaw = payload?.meta?.validationWarnings;
  if (!Array.isArray(warningsRaw)) return [];
  return warningsRaw
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
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
  frameMaterialDefault: "",
  openingTypeDefault: "",
  slidingConfigDefault: "",
  glassTypeDefault: "",
  glassCoatingDefault: "",
  glassThicknessMmDefault: "",
  glassFinishDefault: "",
  screenDefault: "",
  flooringBrand: "",
  flooringSeries: "",
  flooringMaterial: "LVP",
  flooringWearLayer: "",
  flooringThicknessMm: "",
  flooringPlankLengthIn: "",
  flooringPlankWidthIn: "",
  flooringCoreThicknessMm: "",
  flooringFinish: "",
  flooringEdge: "",
  flooringInstallation: "",
  flooringUnderlayment: "",
  flooringUnderlaymentType: "",
  flooringUnderlaymentMm: "",
  flooringWaterproof: "",
  flooringWaterResistance: "",
  flooringWarrantyResidentialYr: "",
  flooringWarrantyCommercialYr: "",
  flooringPiecesPerBox: "",
  flooringBoxCoverageSqft: "",
  flooringLowStockThreshold: "",
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

const TEMPLATE_SPEC_KEYS = [
  "frameMaterialDefault",
  "openingTypeDefault",
  "slidingConfigDefault",
  "glassTypeDefault",
  "glassCoatingDefault",
  "glassThicknessMmDefault",
  "glassFinishDefault",
  "screenDefault",
  "flooringBrand",
  "flooringSeries",
  "flooringMaterial",
  "flooringWearLayer",
  "flooringThicknessMm",
  "flooringPlankLengthIn",
  "flooringPlankWidthIn",
  "flooringCoreThicknessMm",
  "flooringFinish",
  "flooringEdge",
  "flooringInstallation",
  "flooringUnderlayment",
  "flooringUnderlaymentType",
  "flooringUnderlaymentMm",
  "flooringWaterproof",
  "flooringWaterResistance",
  "flooringWarrantyResidentialYr",
  "flooringWarrantyCommercialYr",
  "flooringPiecesPerBox",
  "flooringBoxCoverageSqft",
  "flooringLowStockThreshold",
] as const;

function hasTemplateSpecData(form: typeof initialNewProductForm) {
  return TEMPLATE_SPEC_KEYS.some((key) => String(form[key] ?? "").trim().length > 0);
}

function clearTemplateSpecFields(form: typeof initialNewProductForm) {
  const next = { ...form };
  for (const key of TEMPLATE_SPEC_KEYS) {
    next[key] = "";
  }
  return next;
}

function getTemplateKind(category: string) {
  if (category === "WINDOW") return "WINDOW";
  if (category === "FLOOR") return "FLOOR";
  return null;
}

type NewVariantDraft = {
  id: string;
  variantId?: string;
  displayName: string;
  skuSuffix: string;
  width: string;
  height: string;
  color: string;
  sku: string;
  salePrice: string;
  cost: string;
  openingStock: string;
  reorderLevel: string;
  reservedBoxes: number;
};

let newVariantDraftCounter = 0;

const createEmptyVariantDraft = (): NewVariantDraft => ({
  id: `variant-draft-${++newVariantDraftCounter}`,
  displayName: "",
  skuSuffix: "",
  width: "",
  height: "",
  color: "",
  sku: "",
  salePrice: "",
  cost: "",
  openingStock: "0",
  reorderLevel: "0",
  reservedBoxes: 0,
});

function getStockAlertState(available: number, reorderLevel: number) {
  if (reorderLevel <= 0) return null;
  if (available <= reorderLevel) return "LOW" as const;
  if (available <= Math.ceil(reorderLevel * 1.5)) return "WARNING" as const;
  return null;
}

function formatStockByProductUnit(value: number, unit: string | null | undefined) {
  const rawUnit = UNIT_LABEL_MAP[String(unit ?? "").toUpperCase()] ?? unit;
  return formatQuantityWithUnit(value, rawUnit);
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<FilterCategory>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importParsing, setImportParsing] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importRowsRaw, setImportRowsRaw] = useState<Array<Record<string, unknown>>>([]);
  const [importMapping, setImportMapping] = useState<Partial<Record<ImportFieldKey, string>>>({});
  const [importErrors, setImportErrors] = useState<Array<{ row: number; sku: string; error: string }>>([]);
  const [importWarnings, setImportWarnings] = useState<Array<{ row: number; sku: string; warning: string }>>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [openNewDialog, setOpenNewDialog] = useState(false);
  const [addProductTab, setAddProductTab] = useState<"GENERAL" | "VARIANTS">("GENERAL");
  const [newProductForm, setNewProductForm] = useState(initialNewProductForm);
  const [newProductVariants, setNewProductVariants] = useState<NewVariantDraft[]>([
    createEmptyVariantDraft(),
  ]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [seriesSpecErrors, setSeriesSpecErrors] = useState<Record<string, string>>({});
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
  const [openAdvancedFilters, setOpenAdvancedFilters] = useState(false);
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
  const [bulkCategory, setBulkCategory] = useState<string>("Other");
  const [submittingBulkGroup, setSubmittingBulkGroup] = useState(false);

  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const variantsScrollRef = useRef<HTMLDivElement | null>(null);
  const [showVariantsScrollHint, setShowVariantsScrollHint] = useState(false);
  const [pendingCategoryChange, setPendingCategoryChange] = useState<{
    category: string;
    categoryId: string;
    customCategoryName: string;
    showNewCategoryInput: boolean;
    resetNewCategoryDraft: boolean;
  } | null>(null);
  const lowStockOnly =
    searchParams?.get("lowStockOnly") === "true" || searchParams?.get("filter") === "low";

  const setLowStockFilter = (mode: "all" | "low") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (mode === "low") {
      params.set("lowStockOnly", "true");
      params.set("filter", "low");
    } else {
      params.delete("lowStockOnly");
      params.delete("filter");
    }
    const query = params.toString();
    router.push(query ? `/products?${query}` : "/products");
  };

  useEffect(() => {
    const raw = String(searchParams?.get("category") ?? "")
      .trim()
      .toUpperCase();
    if (!raw) return;
    const allowed = new Set(FILTERS.map((item) => item.value));
    if (allowed.has(raw as FilterCategory)) {
      setCategory(raw as FilterCategory);
    }
  }, [searchParams]);

  const clearCategoryFilterParam = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("category");
    const query = params.toString();
    setCategory("ALL");
    router.push(query ? `/products?${query}` : "/products");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("products:advanced-filters-open");
    if (saved === "1") setOpenAdvancedFilters(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("products:advanced-filters-open", openAdvancedFilters ? "1" : "0");
  }, [openAdvancedFilters]);

  useEffect(() => {
    const container = variantsScrollRef.current;
    if (!openNewDialog || addProductTab !== "VARIANTS" || !container) {
      setShowVariantsScrollHint(false);
      return;
    }
    const updateScrollHint = () => {
      const canScrollX = container.scrollWidth - container.clientWidth > 8;
      const atStart = container.scrollLeft <= 4;
      setShowVariantsScrollHint(canScrollX && atStart);
    };
    updateScrollHint();
    container.addEventListener("scroll", updateScrollHint, { passive: true });
    window.addEventListener("resize", updateScrollHint);
    return () => {
      container.removeEventListener("scroll", updateScrollHint);
      window.removeEventListener("resize", updateScrollHint);
    };
  }, [openNewDialog, addProductTab, newProductVariants.length]);

  const productsQuery = useQuery({
    queryKey: ["products", role, category, groupFilter, customCategoryFilter, lowStockOnly],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category !== "ALL") params.set("category", category);
      if (groupFilter !== "ALL") params.set("groupId", groupFilter);
      if (customCategoryFilter !== "ALL") params.set("customCategoryName", customCategoryFilter);
      if (lowStockOnly) params.set("lowStockOnly", "true");
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
  const importRequiredMapped = useMemo(
    () => IMPORT_FIELDS.filter((field) => field.required).every((field) => Boolean(importMapping[field.key])),
    [importMapping],
  );
  const importMappedRows = useMemo(() => {
    if (importRowsRaw.length === 0) return [];
    return importRowsRaw.map((row) => {
      const mapped = {} as Record<ImportFieldKey, unknown>;
      for (const field of IMPORT_FIELDS) {
        const column = importMapping[field.key];
        mapped[field.key] = column ? row[column] : "";
      }
      return mapped;
    });
  }, [importMapping, importRowsRaw]);
  const importPreviewRows = useMemo(() => importMappedRows.slice(0, 20), [importMappedRows]);
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
      frame_material_default: newProductForm.frameMaterialDefault,
      opening_type_default: newProductForm.openingTypeDefault,
      sliding_config_default: newProductForm.slidingConfigDefault,
      glass_type_default: newProductForm.glassTypeDefault,
      glass_coating_default: newProductForm.glassCoatingDefault,
      glass_thickness_mm_default: newProductForm.glassThicknessMmDefault,
      glass_finish_default: newProductForm.glassFinishDefault,
      screen_default: newProductForm.screenDefault,
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
  const primaryVariant = newProductVariants[0];
  const primaryVariantAutoSkuPreview = useMemo(() => {
    if (!primaryVariant) return "";
    if (newProductForm.category === "FLOOR") {
      const prefix = normalizeSkuValue(newProductForm.skuPrefix);
      const suffix = normalizeSkuValue(primaryVariant.skuSuffix);
      return prefix && suffix ? `${prefix}${suffix}` : "";
    }
    return (
      normalizeSkuValue(primaryVariant.sku) ||
      buildVariantSkuPreview(
        normalizeSkuValue(newProductForm.skuPrefix),
        primaryVariant.width,
        primaryVariant.height,
        primaryVariant.color,
        newProductForm.glassFinishDefault,
      ) ||
      autoSkuPreview
    );
  }, [
    primaryVariant,
    newProductForm.category,
    newProductForm.skuPrefix,
    newProductForm.glassFinishDefault,
    autoSkuPreview,
  ]);
  const hasVariantSkuOverride = Boolean(variantSkuOverrideValue);
  const effectiveSkuValue = normalizeSkuValue((variantSkuOverrideValue ?? primaryVariantAutoSkuPreview) || "");
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

  useEffect(() => {
    const variantName = newProductForm.name.trim();
    if (!variantName) return;
    const currentDisplayName = newProductVariants[0]?.displayName?.trim() ?? "";
    if (currentDisplayName) return;
    setNewProductVariants((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], displayName: variantName };
      return next;
    });
  }, [newProductForm.name, newProductVariants]);
  const applyCategoryChange = (next: {
    category: string;
    categoryId: string;
    customCategoryName: string;
    showNewCategoryInput: boolean;
    resetNewCategoryDraft: boolean;
  }, resetTemplateFields: boolean) => {
    setShowNewCategoryInput(next.showNewCategoryInput);
    if (next.resetNewCategoryDraft) setNewCategoryDraft("");
    setNewProductForm((prev) => {
      const updatedBase = {
        ...prev,
        category: next.category,
        categoryId: next.categoryId,
        customCategoryName: next.customCategoryName,
        flooringMaterial:
          next.category === "FLOOR" && !String(prev.flooringMaterial ?? "").trim()
            ? "LVP"
            : prev.flooringMaterial,
      };
      if (!resetTemplateFields) return updatedBase;
      const cleared = clearTemplateSpecFields(updatedBase);
      if (next.category === "FLOOR") {
        return { ...cleared, flooringMaterial: "LVP" };
      }
      return cleared;
    });
  };
  const handleCategorySelectChange = (value: string) => {
    let next = {
      category: newProductForm.category,
      categoryId: newProductForm.categoryId ?? "",
      customCategoryName: newProductForm.customCategoryName ?? "",
      showNewCategoryInput: false,
      resetNewCategoryDraft: false,
    };

    if (value === ADD_NEW_CATEGORY_VALUE) {
      next = {
        category: "OTHER",
        categoryId: "",
        customCategoryName: "",
        showNewCategoryInput: true,
        resetNewCategoryDraft: true,
      };
    } else if (value.startsWith("CUSTOM:")) {
      const customName = value.slice("CUSTOM:".length).trim();
      next = {
        category: "OTHER",
        categoryId: "",
        customCategoryName: customName,
        showNewCategoryInput: false,
        resetNewCategoryDraft: false,
      };
    } else {
      const tpl = (templatesQuery.data ?? []).find((item) => item.categoryKey === value);
      next = {
        category: value,
        categoryId: tpl?.id ?? "",
        customCategoryName: "",
        showNewCategoryInput: false,
        resetNewCategoryDraft: false,
      };
    }

    const currentKind = getTemplateKind(newProductForm.category);
    const nextKind = getTemplateKind(next.category);
    const isSwitchingCategory = next.category !== newProductForm.category;

    if (isSwitchingCategory && hasTemplateSpecData(newProductForm) && currentKind !== nextKind) {
      setPendingCategoryChange(next);
      return;
    }

    applyCategoryChange(next, false);
  };
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
        setRemovedVariantIds((current) =>
          current.includes(target.variantId as string)
            ? current
            : [...current, target.variantId as string],
        );
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
    if (!newProductVariants[0]?.displayName?.trim()) {
      setError("Display Name is required.");
      return;
    }
    if (newProductForm.category === "WINDOW") {
      const nextSpecErrors: Record<string, string> = {};
      if (!newProductForm.openingTypeDefault.trim()) {
        nextSpecErrors.openingTypeDefault = "Opening Type is required for Window.";
      }
      if (!newProductForm.glassTypeDefault.trim()) {
        nextSpecErrors.glassTypeDefault = "Glass Type is required for Window.";
      }
      const thicknessValue = Number(newProductForm.glassThicknessMmDefault);
      if (!newProductForm.glassThicknessMmDefault.trim() || !Number.isFinite(thicknessValue) || thicknessValue <= 0) {
        nextSpecErrors.glassThicknessMmDefault = "Glass Thickness (mm) must be a positive number.";
      }
      if (!newProductForm.screenDefault.trim()) {
        nextSpecErrors.screenDefault = "Screen is required for Window.";
      }
      setSeriesSpecErrors(nextSpecErrors);
      if (Object.keys(nextSpecErrors).length > 0) {
        setError("Please complete required Series Specifications defaults.");
        return;
      }
    } else if (newProductForm.category === "FLOOR") {
      const nextSpecErrors: Record<string, string> = {};
      const requiredPositiveDecimal = (
        key:
          | "flooringPlankLengthIn"
          | "flooringPlankWidthIn"
          | "flooringThicknessMm"
          | "flooringCoreThicknessMm"
          | "flooringUnderlaymentMm"
          | "flooringBoxCoverageSqft",
        label: string,
      ) => {
        const raw = String(newProductForm[key] ?? "").trim();
        const value = Number(raw);
        if (!raw || !Number.isFinite(value) || value <= 0) {
          nextSpecErrors[key] = `${label} must be a positive number.`;
        }
      };
      if (!newProductForm.flooringMaterial.trim()) {
        nextSpecErrors.flooringMaterial = "Type is required for Flooring.";
      }
      if (!newProductForm.flooringWearLayer.trim()) {
        nextSpecErrors.flooringWearLayer = "Wear Layer is required for Flooring.";
      }
      if (!newProductForm.flooringUnderlaymentType.trim()) {
        nextSpecErrors.flooringUnderlaymentType = "Underlayment Type is required for Flooring.";
      }
      requiredPositiveDecimal("flooringPlankLengthIn", "Plank Length (in)");
      requiredPositiveDecimal("flooringPlankWidthIn", "Plank Width (in)");
      requiredPositiveDecimal("flooringThicknessMm", "Total Thickness (mm)");
      requiredPositiveDecimal("flooringCoreThicknessMm", "Core Thickness (mm)");
      requiredPositiveDecimal("flooringUnderlaymentMm", "Underlayment Thickness (mm)");
      requiredPositiveDecimal("flooringBoxCoverageSqft", "Sqft Per Box");
      setSeriesSpecErrors(nextSpecErrors);
      if (Object.keys(nextSpecErrors).length > 0) {
        setError("Please complete required Flooring series defaults.");
        return;
      }
    } else {
      setSeriesSpecErrors({});
    }
    const isSizeColorDriven = newProductForm.category === "WINDOW";
    const isFlooringVariantMode = newProductForm.category === "FLOOR";
    const normalizedSkuPrefix = normalizeSkuValue(newProductForm.skuPrefix);
    if ((isSizeColorDriven || isFlooringVariantMode) && !normalizedSkuPrefix) {
      setError(
        isFlooringVariantMode
          ? "SKU Prefix is required for Flooring products."
          : "SKU Prefix is required for Window products.",
      );
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
      const normalizedSuffix = normalizeSkuValue(item.skuSuffix);
      const flooringSku = normalizedSkuPrefix && normalizedSuffix ? `${normalizedSkuPrefix}${normalizedSuffix}` : "";
      const rawSku = normalizeSkuValue(item.sku);
      const finalSku = isFlooringVariantMode ? flooringSku || rawSku : rawSku || skuPreview;
      return {
        ...item,
        displayName: item.displayName.trim(),
        skuSuffix: normalizedSuffix,
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
      if (isFlooringVariantMode) {
        if (!item.displayName) return true;
        const hasExistingSku = Boolean(item.variantId && item.sku);
        if (!item.skuSuffix && !hasExistingSku) return true;
      }
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
      if (isFlooringVariantMode && normalizedVariants.some((item) => !item.displayName)) {
        setError("Display Name is required for Flooring variants.");
        return;
      }
      if (
        isFlooringVariantMode &&
        normalizedVariants.some((item) => {
          const hasExistingSku = Boolean(item.variantId && item.sku);
          return !item.skuSuffix && !hasExistingSku;
        })
      ) {
        setError("SKU Suffix is required for Flooring variants.");
        return;
      }
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
    setValidationWarnings([]);
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
          removedVariantIds,
          variants: newProductVariants.map((item) => ({
            id: item.variantId || undefined,
            displayName: item.displayName?.trim() || null,
            skuSuffix: normalizeSkuValue(item.skuSuffix),
            sku:
              isFlooringVariantMode
                ? normalizeSkuValue(item.sku) ||
                  `${normalizedSkuPrefix}${normalizeSkuValue(item.skuSuffix)}`
                : normalizeSkuValue(item.sku) ||
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
            reorderLevel: Number(item.reorderLevel || 0),
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? (isEdit ? "Failed to update product" : "Failed to add product"));
      const warnings = extractValidationWarnings(payload);
      setValidationWarnings(warnings);

      setOpenNewDialog(false);
      setSkuPrefixCustomMode(false);
      setNewCategoryDraft("");
      setShowNewCategoryInput(false);
      setEditingProductId(null);
      setAddProductTab("GENERAL");
      setNewProductVariants([createEmptyVariantDraft()]);
      setRemovedVariantIds([]);
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
    setRemovedVariantIds([]);
    setNewProductVariants(
      (product.variants ?? []).length > 0
        ? (product.variants ?? []).map((variant) => ({
            id: `variant-${variant.id}`,
            variantId: variant.id,
            displayName: variant.displayName ?? variant.description ?? "",
            skuSuffix:
              variant.skuSuffix ??
              (product.category === "FLOOR" &&
              product.skuPrefix &&
              String(variant.sku ?? "").toUpperCase().startsWith(normalizeSkuValue(product.skuPrefix))
                ? String(variant.sku ?? "").slice(normalizeSkuValue(product.skuPrefix).length)
                : ""),
            width: variant.width != null ? String(variant.width) : "",
            height: variant.height != null ? String(variant.height) : "",
            color: variant.color ?? "",
            sku: variant.sku ?? "",
            salePrice: variant.price != null ? String(variant.price) : product.salePrice ?? "",
            cost: variant.cost != null ? String(variant.cost) : product.costPrice ?? "",
            openingStock: String(variant.onHand ?? 0),
            reorderLevel: String(variant.reorderLevel ?? 0),
            reservedBoxes: Number(variant.reserved ?? 0),
          }))
        : [createEmptyVariantDraft()],
    );
    setSkuPrefixCustomMode(
      Boolean(product.skuPrefix && !SKU_PREFIX_OPTIONS.includes(normalizeSkuValue(product.skuPrefix) as (typeof SKU_PREFIX_OPTIONS)[number])),
    );
    setSeriesSpecErrors({});
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
      frameMaterialDefault: product.frameMaterialDefault ?? "",
      openingTypeDefault: product.openingTypeDefault ?? "",
      slidingConfigDefault: product.slidingConfigDefault ?? "",
      glassTypeDefault: product.glassTypeDefault ?? "",
      glassCoatingDefault: product.glassCoatingDefault ?? "",
      glassThicknessMmDefault:
        product.glassThicknessMmDefault != null ? String(product.glassThicknessMmDefault) : "",
      glassFinishDefault: product.glassFinishDefault ?? "",
      screenDefault: product.screenDefault ?? "",
      flooringBrand: product.flooringBrand ?? "",
      flooringSeries: product.flooringSeries ?? "",
      flooringMaterial: product.flooringMaterial ?? "",
      flooringWearLayer: product.flooringWearLayer ?? "",
      flooringThicknessMm: product.flooringThicknessMm != null ? String(product.flooringThicknessMm) : "",
      flooringPlankLengthIn:
        product.flooringPlankLengthIn != null ? String(product.flooringPlankLengthIn) : "",
      flooringPlankWidthIn:
        product.flooringPlankWidthIn != null ? String(product.flooringPlankWidthIn) : "",
      flooringCoreThicknessMm:
        product.flooringCoreThicknessMm != null ? String(product.flooringCoreThicknessMm) : "",
      flooringFinish: product.flooringFinish ?? "",
      flooringEdge: product.flooringEdge ?? "",
      flooringInstallation: product.flooringInstallation ?? "",
      flooringUnderlayment: product.flooringUnderlayment ?? "",
      flooringUnderlaymentType: product.flooringUnderlaymentType ?? "",
      flooringUnderlaymentMm:
        product.flooringUnderlaymentMm != null ? String(product.flooringUnderlaymentMm) : "",
      flooringWaterproof:
        product.flooringWaterproof === true ? "true" : product.flooringWaterproof === false ? "false" : "",
      flooringWaterResistance: product.flooringWaterResistance ?? "",
      flooringWarrantyResidentialYr:
        product.flooringWarrantyResidentialYr != null ? String(product.flooringWarrantyResidentialYr) : "",
      flooringWarrantyCommercialYr:
        product.flooringWarrantyCommercialYr != null ? String(product.flooringWarrantyCommercialYr) : "",
      flooringPiecesPerBox:
        product.flooringPiecesPerBox != null ? String(product.flooringPiecesPerBox) : "",
      flooringBoxCoverageSqft:
        product.flooringBoxCoverageSqft != null ? String(product.flooringBoxCoverageSqft) : "",
      flooringLowStockThreshold:
        product.flooringLowStockThreshold != null ? String(product.flooringLowStockThreshold) : "",
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

  const resetImportState = () => {
    setImportFileName("");
    setImportColumns([]);
    setImportRowsRaw([]);
    setImportMapping({});
    setImportErrors([]);
    setImportWarnings([]);
  };

  const onImportFileChange = async (file: File | null) => {
    if (!file) return;
    setImportParsing(true);
    setError(null);
    setImportErrors([]);
    setImportWarnings([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("File has no sheet.");
      const sheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (rows.length === 0) throw new Error("No data rows found in file.");
      const columnSet = new Set<string>();
      for (const row of rows) {
        Object.keys(row).forEach((key) => columnSet.add(key));
      }
      const columns = Array.from(columnSet);
      setImportFileName(file.name);
      setImportRowsRaw(rows);
      setImportColumns(columns);
      setImportMapping(guessImportMapping(columns));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse import file.");
    } finally {
      setImportParsing(false);
    }
  };

  const submitImport = async () => {
    if (!importRequiredMapped) {
      setError("Please map all required fields (SKU and Product Name).");
      return;
    }
    if (importMappedRows.length === 0) {
      setError("No import rows to submit.");
      return;
    }
    setImportSubmitting(true);
    setError(null);
    setNotice(null);
    setValidationWarnings([]);
    setImportErrors([]);
    setImportWarnings([]);
    try {
      const payloadRows = importMappedRows.map((row) => ({
        sku: String(row.sku ?? "").trim(),
        name: String(row.name ?? "").trim(),
        description: String(row.description ?? "").trim(),
        category: String(row.category ?? "").trim(),
        unit: String(row.unit ?? "").trim(),
        salePrice: row.salePrice,
        costPrice: row.costPrice,
        onHand: row.onHand,
        reorderLevel: row.reorderLevel,
        width: row.width,
        height: row.height,
        color: String(row.color ?? "").trim(),
        warehouseName: String(row.warehouseName ?? "").trim(),
        supplierName: String(row.supplierName ?? "").trim(),
      }));
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to import products.");
      const summary = payload?.data?.summary ?? {};
      setImportErrors(payload?.data?.errors ?? []);
      setImportWarnings(payload?.data?.warnings ?? []);
      setNotice(
        `Import done: total ${summary.totalRows ?? 0}, created ${summary.createdCount ?? 0}, updated ${summary.updatedCount ?? 0}, failed ${summary.failedCount ?? 0}.`,
      );
      setValidationWarnings((payload?.data?.warnings ?? []).slice(0, 6).map((row: any) => `Row ${row.row}: ${row.warning}`));
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import products.");
    } finally {
      setImportSubmitting(false);
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

  const bulkAssignCategory = async () => {
    if (selectedProductIds.length === 0) {
      setError("Please select at least one product for bulk update.");
      return;
    }
    setSubmittingBulkGroup(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/products/bulk-category", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          productIds: selectedProductIds,
          categoryName: bulkCategory,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to bulk update category");
      setSelectedProductIds([]);
      const updatedCount = Number(payload?.data?.updatedCount ?? 0);
      setNotice(`${updatedCount} products updated to ${bulkCategory}`);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-custom-categories"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk update category");
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
        <div className="glass-card p-5">
          <div className="glass-card-content">
            <p className="text-sm text-white/50">Loading product management...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1320px] space-y-4">
      <div className="glass-card p-5">
        <div className="glass-card-content">
          <PageHeader
            title="Product Management"
            subtitle="Enterprise product master, pricing, and stock visibility."
            actions={
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
              resetImportState();
              setOpenImportDialog(true);
            }}
            className="ios-secondary-btn inline-flex h-10 items-center justify-center gap-2 px-3 text-sm"
          >
            Import CSV/XLSX
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingProductId(null);
              setAddProductTab("GENERAL");
              setNewProductVariants([createEmptyVariantDraft()]);
              setRemovedVariantIds([]);
              setSeriesSpecErrors({});
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
            }
          />
        </div>
      </div>

      <div className="glass-card p-0">
        <div className="glass-card-content space-y-2 px-4 py-3">
          {searchParams?.get("category") ? (
            <div>
              <span className="so-chip inline-flex items-center gap-2 rounded-full">
                Category: {category}
                <button
                  type="button"
                  onClick={clearCategoryFilterParam}
                  className="rounded-full px-1 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Clear category filter"
                >
                  x
                </button>
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setCategory(item.value);
                    if (item.value !== "OTHER") setCustomCategoryFilter("ALL");
                  }}
                  className={`h-8 rounded-full px-3 text-xs transition ${
                    category === item.value ? "so-chip-active" : "so-chip"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex w-full items-center gap-2 xl:w-auto">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name / SKU / variant..."
                className="ios-input h-8 w-full min-w-[260px] px-3 text-sm xl:w-[360px]"
              />
              <button
                type="button"
                onClick={() => setLowStockFilter(lowStockOnly ? "all" : "low")}
                className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium transition ${
                  lowStockOnly
                    ? "border border-rose-400/30 bg-rose-500/15 text-rose-200 backdrop-blur-xl"
                    : "so-chip"
                }`}
              >
                Low Stock
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenAdvancedFilters((prev) => {
                    const next = !prev;
                    if (!next) setOpenColumnMenu(false);
                    return next;
                  });
                }}
                className="ios-secondary-btn h-8 shrink-0 px-3 text-xs"
              >
                {openAdvancedFilters ? "Hide Filters" : "More Filters"}
              </button>
            </div>
          </div>

          {openAdvancedFilters ? (
            <div className="relative rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="ios-input h-8 min-w-[190px] px-3 text-sm"
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
                  className="ios-input h-8 min-w-[220px] px-3 text-sm"
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
                    className="ios-secondary-btn h-8 px-3 text-xs"
                  >
                    Optional Columns ({optionalColumnCount})
                  </button>
                  {openColumnMenu ? (
                    <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-2 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
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
                        <label key={key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-white/80">
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
          ) : null}
        </div>

        {selectedProductIds.length > 0 ? (
          <div className="sticky top-0 z-10 border-y border-white/[0.10] bg-white/[0.04] px-4 py-2 backdrop-blur-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-white/80">{selectedProductIds.length} selected</span>
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="ios-input h-8 min-w-[210px] px-3 text-sm"
              >
                {BULK_CATEGORY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    Assign to: {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={submittingBulkGroup}
                onClick={bulkAssignCategory}
                className="ios-primary-btn h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingBulkGroup ? "Applying..." : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedProductIds([])}
                className="ios-secondary-btn h-8 px-3 text-xs"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      {validationWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Validation warnings</p>
          <p className="mt-1">{validationWarnings.join(" ")}</p>
        </div>
      ) : null}

        <div className="glass-card overflow-hidden p-0">
        <div className="hidden md:block">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-20">
                <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      aria-label="Select all visible products"
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  {showOptionalColumns.group ? <TableHead>Group</TableHead> : null}
                  {showOptionalColumns.specification ? <TableHead>Specification</TableHead> : null}
                  {showOptionalColumns.unit ? <TableHead>Unit</TableHead> : null}
                  <TableHead className="text-right">Variants</TableHead>
                  <TableHead className="text-right">Price Range</TableHead>
                  {showOptionalColumns.onHand ? <TableHead className="text-right">On Hand</TableHead> : null}
                  {showOptionalColumns.reserved ? <TableHead className="text-right">Reserved</TableHead> : null}
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Warehouse</TableHead>
                  {showOptionalColumns.supplier ? <TableHead>Preferred Supplier</TableHead> : null}
                  {showOptionalColumns.gallery ? <TableHead>Gallery</TableHead> : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.isLoading ? (
                  <TableSkeletonRows columns={7 + optionalColumnCount} rows={10} rowClassName="border-white/10" />
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7 + optionalColumnCount} className="text-center text-white/50">
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
                        className={`group h-12 cursor-pointer border-white/10 txt-secondary transition-colors duration-150 hover:bg-white/[0.06] ${
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
                        <TableCell className="font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span>{product.name}</span>
                            {product.hasLowStock ? (
                              <span className="rounded border border-rose-400/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                                LOW STOCK
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{getCategoryLabel(product)}</TableCell>
                        {showOptionalColumns.group ? <TableCell>{product.group?.name ?? "-"}</TableCell> : null}
                        {showOptionalColumns.specification ? <TableCell>{product.specification || "-"}</TableCell> : null}
                        {showOptionalColumns.unit ? (
                          <TableCell>{UNIT_LABEL_MAP[product.unit] ?? product.unit}</TableCell>
                        ) : null}
                        <TableCell className="text-right font-semibold text-white">
                          {Number(product.variantCount ?? product.variants?.length ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-white">
                          {product.priceMin != null && product.priceMax != null
                            ? product.priceMin === product.priceMax
                              ? `$${Number(product.priceMin).toFixed(2)}`
                              : `$${Number(product.priceMin).toFixed(2)} - $${Number(product.priceMax).toFixed(2)}`
                            : role === "WAREHOUSE" || product.salePrice == null
                              ? "Spec Confirmed"
                              : `$${Number(product.salePrice).toFixed(2)}`}
                        </TableCell>
                        {showOptionalColumns.onHand ? (
                          <TableCell className="text-right">
                            {formatStockByProductUnit(Number(product.stockSummary?.onHand ?? 0), product.unit)}
                          </TableCell>
                        ) : null}
                        {showOptionalColumns.reserved ? (
                          <TableCell className="text-right">
                            {formatStockByProductUnit(Number(product.stockSummary?.reserved ?? 0), product.unit)}
                          </TableCell>
                        ) : null}
                        <TableCell
                          className={`text-right ${
                            Number(product.totalAvailable ?? product.stockSummary?.available ?? 0) <= 0
                              ? "font-semibold text-rose-300"
                              : "font-semibold text-emerald-300"
                          }`}
                        >
                          {formatStockByProductUnit(
                            Number(product.totalAvailable ?? product.stockSummary?.available ?? 0),
                            product.unit,
                          )}
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
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/50 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100 disabled:opacity-40"
                            >
                              {deletingProductId === product.id ? (
                                <Spinner className="h-4 w-4 text-rose-300" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                            <span
                              className="ml-1 inline-flex items-center text-white/40 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
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
                className={`glass-card p-3 ${
                  highlightId === product.id ? "ring-2 ring-cyan-400/30" : ""
                }`}
              >
                <div className="glass-card-content flex items-start justify-between">
                  <h3 className="text-base font-semibold text-white">
                    {product.name}
                    {product.hasLowStock ? (
                      <span className="ml-2 rounded border border-rose-400/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                        LOW STOCK
                      </span>
                    ) : null}
                  </h3>
                  <span className="text-xs text-white/50">
                    {getCategoryLabel(product)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/70">
                  Variants: {Number(product.variantCount ?? product.variants?.length ?? 0)} · Price:{" "}
                  {product.priceMin != null && product.priceMax != null
                    ? product.priceMin === product.priceMax
                      ? `$${Number(product.priceMin).toFixed(2)}`
                      : `$${Number(product.priceMin).toFixed(2)} - $${Number(product.priceMax).toFixed(2)}`
                    : role === "WAREHOUSE" || product.salePrice == null
                      ? "Spec Confirmed"
                      : `$${Number(product.salePrice).toFixed(2)}`}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  Stock: On Hand {formatStockByProductUnit(Number(product.stockSummary?.onHand ?? 0), product.unit)} /
                  Reserved {formatStockByProductUnit(Number(product.stockSummary?.reserved ?? 0), product.unit)} /
                  Available{" "}
                  {formatStockByProductUnit(
                    Number(product.totalAvailable ?? product.stockSummary?.available ?? 0),
                    product.unit,
                  )}
                </p>
                <p className="mt-1 text-sm text-white/70">Warehouse: {product.warehouse?.name ?? "-"}</p>
                {showOptionalColumns.supplier ? (
                  <p className="mt-1 text-sm text-white/70">Supplier: {product.supplier?.name ?? "-"}</p>
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
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/50 transition hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                    >
                      {deletingProductId === product.id ? (
                        <Spinner className="h-4 w-4 text-rose-300" />
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
      </div>

      {openNewDialog ? (
        <Modal
          title={editingProductId ? "Edit Product" : "Add Product"}
          onClose={() => {
            setOpenNewDialog(false);
            setEditingProductId(null);
            setAddProductTab("GENERAL");
            setNewProductVariants([createEmptyVariantDraft()]);
            setRemovedVariantIds([]);
            setSkuPrefixCustomMode(false);
            setPendingCategoryChange(null);
          }}
          maxWidthClass="max-w-4xl"
        >
          <form className="space-y-5" onSubmit={onCreateProduct}>
            <p className="text-sm text-slate-400">
              {editingProductId
                ? "Update product details, pricing, stock baseline, and mappings."
                : "Build product and variants in a compact two-step flow."}
            </p>

            {true ? (
              <>
                <div className="inline-flex rounded-xl border border-white/[0.12] bg-white/[0.05] p-1 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setAddProductTab("GENERAL")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      addProductTab === "GENERAL"
                        ? "bg-white/[0.10] text-white"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddProductTab("VARIANTS")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      addProductTab === "VARIANTS"
                        ? "bg-white/[0.10] text-white"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    Variants & Inventory
                  </button>
                </div>

                {addProductTab === "GENERAL" ? (
                  <div className="glass-card-soft p-4">
                    <h4 className="text-sm font-semibold text-white">General</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <InputField
                        label="Product Name"
                        value={newProductForm.name}
                        onChange={(value) => setNewProductForm((prev) => ({ ...prev, name: value }))}
                        required
                      />
                      <div className="space-y-2">
                        <span className="text-sm text-slate-300">Category</span>
                        <select
                          value={customCategorySelectValue}
                          onChange={(event) => handleCategorySelectChange(event.target.value)}
                          className="ios-input h-12 w-full px-3 text-sm"
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
                        <p className="text-xs text-slate-400">
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
                      {newProductForm.category === "WINDOW" ? (
                        <WindowSpecs
                          values={{
                            frameMaterialDefault: newProductForm.frameMaterialDefault,
                            openingTypeDefault: newProductForm.openingTypeDefault,
                            slidingConfigDefault: newProductForm.slidingConfigDefault,
                            glassTypeDefault: newProductForm.glassTypeDefault,
                            glassCoatingDefault: newProductForm.glassCoatingDefault,
                            glassThicknessMmDefault: newProductForm.glassThicknessMmDefault,
                            glassFinishDefault: newProductForm.glassFinishDefault,
                            screenDefault: newProductForm.screenDefault,
                          }}
                          errors={seriesSpecErrors}
                          required={isWindowCategory}
                          onChange={(field, value) =>
                            setNewProductForm((prev) => {
                              if (field === "openingTypeDefault") {
                                return {
                                  ...prev,
                                  openingTypeDefault: value,
                                  slidingConfigDefault:
                                    String(value ?? "").trim().toUpperCase() === "SLIDING"
                                      ? prev.slidingConfigDefault
                                      : "",
                                };
                              }
                              if (field === "screenDefault") {
                                return { ...prev, screenDefault: value, screenType: value };
                              }
                              return { ...prev, [field]: value };
                            })
                          }
                        />
                      ) : null}
                      {newProductForm.category === "FLOOR" ? (
                        <FlooringSpecs
                          values={{
                            flooringBrand: newProductForm.flooringBrand,
                            flooringSeries: newProductForm.flooringSeries,
                            flooringMaterial: newProductForm.flooringMaterial,
                            flooringWearLayer: newProductForm.flooringWearLayer,
                            flooringThicknessMm: newProductForm.flooringThicknessMm,
                            flooringPlankLengthIn: newProductForm.flooringPlankLengthIn,
                            flooringPlankWidthIn: newProductForm.flooringPlankWidthIn,
                            flooringCoreThicknessMm: newProductForm.flooringCoreThicknessMm,
                            flooringFinish: newProductForm.flooringFinish,
                            flooringEdge: newProductForm.flooringEdge,
                            flooringInstallation: newProductForm.flooringInstallation,
                            flooringUnderlayment: newProductForm.flooringUnderlayment,
                            flooringUnderlaymentType: newProductForm.flooringUnderlaymentType,
                            flooringUnderlaymentMm: newProductForm.flooringUnderlaymentMm,
                            flooringWaterproof: newProductForm.flooringWaterproof,
                            flooringWaterResistance: newProductForm.flooringWaterResistance,
                            flooringWarrantyResidentialYr: newProductForm.flooringWarrantyResidentialYr,
                            flooringWarrantyCommercialYr: newProductForm.flooringWarrantyCommercialYr,
                            flooringPiecesPerBox: newProductForm.flooringPiecesPerBox,
                            flooringBoxCoverageSqft: newProductForm.flooringBoxCoverageSqft,
                            flooringLowStockThreshold: newProductForm.flooringLowStockThreshold,
                          }}
                          errors={seriesSpecErrors}
                          onChange={(field, value) => setNewProductForm((prev) => ({ ...prev, [field]: value }))}
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
                  <div className="glass-card-soft p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-white">Variants & Inventory</h4>
                      <div className="inline-flex items-center gap-2">
                        <button type="button" onClick={bulkAddVariantRows} className="ios-secondary-btn h-9 px-3 text-xs">
                          Bulk Add 3
                        </button>
                        <button type="button" onClick={addVariantRow} className="ios-primary-btn h-9 px-3 text-xs">
                          Add Variant
                        </button>
                      </div>
                    </div>
                    <div className="relative mt-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                      <div
                        ref={variantsScrollRef}
                        className="scroll-x w-full overflow-x-auto overflow-y-hidden [webkit-overflow-scrolling:touch]"
                      >
                      <table className="w-full min-w-[1460px] table-fixed border-collapse text-sm">
                        <thead className="bg-white/[0.06]">
                          <tr>
                            <th className="sticky top-0 z-20 w-[280px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                              {newProductForm.category === "FLOOR" ? "Display Name *" : "Variant Title"}
                            </th>
                            {newProductForm.category === "FLOOR" ? (
                              <>
                                <th className="sticky top-0 z-20 w-[120px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                                  SKU Prefix
                                </th>
                                <th className="sticky top-0 z-20 w-[160px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                                  SKU Suffix *
                                </th>
                              </>
                            ) : (
                              <>
                                <th className="sticky top-0 z-20 w-[160px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                                  Size (WxH)
                                </th>
                                <th className="sticky top-0 z-20 w-[160px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                                  Color
                                </th>
                              </>
                            )}
                            <th className="sticky top-0 z-20 w-[160px] bg-white/[0.06] px-3 py-2 text-left font-medium text-slate-400">
                              {newProductForm.category === "FLOOR" ? "Effective SKU" : "SKU"}
                            </th>
                            <th className="sticky top-0 z-20 w-[140px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              Sale Price
                            </th>
                            <th className="sticky top-0 z-20 w-[140px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              Cost
                            </th>
                            <th className="sticky top-0 z-20 w-[160px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              {newProductForm.category === "FLOOR" ? "Boxes On Hand" : "Opening Stock"}
                            </th>
                            <th className="sticky top-0 z-20 w-[140px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              Reorder Level
                            </th>
                            <th className="sticky top-0 z-20 w-[150px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              Available
                            </th>
                            <th className="sticky top-0 z-20 w-[120px] bg-white/[0.06] px-3 py-2 text-right font-medium text-slate-400">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {newProductVariants.map((variant, index) => {
                            const isFlooring = newProductForm.category === "FLOOR";
                            const skuPrefix = normalizeSkuValue(newProductForm.skuPrefix);
                            const normalizedSuffix = normalizeSkuValue(variant.skuSuffix);
                            const flooringSkuPreview = skuPrefix && normalizedSuffix ? `${skuPrefix}${normalizedSuffix}` : "";
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
                            const onHandBoxes = Number(variant.openingStock || 0);
                            const reservedBoxes = Number(variant.reservedBoxes || 0);
                            const availableBoxes = onHandBoxes - reservedBoxes;
                            const reorderLevelBoxes = Number(variant.reorderLevel || 0);
                            const alertState = isFlooring
                              ? getStockAlertState(availableBoxes, reorderLevelBoxes)
                              : null;
                            return (
                              <tr key={variant.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">
                                  {isFlooring ? (
                                    <input
                                      value={variant.displayName}
                                      onChange={(event) => updateVariantRow(variant.id, { displayName: event.target.value })}
                                      placeholder={`Variant ${index + 1}`}
                                      className="ios-input h-9 w-full px-2 text-sm"
                                    />
                                  ) : (
                                    <>
                                      <p className="text-sm">{autoVariantTitle || `Variant ${index + 1}`}</p>
                                      <p className="text-xs text-slate-500">SKU preview: {skuPreview || "-"}</p>
                                    </>
                                  )}
                                </td>
                                {isFlooring ? (
                                  <>
                                    <td className="px-3 py-2">
                                      <span className="inline-flex h-9 items-center rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
                                        {skuPrefix || "-"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        value={variant.skuSuffix}
                                        onChange={(event) =>
                                          updateVariantRow(variant.id, { skuSuffix: normalizeSkuValue(event.target.value) })
                                        }
                                        placeholder="e.g. 170123"
                                        className="ios-input h-9 w-full px-2 text-sm"
                                      />
                                    </td>
                                  </>
                                ) : (
                                  <>
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
                                  </>
                                )}
                                <td className="px-3 py-2">
                                  {isFlooring ? (
                                    <span className="inline-flex h-9 w-full items-center rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
                                      {flooringSkuPreview || "-"}
                                    </span>
                                  ) : (
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
                                  )}
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
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.reorderLevel}
                                    onChange={(event) => updateVariantRow(variant.id, { reorderLevel: event.target.value })}
                                    className="ios-input h-9 w-28 px-2 text-right text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <span
                                      className={`text-sm font-semibold ${
                                        alertState === "LOW"
                                          ? "text-rose-600"
                                          : alertState === "WARNING"
                                            ? "text-amber-600"
                                            : "text-slate-700"
                                      }`}
                                    >
                                      {formatStockByProductUnit(availableBoxes, newProductForm.unit)}
                                    </span>
                                    {alertState === "LOW" ? (
                                      <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                                        LOW
                                      </span>
                                    ) : alertState === "WARNING" ? (
                                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                        WARNING
                                      </span>
                                    ) : null}
                                  </div>
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
                      {showVariantsScrollHint ? (
                        <div className="pointer-events-none absolute inset-y-[1px] right-[1px] flex w-24 items-center justify-end bg-gradient-to-l from-white via-white/90 to-transparent pr-2">
                          <span className="rounded border border-slate-200 bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">
                            Scroll →
                          </span>
                        </div>
                      ) : null}
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
                  <InputField
                    label="Display Name"
                    required
                    value={newProductVariants[0]?.displayName ?? ""}
                    onChange={(value) =>
                      setNewProductVariants((prev) => {
                        if (prev.length === 0) return prev;
                        const next = [...prev];
                        next[0] = { ...next[0], displayName: value };
                        return next;
                      })
                    }
                    placeholder={newProductForm.name || "e.g. LVFloor"}
                  />
                  <p className="text-xs text-slate-500">
                    Auto SKU Preview:{" "}
                    <span className="font-semibold text-slate-700">{primaryVariantAutoSkuPreview || "-"}</span>
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
                  setRemovedVariantIds([]);
                  setSkuPrefixCustomMode(false);
                  setPendingCategoryChange(null);
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

      {openImportDialog ? (
        <Modal
          title="Import Products"
          onClose={() => {
            setOpenImportDialog(false);
          }}
          maxWidthClass="max-w-5xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Upload a CSV or Excel file, map columns, preview rows, then import with upsert by SKU.
            </p>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">File (.csv, .xlsx)</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(event) => void onImportFileChange(event.target.files?.[0] ?? null)}
                  className="ios-input h-11 w-full px-3 text-sm"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                {importParsing
                  ? "Parsing file..."
                  : importFileName
                    ? `Loaded: ${importFileName} (${importRowsRaw.length} rows)`
                    : "No file loaded yet."}
              </p>
            </div>

            {importColumns.length > 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Column Mapping</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {IMPORT_FIELDS.map((field) => (
                    <label key={field.key} className="block space-y-1">
                      <span className="text-xs text-slate-600">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <select
                        value={importMapping[field.key] ?? ""}
                        onChange={(event) =>
                          setImportMapping((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="ios-input h-10 w-full bg-white px-3 text-sm"
                      >
                        <option value="">Not mapped</option>
                        {importColumns.map((column) => (
                          <option key={`${field.key}-${column}`} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {importPreviewRows.length > 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Preview (first 20 rows)</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        {IMPORT_FIELDS.map((field) => (
                          <th key={`preview-head-${field.key}`} className="px-2 py-1">
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewRows.map((row, idx) => (
                        <tr key={`preview-row-${idx}`} className="border-b border-slate-100">
                          {IMPORT_FIELDS.map((field) => (
                            <td key={`preview-cell-${idx}-${field.key}`} className="px-2 py-1 text-slate-700">
                              {String(row[field.key] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {(importWarnings.length > 0 || importErrors.length > 0) ? (
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                {importWarnings.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-amber-700">Warnings</p>
                    <p className="mt-1 text-xs text-amber-700">
                      {importWarnings.slice(0, 8).map((row) => `Row ${row.row}: ${row.warning}`).join(" | ")}
                    </p>
                  </div>
                ) : null}
                {importErrors.length > 0 ? (
                  <div className={importWarnings.length > 0 ? "mt-3" : ""}>
                    <p className="text-sm font-semibold text-rose-700">Errors</p>
                    <p className="mt-1 text-xs text-rose-700">
                      {importErrors.slice(0, 8).map((row) => `Row ${row.row} (${row.sku || "-"}): ${row.error}`).join(" | ")}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpenImportDialog(false)} className="ios-secondary-btn h-10 px-4 text-sm">
                Close
              </button>
              <button
                type="button"
                onClick={submitImport}
                disabled={importSubmitting || importParsing || !importRequiredMapped || importMappedRows.length === 0}
                className="ios-primary-btn h-10 px-4 text-sm disabled:opacity-60"
              >
                {importSubmitting ? "Importing..." : `Import ${importMappedRows.length} Rows`}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {pendingCategoryChange ? (
        <Modal
          title="Confirm Category Change"
          onClose={() => {
            setPendingCategoryChange(null);
          }}
          maxWidthClass="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Changing category will reset specification fields. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCategoryChange(null)}
                className="ios-secondary-btn h-10 px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  applyCategoryChange(pendingCategoryChange, true);
                  setPendingCategoryChange(null);
                }}
                className="ios-primary-btn h-10 px-4 text-sm"
              >
                Continue
              </button>
            </div>
          </div>
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
                label: `${item.sku} · Available ${formatStockByProductUnit(Number(item.available ?? 0), stockProduct.unit)}`,
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

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-[1320px]">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm text-slate-500">Loading product management...</p>
          </div>
        </section>
      }
    >
      <ProductsPageContent />
    </Suspense>
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
