"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Options = {
  intervalMs?: number;
  jitterPct?: number;
};

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

export function useLiveSparkline(baseData: number[], options: Options = {}) {
  const { intervalMs = 3200, jitterPct = 0.015 } = options;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [data, setData] = useState<number[]>(baseData);
  const baseRef = useRef<number[]>(baseData);

  useEffect(() => {
    baseRef.current = baseData;
    setData(baseData);
  }, [baseData]);

  const trendSign = useMemo(() => {
    if (baseRef.current.length < 2) return 1;
    const first = baseRef.current[0] ?? 0;
    const last = baseRef.current[baseRef.current.length - 1] ?? first;
    return last >= first ? 1 : -1;
  }, [baseData]);

  useEffect(() => {
    if (prefersReducedMotion || baseRef.current.length < 4) return;

    const id = window.setInterval(() => {
      setData((prev) => {
        if (prev.length < 4) return prev;
        const next = [...prev];
        const tailCount = Math.random() > 0.5 ? 2 : 1;
        const startIdx = Math.max(next.length - tailCount, 0);

        for (let i = startIdx; i < next.length; i += 1) {
          const base = next[i] ?? 0;
          const jitter = randomBetween(jitterPct * 0.4, jitterPct);
          const signedJitter = trendSign >= 0 ? jitter : -jitter;
          const proposed = base * (1 + signedJitter);
          const min = base * (1 - jitterPct);
          const max = base * (1 + jitterPct);
          next[i] = clamp(proposed, min, max);
        }

        const lastIdx = next.length - 1;
        const prevIdx = next.length - 2;
        if (trendSign >= 0 && next[lastIdx] < next[prevIdx]) {
          next[lastIdx] = next[prevIdx] * (1 + jitterPct * 0.35);
        }
        if (trendSign < 0 && next[lastIdx] > next[prevIdx]) {
          next[lastIdx] = next[prevIdx] * (1 - jitterPct * 0.35);
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, jitterPct, prefersReducedMotion, trendSign]);

  return { data, prefersReducedMotion };
}
