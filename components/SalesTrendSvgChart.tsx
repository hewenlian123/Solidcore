"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SalesTrendPoint } from "@/components/dashboard/dashboardMock";

type Props = {
  data: SalesTrendPoint[];
};

type Point = { x: number; y: number };

const WIDTH = 920;
const HEIGHT = 360;
const MARGIN = { top: 22, right: 56, bottom: 42, left: 56 };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function scaleLinear(value: number, d0: number, d1: number, r0: number, r1: number) {
  if (d0 === d1) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

function toSmoothPath(points: Point[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i !== points.length - 2 ? points[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function toAreaPath(linePath: string, points: Point[], baselineY: number) {
  if (!linePath || points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function buildTicks(min: number, max: number, count: number) {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function SalesTrendSvgChart({ data }: Props) {
  const reduced = usePrefersReducedMotion();
  const id = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baselineY = HEIGHT - MARGIN.bottom;

  const {
    revenuePoints,
    ordersPoints,
    revenuePath,
    ordersPath,
    revenueArea,
    ordersArea,
    xLabels,
    yLeftTicks,
    yRightTicks,
  } = useMemo(() => {
    const safe = data.length > 0 ? data : [{ day: "Mon", revenue: 0, orders: 0 }];
    const revVals = safe.map((d) => d.revenue);
    const ordVals = safe.map((d) => d.orders);

    const revMinRaw = Math.min(...revVals);
    const revMaxRaw = Math.max(...revVals);
    const ordMinRaw = Math.min(...ordVals);
    const ordMaxRaw = Math.max(...ordVals);

    const revPad = Math.max(1, (revMaxRaw - revMinRaw) * 0.14);
    const ordPad = Math.max(1, (ordMaxRaw - ordMinRaw) * 0.14);

    const revMin = Math.max(0, revMinRaw - revPad);
    const revMax = revMaxRaw + revPad;
    const ordMin = Math.max(0, ordMinRaw - ordPad);
    const ordMax = ordMaxRaw + ordPad;

    const revenuePts: Point[] = safe.map((d, i) => ({
      x: MARGIN.left + (safe.length === 1 ? innerW / 2 : (i / (safe.length - 1)) * innerW),
      y: scaleLinear(d.revenue, revMin, revMax, MARGIN.top + innerH, MARGIN.top),
    }));
    const ordersPts: Point[] = safe.map((d, i) => ({
      x: MARGIN.left + (safe.length === 1 ? innerW / 2 : (i / (safe.length - 1)) * innerW),
      y: scaleLinear(d.orders, ordMin, ordMax, MARGIN.top + innerH, MARGIN.top),
    }));

    const revPath = toSmoothPath(revenuePts);
    const ordPath = toSmoothPath(ordersPts);
    return {
      revenuePoints: revenuePts,
      ordersPoints: ordersPts,
      revenuePath: revPath,
      ordersPath: ordPath,
      revenueArea: toAreaPath(revPath, revenuePts, baselineY),
      ordersArea: toAreaPath(ordPath, ordersPts, baselineY),
      xLabels: safe.map((d) => d.day),
      yLeftTicks: buildTicks(revMin, revMax, 5),
      yRightTicks: buildTicks(ordMin, ordMax, 5),
    };
  }, [data, baselineY, innerH, innerW]);

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>) => {
    if (!rootRef.current || xLabels.length === 0) return;
    const rect = rootRef.current.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const chartLeft = MARGIN.left * (rect.width / WIDTH);
    const chartRight = (WIDTH - MARGIN.right) * (rect.width / WIDTH);
    const span = Math.max(1, chartRight - chartLeft);
    const ratio = Math.min(1, Math.max(0, (relativeX - chartLeft) / span));
    const idx = Math.round(ratio * (xLabels.length - 1));
    setHoverIndex(idx);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setHoverIndex(null);
  };

  const tooltipData =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length
      ? {
          day: data[hoverIndex].day,
          revenue: data[hoverIndex].revenue,
          orders: data[hoverIndex].orders,
          x: revenuePoints[hoverIndex]?.x ?? 0,
          y: Math.min(revenuePoints[hoverIndex]?.y ?? baselineY, ordersPoints[hoverIndex]?.y ?? baselineY),
        }
      : null;

  return (
    <div ref={rootRef} className="relative h-full w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        <defs>
          <linearGradient id={`revenueFill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`ordersFill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yLeftTicks.map((tick) => {
          const y = scaleLinear(tick, yLeftTicks[0], yLeftTicks[yLeftTicks.length - 1], baselineY, MARGIN.top);
          return (
            <line
              key={`grid-${tick}`}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y}
              y2={y}
              stroke="rgba(15,23,42,0.06)"
              strokeDasharray="4 4"
            />
          );
        })}

        {xLabels.map((label, i) => {
          const x = revenuePoints[i]?.x ?? 0;
          return (
            <text key={`${label}-${i}`} x={x} y={HEIGHT - 16} textAnchor="middle" fill="#64748B" fontSize="12">
              {label}
            </text>
          );
        })}

        {yLeftTicks.map((tick, i) => {
          const y = scaleLinear(tick, yLeftTicks[0], yLeftTicks[yLeftTicks.length - 1], baselineY, MARGIN.top);
          return (
            <text key={`left-${i}`} x={12} y={y + 4} fill="#64748B" fontSize="12">
              ${Math.round(tick / 1000)}k
            </text>
          );
        })}

        {yRightTicks.map((tick, i) => {
          const y = scaleLinear(tick, yRightTicks[0], yRightTicks[yRightTicks.length - 1], baselineY, MARGIN.top);
          return (
            <text key={`right-${i}`} x={WIDTH - MARGIN.right + 10} y={y + 4} fill="#94A3B8" fontSize="12">
              {Math.round(tick)}
            </text>
          );
        })}

        <motion.path
          d={revenueArea}
          fill={`url(#revenueFill-${id})`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={reduced ? { opacity: 0.12 } : { opacity: [0.1, 0.16, 0.1] }}
          transition={reduced ? { duration: 0.45, delay: 0.12, ease: "easeOut" } : { duration: 7, delay: 0.2, ease: "easeInOut", repeat: Infinity }}
          style={!reduced && hovered ? { opacity: 0.18 } : undefined}
        />
        <motion.path
          d={ordersArea}
          fill={`url(#ordersFill-${id})`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={reduced ? { opacity: 0.12 } : { opacity: [0.1, 0.15, 0.1] }}
          transition={reduced ? { duration: 0.45, delay: 0.14, ease: "easeOut" } : { duration: 7.4, delay: 0.24, ease: "easeInOut", repeat: Infinity }}
          style={!reduced && hovered ? { opacity: 0.17 } : undefined}
        />

        <motion.path
          d={revenuePath}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2.8"
          strokeLinecap="round"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut" }}
          style={!reduced && hovered ? { filter: "drop-shadow(0 6px 18px rgba(59,130,246,0.22))" } : undefined}
        />

        <motion.path
          d={ordersPath}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="2.4"
          strokeLinecap="round"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut" }}
          style={!reduced && hovered ? { filter: "drop-shadow(0 6px 18px rgba(245,158,11,0.20))" } : undefined}
        />

        {tooltipData ? (
          <line
            x1={tooltipData.x}
            x2={tooltipData.x}
            y1={MARGIN.top}
            y2={baselineY}
            stroke="rgba(15,23,42,0.12)"
            strokeDasharray="3 4"
          />
        ) : null}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </svg>

      {tooltipData ? (
        <motion.div
          className="pointer-events-none absolute z-20 min-w-[150px] rounded-xl border border-white/55 bg-[rgba(255,255,255,0.72)] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.10),0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur-[14px]"
          style={{
            left: `${(tooltipData.x / WIDTH) * 100}%`,
            top: `${Math.max(6, ((tooltipData.y - 58) / HEIGHT) * 100)}%`,
            transform: "translate(-50%, -100%)",
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <p className="text-[12px] font-semibold text-slate-800">{tooltipData.day}</p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-5 text-[12px] text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Revenue
              </span>
              <span className="font-semibold">${tooltipData.revenue.toLocaleString("en-US")}</span>
            </div>
            <div className="flex items-center justify-between gap-5 text-[12px] text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Orders
              </span>
              <span className="font-semibold">{tooltipData.orders.toLocaleString("en-US")}</span>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
