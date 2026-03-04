"use client";

import { RefObject, useEffect, useMemo, useState } from "react";

type LaserGlintOverlayProps = {
  chartContainerRef: RefObject<HTMLDivElement | null>;
  revenueLineSelector: string;
  ordersLineSelector: string;
  syncKey?: string;
};

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

function toNumber(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function LaserGlintOverlay({
  chartContainerRef,
  revenueLineSelector,
  ordersLineSelector,
  syncKey,
}: LaserGlintOverlayProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [revenueD, setRevenueD] = useState("");
  const [ordersD, setOrdersD] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = chartContainerRef.current;
    if (!host) return;

    const updatePaths = () => {
      const revenuePath = host.querySelector<SVGPathElement>(`${revenueLineSelector} .recharts-line-curve`);
      const ordersPath = host.querySelector<SVGPathElement>(`${ordersLineSelector} .recharts-line-curve`);
      const surface = host.querySelector<SVGSVGElement>("svg.recharts-surface");
      const width = toNumber(surface?.getAttribute("width")) || host.clientWidth;
      const height = toNumber(surface?.getAttribute("height")) || host.clientHeight;
      setRevenueD(revenuePath?.getAttribute("d") ?? "");
      setOrdersD(ordersPath?.getAttribute("d") ?? "");
      setSize({ width, height });
    };

    updatePaths();
    const raf = requestAnimationFrame(updatePaths);
    const observer = new ResizeObserver(() => updatePaths());
    observer.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [chartContainerRef, revenueLineSelector, ordersLineSelector, syncKey]);

  const bandWidth = useMemo(() => {
    if (!size.width) return 160;
    return Math.max(140, Math.min(190, size.width * 0.17));
  }, [size.width]);

  if (reducedMotion || !size.width || !size.height || !revenueD || !ordersD) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="laserSweepBlue" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="40%" stopColor="white" stopOpacity="0.2" />
          <stop offset="50%" stopColor="white" stopOpacity="0.96" />
          <stop offset="60%" stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="laserSweepOrange" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="40%" stopColor="white" stopOpacity="0.18" />
          <stop offset="50%" stopColor="white" stopOpacity="0.92" />
          <stop offset="60%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="laserMaskBlue" maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width={size.width} height={size.height} fill="black" />
          <rect x={-bandWidth} y="0" width={bandWidth} height={size.height} fill="url(#laserSweepBlue)">
            <animate
              attributeName="x"
              from={String(-bandWidth)}
              to={String(size.width + bandWidth)}
              dur="7.5s"
              repeatCount="indefinite"
            />
          </rect>
        </mask>
        <mask id="laserMaskOrange" maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width={size.width} height={size.height} fill="black" />
          <rect x={-bandWidth} y="0" width={bandWidth} height={size.height} fill="url(#laserSweepOrange)">
            <animate
              attributeName="x"
              from={String(-bandWidth)}
              to={String(size.width + bandWidth)}
              dur="9.5s"
              repeatCount="indefinite"
            />
          </rect>
        </mask>
      </defs>

      <path
        d={revenueD}
        fill="none"
        stroke="rgba(59,130,246,0.95)"
        strokeWidth="3.8"
        strokeLinecap="round"
        mask="url(#laserMaskBlue)"
        style={{ filter: "drop-shadow(0 0 10px rgba(59,130,246,0.25))" }}
      />
      <path
        d={ordersD}
        fill="none"
        stroke="rgba(245,158,11,0.92)"
        strokeWidth="3.8"
        strokeLinecap="round"
        mask="url(#laserMaskOrange)"
        style={{ filter: "drop-shadow(0 0 10px rgba(245,158,11,0.25))" }}
      />
    </svg>
  );
}

