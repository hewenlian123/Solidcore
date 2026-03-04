"use client";

type FlooringSpecsProps = {
  values: {
    flooringBrand: string;
    flooringSeries: string;
    flooringMaterial: string;
    flooringWearLayer: string;
    flooringThicknessMm: string;
    flooringPlankLengthIn: string;
    flooringPlankWidthIn: string;
    flooringCoreThicknessMm: string;
    flooringFinish: string;
    flooringEdge: string;
    flooringInstallation: string;
    flooringUnderlayment: string;
    flooringUnderlaymentType: string;
    flooringUnderlaymentMm: string;
    flooringWaterproof: string;
    flooringWaterResistance: string;
    flooringWarrantyResidentialYr: string;
    flooringWarrantyCommercialYr: string;
    flooringPiecesPerBox: string;
    flooringBoxCoverageSqft: string;
    flooringLowStockThreshold: string;
  };
  errors?: Record<string, string>;
  onChange: (
    field:
      | "flooringBrand"
      | "flooringSeries"
      | "flooringMaterial"
      | "flooringWearLayer"
      | "flooringThicknessMm"
      | "flooringPlankLengthIn"
      | "flooringPlankWidthIn"
      | "flooringCoreThicknessMm"
      | "flooringFinish"
      | "flooringEdge"
      | "flooringInstallation"
      | "flooringUnderlayment"
      | "flooringUnderlaymentType"
      | "flooringUnderlaymentMm"
      | "flooringWaterproof"
      | "flooringWaterResistance"
      | "flooringWarrantyResidentialYr"
      | "flooringWarrantyCommercialYr"
      | "flooringPiecesPerBox"
      | "flooringBoxCoverageSqft"
      | "flooringLowStockThreshold",
    value: string,
  ) => void;
};

export function FlooringSpecs({ values, errors, onChange }: FlooringSpecsProps) {
  return (
    <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <h4 className="text-sm font-semibold text-slate-900">Series Specifications (Defaults)</h4>
      <div className="mt-3 space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identity</p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Brand</span>
              <input
                value={values.flooringBrand}
                onChange={(event) => onChange("flooringBrand", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Series</span>
              <input
                value={values.flooringSeries}
                onChange={(event) => onChange("flooringSeries", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Type *</span>
              <select
                value={values.flooringMaterial}
                onChange={(event) => onChange("flooringMaterial", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="SPC">SPC</option>
                <option value="LVP">LVP</option>
                <option value="LAMINATE">Laminate</option>
                <option value="HARDWOOD">Hardwood</option>
              </select>
              {errors?.flooringMaterial ? (
                <p className="text-xs text-rose-600">{errors.flooringMaterial}</p>
              ) : null}
            </label>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Build</p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Wear Layer (mil) *</span>
              <input
                value={values.flooringWearLayer}
                onChange={(event) => onChange("flooringWearLayer", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
                placeholder="12mil / 20mil"
              />
              {errors?.flooringWearLayer ? (
                <p className="text-xs text-rose-600">{errors.flooringWearLayer}</p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Total Thickness (mm) *</span>
              <input
                value={values.flooringThicknessMm}
                onChange={(event) => onChange("flooringThicknessMm", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              {errors?.flooringThicknessMm ? (
                <p className="text-xs text-rose-600">{errors.flooringThicknessMm}</p>
              ) : null}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Plank L (in) *</span>
                <input
                  value={values.flooringPlankLengthIn}
                  onChange={(event) => onChange("flooringPlankLengthIn", event.target.value)}
                  className="ios-input h-11 w-full px-3 text-sm"
                />
                {errors?.flooringPlankLengthIn ? (
                  <p className="text-xs text-rose-600">{errors.flooringPlankLengthIn}</p>
                ) : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Plank W (in) *</span>
                <input
                  value={values.flooringPlankWidthIn}
                  onChange={(event) => onChange("flooringPlankWidthIn", event.target.value)}
                  className="ios-input h-11 w-full px-3 text-sm"
                />
                {errors?.flooringPlankWidthIn ? (
                  <p className="text-xs text-rose-600">{errors.flooringPlankWidthIn}</p>
                ) : null}
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Core Thickness (mm) *</span>
              <input
                value={values.flooringCoreThicknessMm}
                onChange={(event) => onChange("flooringCoreThicknessMm", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              {errors?.flooringCoreThicknessMm ? (
                <p className="text-xs text-rose-600">{errors.flooringCoreThicknessMm}</p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Finish</span>
              <select
                value={values.flooringFinish}
                onChange={(event) => onChange("flooringFinish", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="MATTE">Matte</option>
                <option value="GLOSS">Gloss</option>
                <option value="EMBOSSED">Embossed</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Edge</span>
              <select
                value={values.flooringEdge}
                onChange={(event) => onChange("flooringEdge", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="BEVEL">Bevel</option>
                <option value="MICRO_BEVEL">Micro-bevel</option>
                <option value="SQUARE">Square</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Install</p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Installation</span>
              <select
                value={values.flooringInstallation}
                onChange={(event) => onChange("flooringInstallation", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="CLICK">Click</option>
                <option value="GLUE_DOWN">GlueDown</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Underlayment Type *</span>
              <input
                value={values.flooringUnderlaymentType}
                onChange={(event) => onChange("flooringUnderlaymentType", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
                placeholder="IXPE / EVA / Cork"
              />
              {errors?.flooringUnderlaymentType ? (
                <p className="text-xs text-rose-600">{errors.flooringUnderlaymentType}</p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Underlayment (legacy)</span>
              <select
                value={values.flooringUnderlayment}
                onChange={(event) => onChange("flooringUnderlayment", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="ATTACHED">Attached</option>
                <option value="NONE">None</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Underlayment Thickness (mm) *</span>
              <input
                value={values.flooringUnderlaymentMm}
                onChange={(event) => onChange("flooringUnderlaymentMm", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              {errors?.flooringUnderlaymentMm ? (
                <p className="text-xs text-rose-600">{errors.flooringUnderlaymentMm}</p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Waterproof</span>
              <select
                value={values.flooringWaterproof}
                onChange={(event) => onChange("flooringWaterproof", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm text-slate-600">Water Resistance</span>
              <select
                value={values.flooringWaterResistance}
                onChange={(event) => onChange("flooringWaterResistance", event.target.value)}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="">Not Set</option>
                <option value="WATERPROOF">Waterproof</option>
                <option value="WATER_RESISTANT">WaterResistant</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Packaging & Alerts</p>
          <div className="mt-2 grid gap-3 md:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Residential Warranty (yr)</span>
              <input
                value={values.flooringWarrantyResidentialYr}
                onChange={(event) => onChange("flooringWarrantyResidentialYr", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Commercial Warranty (yr)</span>
              <input
                value={values.flooringWarrantyCommercialYr}
                onChange={(event) => onChange("flooringWarrantyCommercialYr", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Pieces / Box</span>
              <input
                value={values.flooringPiecesPerBox}
                onChange={(event) => onChange("flooringPiecesPerBox", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Box Coverage (sqft)</span>
              <input
                value={values.flooringBoxCoverageSqft}
                onChange={(event) => onChange("flooringBoxCoverageSqft", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              {errors?.flooringBoxCoverageSqft ? (
                <p className="text-xs text-rose-600">{errors.flooringBoxCoverageSqft}</p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Low Stock Threshold</span>
              <input
                value={values.flooringLowStockThreshold}
                onChange={(event) => onChange("flooringLowStockThreshold", event.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
