"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Calendar, RefreshCw, Download } from "lucide-react";
import type { HistoryChartProps } from "./HistoryChart.types";
import type { Reading } from "@/lib/api";

// Dynamic import so ECharts (canvas/DOM) never runs during SSR
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Tab = "spo2" | "bpm" | "temperature";

interface MetricConfig {
  key: Tab;
  label: string;
  unit: string;
  color: string;
  min: number;
  max: number;
}

const METRICS: MetricConfig[] = [
  { key: "spo2",        label: "SpO₂",       unit: "%",   color: "#4cd7f6", min: 85,  max: 100 },
  { key: "bpm",         label: "Heart Rate",  unit: "bpm", color: "#bec6e0", min: 30,  max: 160 },
  { key: "temperature", label: "Temperature", unit: "°C",  color: "#f97316", min: 34,  max: 40  },
];

const INPUT_STYLE: React.CSSProperties = {
  background: "#0e0e10",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e4e2e4",
  borderRadius: "10px",
  padding: "6px 12px",
  fontSize: "12px",
  outline: "none",
};

export function HistoryChart({
  patientId,
  readings,
  loading,
  from,
  to,
  onFromChange,
  onToChange,
  onFetch,
  highlight,
  onMarkAreaClick,
  abnormalSegments = [],
}: HistoryChartProps) {
  const [tab, setTab] = useState<Tab>("spo2");
  const metric = METRICS.find((m) => m.key === tab)!;

  // Auto-switch to the alerted metric when Check is clicked
  useEffect(() => {
    if (!highlight?.metric) return;
    const m = highlight.metric as Tab;
    if (METRICS.some((x) => x.key === m)) setTab(m);
  }, [highlight]);

  // Full dataset as [timestamp_ms, value] — ECharts time axis handles these natively
  const allData = useMemo(
    () => readings.map((r): [number, number] => [new Date(r.ts).getTime(), r[tab]]),
    [readings, tab],
  );

  // Alert-window overlay: data inside the window, null outside.
  // null values break the line so only the abnormal segment renders in red.
  const alertData = useMemo((): [number, number | null][] => {
    if (!highlight) return [];
    return readings.map((r): [number, number | null] => {
      const ts = new Date(r.ts).getTime();
      return [ts, ts >= highlight.startTs && ts <= highlight.endTs ? r[tab] : null];
    });
  }, [readings, tab, highlight]);

  // Only show the alert visuals when at least one data point falls inside the window
  const hasAlert = highlight != null && alertData.some((d) => d[1] !== null);

  // Export the currently loaded readings for the active tab as a CSV download
  function handleExportCSV() {
    if (readings.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const filename = `MediSync_Patient_${patientId}_${today}.csv`;
    const header = '"Timestamp","Metric Value"';
    const rows = readings
      .map((r: Reading) => `"${new Date(r.ts).toISOString()}","${r[tab]}"`)
      .join("\n");
    const csv = `${header}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── ECharts option ────────────────────────────────────────────────────────
  const option = useMemo(() => {
    // markArea: semi-transparent red band from startTs to endTs
    const clickable = hasAlert && !!onMarkAreaClick;
    const markArea =
      hasAlert && highlight
        ? {
            silent: !clickable,
            itemStyle: {
              color: "rgba(239,68,68,0.14)",
              borderColor: "rgba(239,68,68,0.55)",
              borderWidth: 1,
              borderType: "solid" as const,
              ...(clickable ? { cursor: "pointer" } : {}),
            },
            label: {
              show: true,
              position: "insideTopLeft" as const,
              color: "#f87171",
              fontSize: 10,
              fontWeight: 700,
              formatter: clickable
                ? "⚠ Abnormal Detection  ·  Click to analyze"
                : "⚠ Abnormal Detection",
              backgroundColor: "rgba(239,68,68,0.12)",
              padding: [3, 7] as [number, number],
              borderRadius: 4,
            },
            // Both endpoints are raw ms timestamps — works regardless of data density
            data: [[{ xAxis: highlight.startTs }, { xAxis: highlight.endTs }]],
          }
        : undefined;

    // Backend-supplied anomalous segments — always silent, labeled with reason
    const segmentsMarkArea =
      abnormalSegments.length > 0
        ? {
            silent: true,
            itemStyle: {
              color: "rgba(239,68,68,0.15)",
              borderColor: "rgba(239,68,68,0.35)",
              borderWidth: 1,
              borderType: "dashed" as const,
            },
            label: {
              show: true,
              position: "insideTopLeft" as const,
              color: "#f87171",
              fontSize: 10,
              fontWeight: 700,
              // {b} resolves to the `name` property set on each start-coordinate
              formatter: "{b}",
              backgroundColor: "rgba(239,68,68,0.10)",
              padding: [3, 7] as [number, number],
              borderRadius: 4,
            },
            data: abnormalSegments.map((seg) => [
              {
                xAxis: new Date(seg.startTime).getTime(),
                name: seg.reason,
              },
              { xAxis: new Date(seg.endTime).getTime() },
            ]),
          }
        : undefined;

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { top: 16, right: 24, bottom: 68, left: 52 },

      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "#1b1b1d",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        textStyle: { color: "#e4e2e4", fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter(params: any[]) {
          const p = params.find(
            (x) => Array.isArray(x.value) && x.value[1] != null,
          ) ?? params[0];
          if (!p) return "";
          const ts = new Date(p.value[0] as number).toLocaleString("en-GB", {
            day: "numeric", month: "short",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          });
          const val = p.value[1] as number | null;
          return (
            `<div style="font-size:10px;color:#909097;margin-bottom:4px">${ts}</div>` +
            `<div style="font-weight:700;color:${metric.color}">${val != null ? val : "—"} ${metric.unit}</div>`
          );
        },
      },

      xAxis: {
        type: "time" as const,
        axisLabel: {
          fontSize: 9,
          color: "#909097",
          hideOverlap: true,
          formatter(val: number) {
            return new Date(val).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            });
          },
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },

      yAxis: {
        type: "value" as const,
        scale: true,
        min: (value: { min: number }) =>
          isFinite(value.min) ? Math.floor(value.min) - 2 : metric.min,
        max: (value: { max: number }) =>
          isFinite(value.max) ? Math.ceil(value.max) + 2 : metric.max,
        axisLabel: { fontSize: 10, color: "#909097" },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "rgba(69,70,77,0.4)", type: "dashed" as const } },
      },

      // dataZoom: mouse-wheel scroll to zoom in/out, drag to pan;
      // slider at the bottom gives a persistent range handle.
      // filterMode "none" keeps every data point in the series regardless of the
      // zoom window — only the viewport shifts. "filter" was removing out-of-range
      // points from the series array, leaving an empty dataset inside the flat
      // section, which caused value.min → Infinity and blew up the y-axis entirely.
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          filterMode: "none",
          height: 18,
          bottom: 8,
          fillerColor: "rgba(76,215,246,0.08)",
          borderColor: "rgba(255,255,255,0.06)",
          handleStyle: { color: "#4cd7f6", borderColor: "#4cd7f6" },
          moveHandleStyle: { color: "#4cd7f6" },
          selectedDataBackground: {
            areaStyle: { color: "rgba(76,215,246,0.06)" },
            lineStyle: { color: "rgba(76,215,246,0.25)" },
          },
          dataBackground: {
            areaStyle: { color: "rgba(255,255,255,0.02)" },
            lineStyle: { color: "rgba(255,255,255,0.06)" },
          },
          labelFormatter: () => "",
          textStyle: { color: "transparent" },
        },
      ],

      series: [
        {
          // Series 0: full data in metric colour + the alert-highlight markArea
          name: metric.unit,
          type: "line" as const,
          data: allData,
          smooth: false,
          symbol: "none",
          lineStyle: { color: metric.color, width: 2 },
          itemStyle: { color: metric.color },
          ...(markArea ? { markArea } : {}),
        },
        // Series 1: alert-window overlay — red line + dot markers on abnormal points.
        // connectNulls:false ensures only the in-window segment is drawn.
        ...(hasAlert
          ? [
              {
                name: "alert",
                type: "line" as const,
                data: alertData,
                smooth: false,
                symbol: "circle",
                symbolSize: 5,
                lineStyle: { color: "#ef4444", width: 3 },
                itemStyle: {
                  color: "#ef4444",
                  borderColor: "#fca5a5",
                  borderWidth: 1.5,
                },
                connectNulls: false,
                z: 10,
                tooltip: { show: false },
              },
            ]
          : []),
        // Series 2: backend-supplied anomalous segments — empty data array, purely
        // a markArea carrier. Always silent so it never interferes with hover or clicks.
        ...(segmentsMarkArea
          ? [
              {
                name: "segments",
                type: "line" as const,
                data: [] as [number, number][],
                silent: true,
                symbol: "none",
                lineStyle: { opacity: 0 },
                tooltip: { show: false },
                markArea: segmentsMarkArea,
              },
            ]
          : []),
      ],
    };
  }, [allData, alertData, hasAlert, highlight, metric, onMarkAreaClick, abnormalSegments]);
  // ── end ECharts option ───────────────────────────────────────────────────

  // ECharts event bindings — only active when the markArea is clickable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type EChartsEvents = Record<string, (params: any) => void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEvents = useMemo<EChartsEvents>(() => {
    if (!onMarkAreaClick || !hasAlert) return {} as EChartsEvents;
    return {
      click: (params: { componentType?: string; dataType?: string }) => {
        // ECharts fires componentType='markArea' for markArea clicks
        if (params.componentType === "markArea" || params.dataType === "markArea") {
          onMarkAreaClick();
        }
      },
    };
  }, [onMarkAreaClick, hasAlert]);

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 shrink-0" style={{ color: "#bec6e0" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>
            Health Trends
          </h3>
          {readings.length > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }}
            >
              {readings.length} readings
            </span>
          )}
          {abnormalSegments.length > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {abnormalSegments.length} anomal{abnormalSegments.length === 1 ? "y" : "ies"}
            </span>
          )}
          {hasAlert && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "#ef4444" }}
              />
              {onMarkAreaClick ? "Alert zone · Click to analyze" : "Alert highlighted"}
            </span>
          )}
        </div>

        {/* Date range controls + action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="flex-1 sm:flex-none"
              style={INPUT_STYLE}
            />
            <span style={{ color: "#45464d", fontSize: "12px" }}>to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="flex-1 sm:flex-none"
              style={INPUT_STYLE}
            />
          </div>
          {/* Action buttons: Fetch + Export CSV — flex-row so they sit side-by-side on all widths */}
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={onFetch}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none"
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
            <button
              onClick={handleExportCSV}
              disabled={readings.length === 0}
              title={readings.length === 0 ? "Fetch data first" : `Export ${metric.label} as CSV`}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: readings.length === 0 ? "#45464d" : "#bec6e0",
                cursor: readings.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <Download className="w-3 h-3 shrink-0" />
              <span className="truncate">Export CSV</span>
            </button>
          </div>
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
        style={{ height: 450 }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-t-transparent rounded-full"
              style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "#4cd7f6" }}
            />
            <p className="text-sm" style={{ color: "#45464d" }}>
              Loading history…
            </p>
          </div>
        ) : readings.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm" style={{ color: "#45464d" }}>
              Select a date range and click Fetch to view history.
            </p>
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ height: 450, width: "100%" }}
            notMerge={true}
            lazyUpdate={false}
            onEvents={onEvents}
          />
        )}
      </motion.div>
    </div>
  );
}
