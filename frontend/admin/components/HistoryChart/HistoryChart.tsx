"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Calendar, RefreshCw, FileSpreadsheet } from "lucide-react";
import { saveAs } from "file-saver";
import type { HistoryChartProps, AbnormalSegment } from "./HistoryChart.types";
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

// ── Anomaly segment helpers ───────────────────────────────────────────────────

function alertReason(r: Reading): string {
  if (r.spo2 < 90)        return `Critical SpO₂ (${r.spo2.toFixed(1)}%)`;
  if (r.temperature > 38) return `High Temp (${r.temperature.toFixed(1)}°C)`;
  if (r.temperature < 35) return `Low Temp (${r.temperature.toFixed(1)}°C)`;
  if (r.bpm > 130)        return `Tachycardia (${Math.round(r.bpm)} bpm)`;
  if (r.bpm < 40)         return `Bradycardia (${Math.round(r.bpm)} bpm)`;
  return "Abnormal Reading";
}

// Maps a segment's human-readable reason label to its Excel column index so that
// only the offending vital cell receives bold red styling. Returns null when the
// reason string doesn't match any recognised metric keyword.
function reasonToMetricCol(reason: string): 1 | 2 | 3 | null {
  const r = reason.toLowerCase();
  if (r.includes("spo") || r.includes("oxygen"))                        return 1; // SpO₂
  if (r.includes("bpm") || r.includes("brady") || r.includes("tachy")) return 2; // Heart Rate
  if (r.includes("temp"))                                                return 3; // Temperature
  return null;
}

// Group contiguous alert=true / status=danger readings into segment objects.
// Fallback when backend does not yet return abnormalSegments.
function deriveSegments(readings: Reading[]): AbnormalSegment[] {
  const segs: AbnormalSegment[] = [];
  let start: Reading | null = null;
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const bad = r.alert || r.status === "danger";
    if (bad && !start) {
      start = r;
    } else if (!bad && start) {
      segs.push({ startTime: start.ts, endTime: readings[i - 1].ts, reason: alertReason(start) });
      start = null;
    }
  }
  if (start) {
    segs.push({ startTime: start.ts, endTime: readings[readings.length - 1].ts, reason: alertReason(start) });
  }
  return segs;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HistoryChart({
  patientId,
  patient,
  readings,
  loading,
  from,
  to,
  onFromChange,
  onToChange,
  onFetch,
  highlight,
  onMarkAreaClick,
  onSegmentClick,
  abnormalSegments = [],
}: HistoryChartProps) {
  const [tab, setTab] = useState<Tab>("spo2");
  const [exporting, setExporting] = useState(false);
  const metric = METRICS.find((m) => m.key === tab)!;

  // Holds the live ECharts instance so we can dispatch dataZoom actions imperatively.
  // Populated by onChartReady; updated on every tab re-mount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const echartsInstanceRef = useRef<any>(null);

  // Auto-switch to the alerted metric when Check is clicked
  useEffect(() => {
    if (!highlight?.metric) return;
    const m = highlight.metric as Tab;
    if (METRICS.some((x) => x.key === m)) setTab(m);
  }, [highlight]);

  // Auto-zoom the dataZoom slider to the alert window once data has loaded.
  // Fires when highlight changes (new Check click) or when loading flips false
  // (data just arrived for an already-pending highlight).
  useEffect(() => {
    if (!highlight || loading || readings.length === 0) return;
    const instance = echartsInstanceRef.current;
    if (!instance) return;
    const pad = 2 * 60 * 1000; // 2-min context on each side
    instance.dispatchAction({
      type: "dataZoom",
      startValue: highlight.startTs - pad,
      endValue: highlight.endTs + pad,
    });
  }, [highlight, loading, readings.length]);

  const allData = useMemo(
    () => readings.map((r): [number, number] => [new Date(r.ts).getTime(), r[tab]]),
    [readings, tab],
  );

  const alertData = useMemo((): [number, number | null][] => {
    if (!highlight) return [];
    return readings.map((r): [number, number | null] => {
      const ts = new Date(r.ts).getTime();
      return [ts, ts >= highlight.startTs && ts <= highlight.endTs ? r[tab] : null];
    });
  }, [readings, tab, highlight]);

  const hasAlert = highlight != null && alertData.some((d) => d[1] !== null);

  // Backend segments take priority; derive from alert/status as fallback
  const effectiveSegments = useMemo((): AbnormalSegment[] => {
    if (abnormalSegments.length > 0) return abnormalSegments;
    return deriveSegments(readings);
  }, [readings, abnormalSegments]);

  // ── Dual-track anomaly rendering ─────────────────────────────────────────────
  //
  // Track A (single-audit): active when `highlight` is set — a specific alert row
  // was clicked. The solid red markArea on the main series is the only anomaly
  // visualisation. browseSegments returns [] so Track B is fully silent.
  //
  // Track B (global browse): active when `highlight` is null/undefined — all
  // effectiveSegments are passed unconditionally across all metric tabs. Keyword
  // filtering was removed because XGBoost-sourced reason strings may not match
  // hardcoded keywords and would silently discard every band.
  const browseSegments = useMemo((): AbnormalSegment[] => {
    if (highlight) return [];
    return effectiveSegments;
  }, [effectiveSegments, highlight]);

  // ── Excel export ──────────────────────────────────────────────────────────

  async function handleExportExcel() {
    if (readings.length === 0 || exporting) return;
    setExporting(true);
    try {
      // Dynamic import keeps ExcelJS out of the initial bundle (~1 MB)
      const { Workbook } = await import("exceljs");
      const wb = new Workbook();
      wb.creator = "MediSync";
      wb.created = new Date();

      const ws = wb.addWorksheet("Health Report", {
        pageSetup: { orientation: "landscape", fitToPage: true },
      });

      // ── Palette ─────────────────────────────────────────────────────────
      const C = {
        slate900:    "FF0F172A",
        slate800:    "FF1E293B",
        slate700:    "FF334155",
        slate200:    "FFE2E8F0",
        white:       "FFFFFFFF",
        teal:        "FF4CD7F6",
        yellow100:   "FFFEF9C3",
        amber950:    "FF451A03",
        darkCrimson: "FFFF0000",
        rowAlt:      "FFF8FAFC",
        rowNorm:     "FFFFFFFF",
        textDark:    "FF1E293B",
      } as const;

      // ── Helper: stamp style onto a cell ──────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (cell: any, opts: {
        bold?: boolean; size?: number;
        fg?: string; bg?: string;
        halign?: "left" | "center" | "right";
        indent?: number;
      }) => {
        cell.font = {
          name: "Calibri",
          bold: opts.bold ?? false,
          size: opts.size ?? 11,
          color: opts.fg ? { argb: opts.fg } : undefined,
        };
        if (opts.bg) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
        }
        cell.alignment = {
          horizontal: opts.halign ?? "left",
          vertical: "middle",
          indent: opts.indent ?? 0,
          wrapText: false,
        };
      };

      // ── Row 1: Title banner ───────────────────────────────────────────────
      ws.mergeCells("A1:D1");
      s(ws.getCell("A1"), { bold: true, size: 14, fg: C.white, bg: C.slate900, halign: "center" });
      ws.getCell("A1").value = "MediSync Clinical Health Report";
      ws.getRow(1).height = 30;

      // ── Row 2: Patient name + IC ──────────────────────────────────────────
      ws.mergeCells("A2:D2");
      s(ws.getCell("A2"), { bold: true, size: 11, fg: C.slate200, bg: C.slate800, indent: 1 });
      ws.getCell("A2").value = `NAME: ${patient?.name ?? "—"}    |    IC: ${patient?.ic_number ?? "—"}`;
      ws.getRow(2).height = 20;

      // ── Row 3: Doctor ─────────────────────────────────────────────────────
      ws.mergeCells("A3:D3");
      s(ws.getCell("A3"), { size: 11, fg: C.slate200, bg: C.slate800, indent: 1 });
      ws.getCell("A3").value = `Doctor In-Charge: ${patient?.assigned_doctor ?? "—"}`;
      ws.getRow(3).height = 20;

      // ── Row 4: Thin divider ───────────────────────────────────────────────
      ws.mergeCells("A4:D4");
      ws.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate900 } };
      ws.getRow(4).height = 5;

      // ── Row 5: Date range ─────────────────────────────────────────────────
      ws.mergeCells("A5:D5");
      s(ws.getCell("A5"), { size: 11, fg: C.slate200, bg: C.slate800, indent: 1 });
      ws.getCell("A5").value = `Selected Monitoring Period: ${from}  →  ${to}`;
      ws.getRow(5).height = 20;

      // ── Row 6: Spacer ─────────────────────────────────────────────────────
      ws.getRow(6).height = 8;

      // ── Row 7: Column headers ─────────────────────────────────────────────
      const COL_HEADERS = [
        "Timestamp (HH:MM:SS)",
        "SpO₂ (%)",
        "Heart Rate (BPM)",
        "Temperature (°C)",
      ];
      const hRow = ws.getRow(7);
      hRow.height = 22;
      COL_HEADERS.forEach((label, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = label;
        s(cell, { bold: true, size: 11, fg: C.white, bg: C.slate700, halign: "center" });
        cell.border = {
          bottom: { style: "medium", color: { argb: C.teal } },
        };
      });

      // ── Rows 8+: Data ─────────────────────────────────────────────────────
      //
      // Anomaly classification is driven entirely by the backend XGBoost pipeline.
      // The frontend never re-evaluates numerical thresholds — it consumes the
      // flags the ML model and rule engine already stamped on each reading.
      //
      // Two-tier per-cell red highlighting:
      //   Tier 1 — newer records carry per-metric ML flags (is_spo2_anomalous,
      //             is_bpm_anomalous, is_temp_anomalous).  Use them directly so
      //             only the exact column the model identified is highlighted.
      //   Tier 2 — older records lack these flags.  Fall back to row-level: if
      //             r.alert === true (danger status or ML anomaly prediction),
      //             apply bold red to every vital column in that row, since we
      //             cannot know which specific metric the model flagged.
      readings.forEach((r, i) => {
        const ts = new Date(r.ts);
        const tsMs = ts.getTime();

        const containingSegment = effectiveSegments.find((seg) => {
          const segStart = new Date(seg.startTime).getTime();
          const segEnd   = new Date(seg.endTime).getTime();
          return tsMs >= segStart && tsMs <= segEnd;
        });

        const hasPerMetricFlags =
          r.is_spo2_anomalous !== undefined ||
          r.is_bpm_anomalous  !== undefined ||
          r.is_temp_anomalous !== undefined;

        // Pre-compute per-column violations before entering the cell loop so
        // the row background can be gated strictly on whether at least one vital
        // cell will actually turn red. A row overlapping a segment window but
        // containing no out-of-range values stays white.
        const computeViolation = (col: 1 | 2 | 3): boolean => {
          if (hasPerMetricFlags) {
            return (col === 1 && r.is_spo2_anomalous === true) ||
                   (col === 2 && r.is_bpm_anomalous  === true) ||
                   (col === 3 && r.is_temp_anomalous  === true);
          }
          // Tier 2: parse segment reason for metric keywords first.
          const targetCol = containingSegment
            ? reasonToMetricCol(containingSegment.reason)
            : null;
          if (targetCol !== null) return col === targetCol;
          // Generic reason — validate each metric against physiological boundaries.
          // Only the column whose value is actually abnormal is flagged.
          if (r.alert === true || r.status === "danger") {
            return (col === 1 && r.spo2 < 95) ||
                   (col === 2 && (r.bpm < 60 || r.bpm > 100)) ||
                   (col === 3 && (r.temperature < 36.0 || r.temperature > 37.5));
          }
          return false;
        };

        const violations: [boolean, boolean, boolean] = [
          computeViolation(1),
          computeViolation(2),
          computeViolation(3),
        ];
        // Yellow background only when at least one vital cell is genuinely red.
        const anyViolation = violations.some(Boolean);

        const dRow = ws.getRow(8 + i);
        dRow.height = 17;

        const values: (string | number)[] = [
          ts.toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          }),
          r.spo2,
          r.bpm,
          r.temperature,
        ];

        values.forEach((val, col) => {
          const cell = dRow.getCell(col + 1);
          cell.value = val;
          cell.alignment = {
            horizontal: col === 0 ? "left" : "center",
            vertical: "middle",
          };

          if (anyViolation) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.yellow100 } };
            const metricViolation = col > 0 && violations[col - 1];
            cell.font = {
              name: "Calibri",
              size: 11,
              bold: metricViolation,
              color: { argb: metricViolation ? C.darkCrimson : C.amber950 },
            };
          } else {
            const bg = i % 2 === 0 ? C.rowNorm : C.rowAlt;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
            cell.font = { name: "Calibri", size: 11, color: { argb: C.textDark } };
          }

          cell.border = {
            bottom: { style: "hair", color: { argb: C.slate200 } },
          };
        });
      });

      // ── Column widths ─────────────────────────────────────────────────────
      ws.getColumn(1).width = 24; // Timestamp
      ws.getColumn(2).width = 14; // SpO₂
      ws.getColumn(3).width = 18; // Heart Rate
      ws.getColumn(4).width = 18; // Temperature

      // ── Write and save ────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const today = new Date().toISOString().slice(0, 10);
      saveAs(blob, `MediSync_Patient_${patientId}_${today}.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  // ── ECharts option ────────────────────────────────────────────────────────
  const option = useMemo(() => {
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
            emphasis: {
              itemStyle: { color: "rgba(239,68,68,0.50)" },
              label: {
                show: true,
                fontSize: 13,
                fontWeight: "bold" as const,
              },
            },
            data: [[{ xAxis: highlight.startTs }, { xAxis: highlight.endTs }]],
          }
        : undefined;

    // browseSegments is a subset of effectiveSegments filtered by highlight window
    // (all segments shown when no alert is focused; only the matching band when
    // a clinician has clicked Check on a specific alert row).
    const segmentsClickable = !!onSegmentClick && browseSegments.length > 0;
    const segmentsMarkArea =
      browseSegments.length > 0
        ? {
            silent: !segmentsClickable,
            itemStyle: {
              color: "rgba(239,68,68,0.15)",
              borderColor: "rgba(239,68,68,0.35)",
              borderWidth: 1,
              borderType: "dashed" as const,
              ...(segmentsClickable ? { cursor: "pointer" } : {}),
            },
            // ['50%','50%'] + align/verticalAlign deadlocks the label at the
            // absolute geometric centre of the rectangle on both axes, preventing
            // the text from drifting to the top edge and being clipped.
            label: {
              show: true,
              position: ["50%", "50%"] as [string, string],
              align: "center" as const,
              verticalAlign: "middle" as const,
              rotate: 90,
              clip: false,
              color: "#f87171",
              fontSize: 10,
              fontWeight: 700,
              formatter: segmentsClickable ? "⚠ {b}  ·  Click to analyze" : "{b}",
            },
            emphasis: {
              itemStyle: { color: "rgba(239,68,68,0.50)" },
              label: {
                show: true,
                position: ["50%", "50%"] as [string, string],
                align: "center" as const,
                verticalAlign: "middle" as const,
                rotate: 90,
                clip: false,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: "bold" as const,
              },
            },
            data: browseSegments.map((seg) => [
              { xAxis: new Date(seg.startTime).getTime(), name: seg.reason },
              { xAxis: new Date(seg.endTime).getTime() },
            ]),
          }
        : undefined;

    return {
      backgroundColor: "transparent",
      animation: false,
      animationDurationUpdate: 1000,
      animationEasingUpdate: "cubicOut" as const,
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
          triggerEvent: true,
          lineStyle: { color: metric.color, width: 2 },
          itemStyle: { color: metric.color },
          // Track A and B are mutually exclusive: browseSegments is [] whenever
          // highlight is set, so exactly one markArea is active at a time.
          // Both are attached to this series (which has real data) so ECharts
          // always has a coordinate range to position the markArea rectangles.
          ...(markArea ? { markArea }
            : segmentsMarkArea ? { markArea: segmentsMarkArea }
            : {}),
        },
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
                itemStyle: { color: "#ef4444", borderColor: "#fca5a5", borderWidth: 1.5 },
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
  }, [allData, alertData, hasAlert, highlight, metric, onMarkAreaClick, onSegmentClick, browseSegments]);
  // ── end ECharts option ───────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type EChartsEvents = Record<string, (params: any) => void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEvents = useMemo<EChartsEvents>(() => {
    const needsClick =
      (onMarkAreaClick != null && hasAlert) ||
      (onSegmentClick != null && browseSegments.length > 0);
    if (!needsClick) return {} as EChartsEvents;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      click: (params: any) => {
        const isMarkArea =
          params.componentType === "markArea" || params.dataType === "markArea";
        if (!isMarkArea) return;
        // Both tracks share the main series — use highlight state to distinguish.
        if (highlight && onMarkAreaClick) {
          onMarkAreaClick();
        } else if (!highlight && onSegmentClick) {
          const seg = effectiveSegments.find((s) => s.reason === params.name);
          if (seg) onSegmentClick(seg);
        }
      },
    };
  }, [onMarkAreaClick, hasAlert, onSegmentClick, effectiveSegments, browseSegments]);

  const exportDisabled = readings.length === 0 || exporting;

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
          {highlight ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              1 anomaly
            </span>
          ) : browseSegments.length > 0 ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {browseSegments.length} anomal{browseSegments.length === 1 ? "y" : "ies"}
            </span>
          ) : null}
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

        {/* Controls: date pickers + Fetch + Export Report */}
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

          {/* Fetch + Export side-by-side at all breakpoints */}
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
              onClick={handleExportExcel}
              disabled={exportDisabled}
              title={
                readings.length === 0
                  ? "Fetch data first to enable export"
                  : `Export all metrics for ${from} → ${to} as Excel report`
              }
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none"
              style={{
                background: exportDisabled
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(34,197,94,0.06)",
                border: exportDisabled
                  ? "1px solid rgba(255,255,255,0.06)"
                  : "1px solid rgba(34,197,94,0.2)",
                color: exportDisabled ? "#45464d" : "#4ade80",
                cursor: exportDisabled ? "not-allowed" : "pointer",
              }}
            >
              {exporting ? (
                <RefreshCw className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate">
                {exporting ? "Generating…" : "Export Report (Excel)"}
              </span>
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
            onChartReady={(inst: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              echartsInstanceRef.current = inst;
              // Re-apply zoom when the chart remounts (e.g. tab switch) if an
              // alert window is already highlighted.
              if (highlight && !loading && readings.length > 0) {
                const pad = 2 * 60 * 1000;
                inst.dispatchAction({
                  type: "dataZoom",
                  startValue: highlight.startTs - pad,
                  endValue: highlight.endTs + pad,
                });
              }
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
