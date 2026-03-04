"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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

export function LineGlowOverlay({ data }: Props) {
  const reduced = usePrefersReducedMotion();
  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { revenuePath, ordersPath } = useMemo(() => {
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

    const revenuePoints: Point[] = safe.map((d, i) => ({
      x: MARGIN.left + (safe.length === 1 ? innerW / 2 : (i / (safe.length - 1)) * innerW),
      y: scaleLinear(d.revenue, revMin, revMax, MARGIN.top + innerH, MARGIN.top),
    }));
    const ordersPoints: Point[] = safe.map((d, i) => ({
      x: MARGIN.left + (safe.length === 1 ? innerW / 2 : (i / (safe.length - 1)) * innerW),
      y: scaleLinear(d.orders, ordMin, ordMax, MARGIN.top + innerH, MARGIN.top),
    }));
    return {
      revenuePath: toSmoothPath(revenuePoints),
      ordersPath: toSmoothPath(ordersPoints),
    };
  }, [data, innerH, innerW]);

  if (reduced) return null;

  const blueBandWidth = 150;
  const orangeBandWidth = 136;

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        <defs>
          <linearGradient id="sweepBlue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="45%" stopColor="white" stopOpacity="0.24" />
            <stop offset="50%" stopColor="white" stopOpacity="0.98" />
            <stop offset="55%" stopColor="white" stopOpacity="0.24" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sweepOrange" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="45%" stopColor="white" stopOpacity="0.24" />
            <stop offset="50%" stopColor="white" stopOpacity="0.96" />
            <stop offset="55%" stopColor="white" stopOpacity="0.24" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="maskBlue" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="black" />
            <motion.rect
              y="0"
              width={blueBandWidth}
              height={HEIGHT}
              fill="url(#sweepBlue)"
              initial={{ x: -blueBandWidth }}
              animate={{ x: WIDTH }}
              transition={{ duration: 7.6, repeat: Infinity, ease: "linear" }}
            />
          </mask>
          <mask id="maskOrange" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="black" />
            <motion.rect
              y="0"
              width={orangeBandWidth}
              height={HEIGHT}
              fill="url(#sweepOrange)"
              initial={{ x: -orangeBandWidth }}
              animate={{ x: WIDTH }}
              transition={{ duration: 9.4, repeat: Infinity, ease: "linear" }}
            />
          </mask>
        </defs>

        <path
          d={revenuePath}
          fill="none"
          stroke="rgba(59,130,246,0.95)"
          strokeWidth="3.6"
          strokeLinecap="round"
          mask="url(#maskBlue)"
          style={{ filter: "drop-shadow(0 2px 8px rgba(59,130,246,0.28)) drop-shadow(0 0 10px rgba(59,130,246,0.18))" }}
        />
        <path
          d={ordersPath}
          fill="none"
          stroke="rgba(245,158,11,0.95)"
          strokeWidth="3.3"
          strokeLinecap="round"
          mask="url(#maskOrange)"
          style={{ filter: "drop-shadow(0 2px 8px rgba(245,158,11,0.26)) drop-shadow(0 0 10px rgba(245,158,11,0.16))" }}
        />
      </svg>
    </div>
  );
}
