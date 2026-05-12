"use client";

import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { Calendar, RefreshCw } from "lucide-react";
import type { HistoryChartProps } from "./HistoryChart.types";

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
  return (
    <div className="rounded-xl px-3 py-2 text-xs space-y-1" style={{ background: "#1b1b1d", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p style={{ color: "#909097" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, fontWeight: 700 }}>
          {p.value} {p.name}
        </p>
      ))}
    </div>
  );
}

export function HistoryChart({ readings, loading, from, to, onFromChange, onToChange, onFetch }: HistoryChartProps) {
  const [tab, setTab] = useState<Tab>("spo2");
  const metric = METRICS.find((m) => m.key === tab)!;

  const data = readings.map((r) => ({
    time: new Date(r.ts).toLocaleString("en-GB", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    spo2: r.spo2,
    bpm: r.bpm,
    temperature: r.temperature,
    status: r.status,
  }));

  const inputStyle = {
    background: "#0e0e10",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#e4e2e4",
    borderRadius: "10px",
    padding: "6px 12px",
    fontSize: "12px",
    outline: "none",
  };

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" style={{ color: "#bec6e0" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>Health Trends</h3>
          {readings.length > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }}
            >
              {readings.length} readings
            </span>
          )}
        </div>

        {/* Date range controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} style={inputStyle} />
          <span style={{ color: "#45464d", fontSize: "12px" }}>to</span>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} style={inputStyle} />
          <button
            onClick={onFetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #4cd7f6, #03b5d3)",
              color: "#001f26",
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Fetch"}
          </button>
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1 mb-4">
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

      <motion.div
        key={tab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        style={{ height: 240 }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-t-transparent rounded-full"
              style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "#4cd7f6" }}
            />
            <p className="text-sm" style={{ color: "#45464d" }}>Loading history…</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm" style={{ color: "#45464d" }}>
              Select a date range and click Fetch to view history.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,70,77,0.4)" strokeOpacity={0.5} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#909097" }}
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
