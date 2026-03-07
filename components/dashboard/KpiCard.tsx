"use client";

import { useEffect, useMemo, useState } from "react";
import { ProgressBarShimmer } from "@/components/ProgressBarShimmer";
import { SparklineAnimated } from "@/components/SparklineAnimated";
import type { KpiItem } from "@/components/dashboard/dashboardMock";
import { CalendarDays, DollarSign, Lock, Search } from "lucide-react";

const accentMap = {
  blue: {
    color: "#94a3b8",
    iconBg: "linear-gradient(135deg, rgba(100,116,139,0.35), rgba(71,85,105,0.3))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(148,163,184,0.15),0_18px_45px_rgba(0,0,0,0.25)]",
  },
  orange: {
    color: "#fbbf24",
    iconBg: "linear-gradient(135deg, rgba(148,163,184,0.3), rgba(100,116,139,0.25))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_18px_45px_rgba(0,0,0,0.25)]",
  },
  green: {
    color: "#34d399",
    iconBg: "linear-gradient(135deg, rgba(100,116,139,0.35), rgba(71,85,105,0.3))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(52,211,153,0.15),0_18px_45px_rgba(0,0,0,0.25)]",
  },
  amber: {
    color: "#f59e0b",
    iconBg: "linear-gradient(135deg, rgba(148,163,184,0.3), rgba(100,116,139,0.25))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_18px_45px_rgba(0,0,0,0.25)]",
  },
};

const COUNT_UP_MS = 1500;

function parseDisplayNumber(raw: string) {
  const match = raw.match(/-?[\d,.]+(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;
  const numeric = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const decimals = match[0].includes(".") ? match[0].split(".")[1].length : 0;
  return {
    prefix: raw.slice(0, match.index),
    suffix: raw.slice(match.index + match[0].length),
    value: numeric,
    decimals,
  };
}

export function KpiCard({ item }: { item: KpiItem }) {
  const accent = accentMap[item.accent];
  const parsed = useMemo(() => parseDisplayNumber(item.value), [item.value]);
  const [displayValue, setDisplayValue] = useState(item.value);
  const Icon =
    item.title === "Today Sales"
      ? DollarSign
      : item.title === "Orders Today"
        ? CalendarDays
        : item.title === "Payments Collected"
          ? Search
          : Lock;
  const iconColor =
    item.title === "Today Sales"
      ? "#94a3b8"
      : item.title === "Orders Today"
        ? "#94a3b8"
        : item.title === "Payments Collected"
          ? "#34d399"
          : "#94a3b8";

  useEffect(() => {
    if (!parsed) {
      setDisplayValue(item.value);
      return;
    }
    const formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: parsed.decimals,
      maximumFractionDigits: parsed.decimals,
    });
    const startedAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = parsed.value * eased;
      setDisplayValue(`${parsed.prefix}${formatter.format(current)}${parsed.suffix}`);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [item.value, parsed]);

  return (
    <article
      className={`glass-card glass-card-strong ${accent.bg} px-5 py-4 ${accent.hoverGlow}`}
    >
      <div className="glass-card-content flex items-start justify-between gap-3">
        <div className="min-h-[88px]">
          <p className="text-[12px] font-medium txt-muted">{item.title}</p>
          <p className="mt-2.5 text-[31px] font-semibold leading-none tracking-tight text-white">{displayValue}</p>
          <p className={`mt-2 text-[12px] font-semibold ${item.positive ? "text-emerald-400" : "text-rose-400"}`}>
            {item.delta} <span className="font-medium txt-disabled">vs yesterday</span>
          </p>
        </div>

        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          style={{ background: accent.iconBg }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </span>
      </div>

      {item.sparkline ? (
        <div className="glass-card-content mt-2 h-14 w-full rounded-xl bg-white/[0.05] px-2 py-1.5 border border-white/[0.06]">
          <SparklineAnimated
            id={item.title.replace(/\s+/g, "-").toLowerCase()}
            values={item.sparkline}
            color={accent.color}
            intervalMs={3200}
            jitterPct={0.01}
          />
        </div>
      ) : null}

      {typeof item.progress === "number" ? (
        <div className="glass-card-content">
          <ProgressBarShimmer value={item.progress} colorClassName={item.accent === "amber" ? "bg-amber-500" : "bg-emerald-500"} />
        </div>
      ) : null}

      {item.warning ? <p className="glass-card-content mt-3 border-t border-amber-500/30 border-dashed pt-2 text-xs font-medium text-amber-400">{item.warning}</p> : null}
    </article>
  );
}
