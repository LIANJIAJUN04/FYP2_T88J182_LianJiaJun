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
  { key: "spo2",        label: "SpO₂",       unit: "%",   color: "#4cd7f6", domain: [85, 100] },
  { key: "bpm",         label: "Heart Rate",  unit: "bpm", color: "#bec6e0", domain: ["auto", "auto"] },
  { key: "temperature", label: "Temperature", unit: "°C",  color: "#f97316", domain: [34, 40] },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "#1b1b1d", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p style={{ color: "#909097" }}>{label}</p>
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
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
    >
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full blink-dot" style={{ background: "#22c55e" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>Live Vitals</h3>
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
                  : { background: "transparent", color: "#909097", border: "1px solid transparent" }
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
            <p className="text-sm" style={{ color: "#45464d" }}>Waiting for readings…</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,70,77,0.4)" strokeOpacity={0.5} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#909097" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={metric.domain}
                tick={{ fontSize: 10, fill: "#909097" }}
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
