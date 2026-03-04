"use client";

import { useEffect, useMemo, useState } from "react";
import { ProgressBarShimmer } from "@/components/ProgressBarShimmer";
import { SparklineAnimated } from "@/components/SparklineAnimated";
import type { KpiItem } from "@/components/dashboard/dashboardMock";
import { CalendarDays, DollarSign, Lock, Search } from "lucide-react";

const accentMap = {
  blue: {
    color: "#3B82F6",
    iconBg: "linear-gradient(135deg, rgba(59,130,246,0.30), rgba(99,102,241,0.24))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.15))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(59,130,246,0.10),0_18px_45px_rgba(59,130,246,0.10)]",
  },
  orange: {
    color: "#F59E0B",
    iconBg: "linear-gradient(135deg, rgba(20,184,166,0.28), rgba(45,212,191,0.22))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.15))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(245,158,11,0.10),0_18px_45px_rgba(245,158,11,0.10)]",
  },
  green: {
    color: "#10B981",
    iconBg: "linear-gradient(135deg, rgba(16,185,129,0.30), rgba(52,211,153,0.24))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.15))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_18px_45px_rgba(16,185,129,0.10)]",
  },
  amber: {
    color: "#D97706",
    iconBg: "linear-gradient(135deg, rgba(37,99,235,0.28), rgba(14,165,233,0.24))",
    bg: "bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.15))]",
    hoverGlow: "hover:shadow-[0_0_0_1px_rgba(217,119,6,0.10),0_18px_45px_rgba(217,119,6,0.10)]",
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
      ? "#2563EB"
      : item.title === "Orders Today"
        ? "#0D9488"
        : item.title === "Payments Collected"
          ? "#16A34A"
          : "#2563EB";

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
          <p className="text-[12px] font-medium text-slate-500">{item.title}</p>
          <p className="mt-2.5 text-[31px] font-semibold leading-none tracking-tight text-slate-900">{displayValue}</p>
          <p className={`mt-2 text-[12px] font-semibold ${item.positive ? "text-emerald-600" : "text-rose-600"}`}>
            {item.delta} <span className="font-medium text-slate-500">vs yesterday</span>
          </p>
        </div>

        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
          style={{ background: accent.iconBg }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </span>
      </div>

      {item.sparkline ? (
        <div className="glass-card-content mt-2 h-14 w-full rounded-xl bg-white/55 px-2 py-1.5">
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

      {item.warning ? <p className="glass-card-content mt-3 border-t border-amber-200 border-dashed pt-2 text-xs font-medium text-amber-700">{item.warning}</p> : null}
    </article>
  );
}
