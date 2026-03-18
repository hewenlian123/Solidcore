"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import type { RegionRow } from "@/components/dashboard/dashboardMock";

type ActiveShapeProps = {
  index?: number;
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  activeIndex?: number | null;
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

function renderShape(props: ActiveShapeProps) {
  const {
    index = 0,
    cx = 0,
    cy = 0,
    innerRadius = 50,
    outerRadius = 72,
    startAngle = 0,
    endAngle = 0,
    fill = "#3B82F6",
    activeIndex = null,
  } = props;
  const isActive = activeIndex === index;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={isActive ? outerRadius + 6 : outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: isActive ? "brightness(1.06)" : undefined }}
      />
    </g>
  );
}

export function SalesByRegionCard({ rows }: { rows: RegionRow[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const centerLabel = useMemo(() => {
    if (activeIndex === null || activeIndex < 0 || activeIndex >= rows.length) {
      return { title: "Total", value: `${total}%` };
    }
    return { title: rows[activeIndex].region, value: `${rows[activeIndex].value}%` };
  }, [activeIndex, rows, total]);

  return (
    <article className="glass-card glass-card-moderate px-5 py-5">
      <h3 className="glass-card-content text-[19px] font-semibold text-white">Sales by Region</h3>
      <div className="glass-card-content mt-3 flex items-center gap-4">
        <motion.div
          className="relative min-h-[176px] h-[176px] min-w-[176px] w-[176px] shrink-0"
          animate={reducedMotion ? undefined : { scale: [1, 1.015, 1] }}
          transition={reducedMotion ? undefined : { duration: 7.2, ease: "easeInOut", repeat: Infinity }}
        >
          <ResponsiveContainer width="100%" height={176} minHeight={176} minWidth={176}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="region"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={2}
                cornerRadius={6}
                isAnimationActive={!reducedMotion}
                animationDuration={1400}
                animationEasing="ease-out"
                animationBegin={150}
                shape={(props) => renderShape({ ...(props as ActiveShapeProps), activeIndex })}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {rows.map((entry) => (
                  <Cell key={entry.region} fill={entry.color} fillOpacity={activeIndex === null || activeIndex === rows.findIndex((r) => r.region === entry.region) ? 1 : 0.9} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div
              className="rounded-full bg-white/[0.08] px-3 py-1.5 text-center backdrop-blur-sm border border-white/[0.1]"
              animate={reducedMotion ? undefined : { scale: [1, 1.03, 1] }}
              transition={reducedMotion ? undefined : { duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            >
              <p className="text-[11px] text-slate-400">{centerLabel.title}</p>
              <p className="text-[17px] font-semibold text-white">{centerLabel.value}</p>
            </motion.div>
          </div>
        </motion.div>
        <div className="w-full space-y-2">
          {rows.map((row) => (
            <div key={row.region} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                {row.region}
              </div>
              <span className="font-medium text-white">{row.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
