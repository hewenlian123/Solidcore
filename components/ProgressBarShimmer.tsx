"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type ProgressBarShimmerProps = {
  value: number;
  colorClassName?: string;
};

export function ProgressBarShimmer({ value, colorClassName = "bg-emerald-500" }: ProgressBarShimmerProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
      <motion.div
        className={`relative h-1.5 rounded-full ${colorClassName}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={reducedMotion ? { duration: 0.35, ease: "easeOut" } : { duration: 1, ease: "easeOut" }}
      >
        {!reducedMotion ? (
          <>
            <span className="dashboard-shimmer-primary" />
            <span className="dashboard-shimmer-secondary" />
          </>
        ) : null}
      </motion.div>
    </div>
  );
}
