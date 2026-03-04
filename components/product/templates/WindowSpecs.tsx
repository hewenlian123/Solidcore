"use client";

type WindowSpecsProps = {
  values: {
    frameMaterialDefault: string;
    openingTypeDefault: string;
    slidingConfigDefault: string;
    glassTypeDefault: string;
    glassCoatingDefault: string;
    glassThicknessMmDefault: string;
    glassFinishDefault: string;
    screenDefault: string;
  };
  errors?: {
    openingTypeDefault?: string;
    glassTypeDefault?: string;
    glassThicknessMmDefault?: string;
    screenDefault?: string;
  };
  required?: boolean;
  onChange: (
    field:
      | "frameMaterialDefault"
      | "openingTypeDefault"
      | "slidingConfigDefault"
      | "glassTypeDefault"
      | "glassCoatingDefault"
      | "glassThicknessMmDefault"
      | "glassFinishDefault"
      | "screenDefault",
    value: string,
  ) => void;
};

export function WindowSpecs({ values, errors, required = false, onChange }: WindowSpecsProps) {
  const isSliding = String(values.openingTypeDefault ?? "").trim().toUpperCase() === "SLIDING";

  return (
    <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <h4 className="text-sm font-semibold text-slate-900">Series Specifications (Window)</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-slate-600">Frame Material</span>
          <input
            value={values.frameMaterialDefault}
            onChange={(event) => onChange("frameMaterialDefault", event.target.value)}
            className="ios-input h-12 w-full px-3 text-sm"
            placeholder="Vinyl"
          />
        </label>

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{`Opening Type${required ? " *" : ""}`}</span>
            <select
              value={values.openingTypeDefault}
              onChange={(event) => onChange("openingTypeDefault", event.target.value)}
              className="ios-input h-12 w-full bg-white px-3 text-sm"
            >
              <option value="">Not Set</option>
              <option value="Sliding">Sliding</option>
              <option value="Fixed">Fixed</option>
              <option value="Casement">Casement</option>
              <option value="Awning">Awning</option>
              <option value="Single Hung">Single Hung</option>
              <option value="Double Hung">Double Hung</option>
            </select>
          </label>
          {errors?.openingTypeDefault ? <p className="text-xs text-rose-600">{errors.openingTypeDefault}</p> : null}
        </div>

        {isSliding ? (
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">Sliding Config</span>
            <select
              value={values.slidingConfigDefault}
              onChange={(event) => onChange("slidingConfigDefault", event.target.value)}
              className="ios-input h-12 w-full bg-white px-3 text-sm"
            >
              <option value="">Not Set</option>
              <option value="XO">XO</option>
              <option value="OX">OX</option>
              <option value="XOX">XOX</option>
              <option value="OXO">OXO</option>
              <option value="XXO">XXO</option>
              <option value="OXX">OXX</option>
            </select>
          </label>
        ) : null}

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{`Glass Type${required ? " *" : ""}`}</span>
            <input
              value={values.glassTypeDefault}
              onChange={(event) => onChange("glassTypeDefault", event.target.value)}
              className="ios-input h-12 w-full px-3 text-sm"
              placeholder="Tempered"
            />
          </label>
          {errors?.glassTypeDefault ? <p className="text-xs text-rose-600">{errors.glassTypeDefault}</p> : null}
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">Glass Coating</span>
          <input
            value={values.glassCoatingDefault}
            onChange={(event) => onChange("glassCoatingDefault", event.target.value)}
            className="ios-input h-12 w-full px-3 text-sm"
            placeholder="Low-E / None"
          />
        </label>

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{`Glass Thickness (mm)${required ? " *" : ""}`}</span>
            <input
              value={values.glassThicknessMmDefault}
              onChange={(event) => onChange("glassThicknessMmDefault", event.target.value)}
              className="ios-input h-12 w-full px-3 text-sm"
              placeholder="5"
            />
          </label>
          {errors?.glassThicknessMmDefault ? (
            <p className="text-xs text-rose-600">{errors.glassThicknessMmDefault}</p>
          ) : null}
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">Glass Finish</span>
          <input
            value={values.glassFinishDefault}
            onChange={(event) => onChange("glassFinishDefault", event.target.value)}
            className="ios-input h-12 w-full px-3 text-sm"
            placeholder="Clear / Frosted"
          />
        </label>

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{`Screen${required ? " *" : ""}`}</span>
            <input
              value={values.screenDefault}
              onChange={(event) => onChange("screenDefault", event.target.value)}
              className="ios-input h-12 w-full px-3 text-sm"
              placeholder="Full Screen / Half Screen / No Screen"
            />
          </label>
          {errors?.screenDefault ? <p className="text-xs text-rose-600">{errors.screenDefault}</p> : null}
        </div>
      </div>
    </div>
  );
}
