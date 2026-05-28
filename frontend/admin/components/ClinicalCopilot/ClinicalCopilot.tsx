"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, X, AlertTriangle } from "lucide-react";
import type { ClinicalCopilotProps } from "./ClinicalCopilot.types";

// ── Badge style maps ──────────────────────────────────────────────────────────

const SIGNAL_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "PHYSIOLOGICAL ANOMALY": {
    bg: "rgba(239,68,68,0.12)", color: "#f87171", border: "rgba(239,68,68,0.35)",
  },
  "SENSOR ARTIFACT": {
    bg: "rgba(76,215,246,0.08)", color: "#4cd7f6", border: "rgba(76,215,246,0.3)",
  },
  "AMBIGUOUS": {
    bg: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "rgba(245,158,11,0.35)",
  },
};

const URGENCY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "IMMEDIATE": {
    bg: "rgba(239,68,68,0.15)", color: "#f87171", border: "rgba(239,68,68,0.45)",
  },
  "ESCALATE": {
    bg: "rgba(249,115,22,0.12)", color: "#fb923c", border: "rgba(249,115,22,0.4)",
  },
  "MONITOR": {
    bg: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "rgba(245,158,11,0.35)",
  },
  "ROUTINE": {
    bg: "rgba(34,197,94,0.08)", color: "#4ade80", border: "rgba(34,197,94,0.3)",
  },
};

// ── Metric label map ──────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  spo2: "SpO₂", bpm: "Heart Rate", temperature: "Temperature",
};

function formatAlertValue(metric: string, value: number): string {
  if (metric === "bpm") return `${Math.round(value)} bpm`;
  if (metric === "temperature") return `${value.toFixed(1)}°C`;
  return `${value.toFixed(1)}%`;
}

// ── Analysis text renderer ────────────────────────────────────────────────────
// Parses Claude's structured markdown-like output line-by-line into styled JSX.

function AnalysisRenderer({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        // Section header: ## Title
        if (line.startsWith("## ")) {
          return (
            <p
              key={i}
              className="text-[10px] font-black uppercase tracking-[0.18em] mt-5 mb-1.5 first:mt-0"
              style={{ color: "#4cd7f6" }}
            >
              {line.slice(3)}
            </p>
          );
        }

        // Bold key-value: **Key:** value
        if (/^\*\*[^*]+\*\*/.test(line)) {
          const match = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
          if (match) {
            const [, key, rest] = match;
            const restTrimmed = rest.trim();

            // Check if the value is a signal classification keyword → render as badge
            const signalEntry = Object.entries(SIGNAL_STYLES).find(
              ([k]) => restTrimmed === k,
            );
            if (signalEntry) {
              const [sig, style] = signalEntry;
              return (
                <div key={i} className="flex items-center gap-2 my-1.5">
                  <span className="text-[10px] font-semibold shrink-0" style={{ color: "#45464d" }}>
                    {key}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                  >
                    {sig}
                  </span>
                </div>
              );
            }

            return (
              <div key={i} className="flex items-baseline gap-1.5 my-0.5">
                <span className="text-[10px] font-semibold shrink-0" style={{ color: "#45464d" }}>
                  {key}
                </span>
                <span className="text-[10px]" style={{ color: "#c6c6cd" }}>
                  {restTrimmed}
                </span>
              </div>
            );
          }
        }

        // Urgency line: "MONITOR — recommended action text"
        const urgencyEntry = Object.entries(URGENCY_STYLES).find(([k]) =>
          line.startsWith(k),
        );
        if (urgencyEntry) {
          const [lvl, style] = urgencyEntry;
          const action = line.slice(lvl.length).replace(/^[\s—–-]+/, "").trim();
          return (
            <div key={i} className="flex items-start gap-2 my-2">
              <span
                className="text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
              >
                {lvl}
              </span>
              {action && (
                <span className="text-[10px] leading-relaxed pt-0.5" style={{ color: "#c6c6cd" }}>
                  {action}
                </span>
              )}
            </div>
          );
        }

        // Standalone signal keyword (in case Claude omits the **Signal:** wrapper)
        const signalEntry = Object.entries(SIGNAL_STYLES).find(
          ([k]) => line.trim() === k,
        );
        if (signalEntry) {
          const [sig, style] = signalEntry;
          return (
            <span
              key={i}
              className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full my-1"
              style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
            >
              {sig}
            </span>
          );
        }

        // Bullet point: "• …" or "- …"
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return (
            <div key={i} className="flex items-start gap-2 my-0.5">
              <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "#4cd7f6" }}>
                •
              </span>
              <span className="text-[10px] leading-relaxed" style={{ color: "#bec6e0" }}>
                {line.slice(2)}
              </span>
            </div>
          );
        }

        // Blank line → small spacer
        if (!line.trim()) return <div key={i} className="h-1.5" />;

        // Regular paragraph
        return (
          <p key={i} className="text-[10px] leading-relaxed" style={{ color: "#bec6e0" }}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-6 px-1">
      {[90, 75, 55, 85, 65, 40, 70].map((w, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          className="h-2 rounded-full"
          style={{ width: `${w}%`, background: "rgba(76,215,246,0.15)" }}
        />
      ))}
      <p
        className="text-[10px] text-center mt-4 tracking-wider"
        style={{ color: "#45464d" }}
      >
        Analyzing sensor telemetry…
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClinicalCopilot({
  isOpen,
  onClose,
  context,
  analysis,
  loading,
  error,
}: ClinicalCopilotProps) {
  const metricLabel = context ? (METRIC_LABELS[context.metric] ?? context.metric) : "";
  const formattedValue = context ? formatAlertValue(context.metric, context.value) : "";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="copilot-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}
          />

          {/* Drawer */}
          <motion.div
            key="copilot-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 h-screen flex flex-col"
            style={{
              width: "min(440px, 100vw)",
              zIndex: 61,
              background: "#0e0e10",
              borderLeft: "1px solid rgba(76,215,246,0.12)",
              boxShadow: "-8px 0 48px rgba(0,0,0,0.6)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex flex-col gap-2">
                {/* Title row */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(76,215,246,0.1)", border: "1px solid rgba(76,215,246,0.2)" }}
                  >
                    <Brain className="w-3.5 h-3.5" style={{ color: "#4cd7f6" }} />
                  </div>
                  <div>
                    <p className="text-xs font-black" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
                      Clinical Copilot
                    </p>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "#45464d" }}>
                      AI-Assisted Event Analysis
                    </p>
                  </div>
                </div>

                {/* Alert context chip */}
                {context && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: "#fbbf24" }} />
                    <span className="text-[10px] font-semibold" style={{ color: "#fbbf24" }}>
                      {metricLabel}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                      style={{ background: "rgba(255,180,171,0.08)", color: "#ffb4ab" }}
                    >
                      {formattedValue}
                    </span>
                    <span className="text-[9px]" style={{ color: "#45464d" }}>
                      {new Date(context.triggeredAt).toLocaleString("en-GB", {
                        day: "numeric", month: "short",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                style={{ background: "rgba(255,255,255,0.04)", color: "#909097" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && <LoadingSkeleton />}

              {error && !loading && (
                <div
                  className="rounded-xl p-4 text-xs"
                  style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                >
                  {error}
                </div>
              )}

              {analysis && !loading && <AnalysisRenderer text={analysis} />}

              {!loading && !error && !analysis && (
                <p className="text-[10px] text-center py-8" style={{ color: "#45464d" }}>
                  No analysis available.
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              className="shrink-0 px-5 py-3 flex items-center gap-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
            >
              <Brain className="w-3 h-3" style={{ color: "#45464d" }} />
              <span className="text-[9px] uppercase tracking-widest" style={{ color: "#45464d" }}>
                Powered by claude-haiku-4-5 · For clinical decision support only
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
