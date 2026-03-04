"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useLiveSparkline } from "@/hooks/useLiveSparkline";

type SparklineAnimatedProps = {
  values: number[];
  color: string;
  id: string;
  intervalMs?: number;
  jitterPct?: number;
};

export function SparklineAnimated({
  values,
  color,
  id,
  intervalMs = 3200,
  jitterPct = 0.01,
}: SparklineAnimatedProps) {
  const { data, prefersReducedMotion } = useLiveSparkline(values, { intervalMs, jitterPct });
  const chartData = (data.length ? data : values).map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={`sparkline-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.78} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          className="dashboard-sparkline-wave"
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.2}
          fill={`url(#sparkline-${id})`}
          dot={false}
          isAnimationActive={!prefersReducedMotion}
          animationDuration={450}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
