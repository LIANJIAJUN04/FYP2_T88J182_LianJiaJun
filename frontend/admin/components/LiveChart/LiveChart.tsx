"use client";

import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { prepareChartData } from "./LiveChart.hooks";
import type { LiveChartProps } from "./LiveChart.types";

type Tab = "spo2" | "bpm" | "temperature";

const METRICS: {
  key: Tab;
  label: string;
  unit: string;
  color: string;
  domain: [number | "auto", number | "auto"];
}[] = [
  { key: "spo2",        label: "SpO₂",       unit: "%",   color: "#06b6d4", domain: [85, 100] },
  { key: "bpm",         label: "Heart Rate",  unit: "bpm", color: "#818cf8", domain: ["auto", "auto"] },
  { key: "temperature", label: "Temperature", unit: "°C",  color: "#f97316", domain: [34, 40] },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "#0c1524", border: "1px solid #1e3a5f" }}>
      <p style={{ color: "#64748b" }}>{label}</p>
      <p style={{ color: p.color, fontWeight: 700 }}>{p.value} {p.name}</p>
    </div>
  );
}

export function LiveChart({ readings }: LiveChartProps) {
  const [tab, setTab] = useState<Tab>("spo2");
  const data = prepareChartData(readings);
  const metric = METRICS.find((m) => m.key === tab)!;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "linear-gradient(145deg, #0c1524, #0f1e38)", border: "1.5px solid #1e3a5f" }}
    >
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full blink-dot" style={{ background: "#22c55e" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#94a3b8" }}>Live Vitals</h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "#22c55e18", color: "#22c55e" }}
          >
            {readings.length} pts
          </span>
        </div>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setTab(m.key)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
              style={
                tab === m.key
                  ? { background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44` }
                  : { background: "transparent", color: "#475569", border: "1px solid transparent" }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        style={{ height: 200 }}
      >
        {readings.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm" style={{ color: "#334155" }}>Waiting for readings…</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" strokeOpacity={0.5} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={metric.domain}
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={tab}
                stroke={metric.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: metric.color }}
                isAnimationActive={false}
                name={metric.unit}
                style={{ filter: `drop-shadow(0 0 4px ${metric.color})` }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>
    </div>
  );
}
