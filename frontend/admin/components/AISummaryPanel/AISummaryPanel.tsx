"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle } from "lucide-react";
import { useAISummaryPanel } from "./AISummaryPanel.hooks";
import { RANGE_OPTIONS } from "./AISummaryPanel.types";
import type { AISummaryPanelProps } from "./AISummaryPanel.types";

const selectStyle = {
  background: "#0e0e10",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e4e2e4",
  borderRadius: "10px",
  padding: "6px 12px",
  fontSize: "12px",
  outline: "none",
  cursor: "pointer",
};

export function AISummaryPanel({ patientId, token }: AISummaryPanelProps) {
  const { state, setRange, handleGenerate } = useAISummaryPanel(patientId, token);
  const { range, summary, period, readingsCount, loading, error } = state;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "#4cd7f6" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>AI Health Summary</h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            style={selectStyle}
            disabled={loading}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: "#0e0e10" }}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: loading
                ? "rgba(76,215,246,0.15)"
                : "linear-gradient(135deg, #4cd7f6, #03b5d3)",
              color: loading ? "#4cd7f6" : "#001f26",
              opacity: loading ? 0.8 : 1,
              cursor: loading ? "not-allowed" : "pointer",
              border: loading ? "1px solid rgba(76,215,246,0.3)" : "none",
            }}
          >
            {loading ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full"
                  style={{ borderColor: "rgba(76,215,246,0.3)", borderTopColor: "#4cd7f6" }}
                />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Generate Summary
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content area */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 py-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-t-transparent rounded-full flex-shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "#4cd7f6" }}
            />
            <p className="text-sm" style={{ color: "#45464d" }}>Analyzing patient data…</p>
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
          </motion.div>
        )}

        {summary && !loading && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Period badge */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }}
              >
                {period}
              </span>
              {readingsCount !== null && (
                <span className="text-xs" style={{ color: "#45464d" }}>
                  · {readingsCount} readings
                </span>
              )}
            </div>

            {/* Summary text */}
            <div
              className="rounded-xl px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap mb-4"
              style={{
                background: "rgba(0,0,0,0.2)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#c6c6cd",
                lineHeight: "1.75",
              }}
            >
              {summary}
            </div>

            {/* Disclaimer */}
            <p className="text-xs" style={{ color: "#45464d" }}>
              ⚠ AI-generated analysis. Not a substitute for clinical judgment.
            </p>
          </motion.div>
        )}

        {!summary && !loading && !error && (
          <motion.p
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm py-4"
            style={{ color: "#45464d" }}
          >
            Select a time range and click Generate Summary to get an AI-powered analysis of this patient&apos;s vitals.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
