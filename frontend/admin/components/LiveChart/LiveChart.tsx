"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { prepareChartData, computeAlertRanges } from "./LiveChart.hooks";
import type { LiveChartProps } from "./LiveChart.types";

// Canvas/DOM APIs are unavailable during SSR — load ECharts client-side only
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Tab = "spo2" | "bpm" | "temperature";

interface MetricConfig {
  key: Tab;
  label: string;
  unit: string;
  color: string;
  yMin: number | undefined;
  yMax: number | undefined;
}

const METRICS: MetricConfig[] = [
  { key: "spo2",        label: "SpO₂",       unit: "%",   color: "#4cd7f6", yMin: 85,        yMax: 100       },
  { key: "bpm",         label: "Heart Rate",  unit: "bpm", color: "#bec6e0", yMin: undefined,  yMax: undefined },
  { key: "temperature", label: "Temperature", unit: "°C",  color: "#f97316", yMin: 34,        yMax: 40        },
];

const MARK_AREA_STYLE = {
  silent: true, // purely passive — no mouse events captured
  itemStyle: {
    color: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  label: {
    show: true,
    position: "insideTopLeft",
    formatter: "⚠️ Anomaly Detected",
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "bold",
  },
} as const;

export function LiveChart({ readings }: LiveChartProps) {
  const [tab, setTab] = useState<Tab>("spo2");

  // metric used outside the memo for tab-button styling
  const metric = METRICS.find((m) => m.key === tab)!;

  const option = useMemo(() => {
    const m = METRICS.find((mm) => mm.key === tab)!;
    const chartData = prepareChartData(readings);
    const alertRanges = computeAlertRanges(readings);

    const times = chartData.map((d) => d.time);
    const values = chartData.map((d) => d[tab] as number);

    return {
      animation: false,
      grid: { top: 8, right: 8, bottom: 24, left: 0, containLabel: true },
      xAxis: {
        type: "category",
        data: times,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#909097", fontSize: 10, interval: "auto" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: m.yMin,
        max: m.yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#909097", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(69,70,77,0.4)", type: "dashed" } },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1b1b1d",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        textStyle: { color: "#909097", fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p) return "";
          return `<div style="color:#909097;margin-bottom:2px">${p.axisValue}</div>`
            + `<div style="color:${p.color};font-weight:700">${p.value} ${m.unit}</div>`;
        },
      },
      series: [
        {
          type: "line",
          data: values,
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: m.color,
            width: 2,
            shadowColor: m.color,
            shadowBlur: 4,
          },
          markArea: {
            ...MARK_AREA_STYLE,
            // Each pair pins to the exact category tick strings that existed when
            // the anomaly was recorded — coordinates are stable as new ticks arrive
            data: alertRanges.map(([start, end]) => [
              { xAxis: start },
              { xAxis: end },
            ]),
          },
        },
      ],
    };
  }, [readings, tab]);

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
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
          <ReactECharts
            option={option}
            style={{ height: "200px", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge
          />
        )}
      </motion.div>
    </div>
  );
}
