"use client";

import { useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LaserGlintOverlay } from "@/components/charts/LaserGlintOverlay";
import type { SalesTrendPoint } from "@/components/dashboard/dashboardMock";

type Mode = "revenue" | "orders";

function SalesTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const revenue = Number(payload.find((p) => p.dataKey === "revenue")?.value ?? 0);
  const orders = Number(payload.find((p) => p.dataKey === "orders")?.value ?? 0);

  return (
    <div
      className="min-w-[156px] rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-3 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
      style={{ animation: "dashboardTooltipAppear 180ms ease-out" }}
    >
      <p className="text-[12px] font-semibold text-white">{label}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-5 text-[12px] txt-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/50" />
            Revenue
          </span>
          <span className="font-semibold text-white">${revenue.toLocaleString("en-US")}</span>
        </div>
        <div className="flex items-center justify-between gap-5 text-[12px] txt-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Orders
          </span>
          <span className="font-semibold text-white">{orders.toLocaleString("en-US")}</span>
        </div>
      </div>
    </div>
  );
}

export function SalesTrendCard({ data }: { data: SalesTrendPoint[] }) {
  const [mode, setMode] = useState<Mode>("revenue");
  const chartData = data.length > 0 ? data : [{ day: "Mon", revenue: 0, orders: 0 }];
  const chartContainerRef = useRef<HTMLDivElement>(null);

  return (
    <article className="glass-card glass-card-strong px-6 py-5">
      <div className="glass-card-content mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-[19px] font-semibold text-white">Sales Trend</h3>
          <p className="text-xs txt-secondary">Revenue & Orders</p>
        </div>
        <div className="inline-flex rounded-full border border-white/[0.1] bg-white/[0.06] p-1">
          <button
            type="button"
            onClick={() => setMode("revenue")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.97] ${mode === "revenue" ? "bg-white/[0.06] text-white border border-white/[0.10]" : "text-white/60 hover:bg-white/[0.04]"}`}
          >
            Revenue
          </button>
          <button
            type="button"
            onClick={() => setMode("orders")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.97] ${mode === "orders" ? "bg-white/[0.06] text-white border border-white/[0.10]" : "text-white/60 hover:bg-white/[0.04]"}`}
          >
            Orders
          </button>
        </div>
      </div>

      <div ref={chartContainerRef} className="glass-card-content relative min-h-[220px] h-[300px]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <span className="absolute left-[12%] top-[74%] h-2.5 w-2.5 rounded-full bg-blue-200/40 blur-[8px]" />
          <span className="absolute left-[22%] top-[26%] h-2 w-2 rounded-full bg-blue-100/35 blur-[10px]" />
          <span className="absolute left-[38%] top-[58%] h-2.5 w-2.5 rounded-full bg-indigo-200/35 blur-[12px]" />
          <span className="absolute left-[55%] top-[22%] h-2 w-2 rounded-full bg-amber-100/40 blur-[10px]" />
          <span className="absolute left-[68%] top-[68%] h-3 w-3 rounded-full bg-blue-100/35 blur-[12px]" />
          <span className="absolute left-[79%] top-[46%] h-2.5 w-2.5 rounded-full bg-amber-200/35 blur-[10px]" />
          <span className="absolute left-[86%] top-[18%] h-2 w-2 rounded-full bg-blue-100/35 blur-[9px]" />
        </div>
        <ResponsiveContainer width="100%" height={220} minHeight={220}>
          <AreaChart key={`trend-${mode}`} data={chartData} margin={{ left: 2, right: 2, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="trendBlueAiryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(59,130,246,0.25)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0)" />
              </linearGradient>
              <linearGradient id="trendOrangeAiryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(245,158,11,0.22)" />
                <stop offset="100%" stopColor="rgba(245,158,11,0)" />
              </linearGradient>
              <filter id="trendBlueGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(59,130,246,0.30)" />
              </filter>
              <filter id="trendOrangeGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(245,158,11,0.30)" />
              </filter>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
              tickFormatter={(v) => `$${Number(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "3 4" }}
              wrapperStyle={{ outline: "none" }}
              content={<SalesTrendTooltip />}
            />

            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              stroke="transparent"
              fill="url(#trendBlueAiryFill)"
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              stroke="transparent"
              fill="url(#trendOrangeAiryFill)"
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
            />

            <Line
              className="trend-revenue-line"
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              stroke="#3B82F6"
              strokeWidth={3}
              opacity={1}
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
              dot={false}
              activeDot={({ cx, cy }) =>
                cx !== undefined && cy !== undefined ? (
                  <g filter="url(#trendBlueGlow)">
                    <circle cx={cx} cy={cy} r={5} fill="white" stroke="#3B82F6" strokeWidth={2} />
                  </g>
                ) : null
              }
            />

            <Line
              className="trend-orders-line"
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              stroke="#F59E0B"
              strokeWidth={3}
              opacity={1}
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
              dot={false}
              activeDot={({ cx, cy }) =>
                cx !== undefined && cy !== undefined ? (
                  <g filter="url(#trendOrangeGlow)">
                    <circle cx={cx} cy={cy} r={5} fill="white" stroke="#F59E0B" strokeWidth={2} />
                  </g>
                ) : null
              }
            />
          </AreaChart>
        </ResponsiveContainer>
        <LaserGlintOverlay
          chartContainerRef={chartContainerRef}
          revenueLineSelector=".trend-revenue-line"
          ordersLineSelector=".trend-orders-line"
          syncKey={`trend-${mode}-${chartData.length}`}
        />
      </div>

      <div className="glass-card-content mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.08] pt-4">
        <div>
          <p className="text-xs txt-secondary">Total Revenue</p>
          <p className="mt-1 text-sm font-semibold text-white">$254,800</p>
        </div>
        <div>
          <p className="text-xs txt-secondary">Orders</p>
          <p className="mt-1 text-sm font-semibold text-white">1,248</p>
        </div>
        <div>
          <p className="text-xs txt-secondary">Avg. Order</p>
          <p className="mt-1 text-sm font-semibold text-white">$204.3</p>
        </div>
      </div>
    </article>
  );
}
