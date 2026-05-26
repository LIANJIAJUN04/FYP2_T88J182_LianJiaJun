"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AlertBadgeProps } from "./AlertBadge.types";

/**
 * AlertBadge — displays the ML anomaly detection result from the SSE stream.
 *
 * Intentionally styled differently from StatusCard (rule-based) so nurses can
 * distinguish the two signal sources at a glance:
 *   StatusCard  → green / amber / red   (rule-based thresholds)
 *   AlertBadge  → teal / amber          (ML pattern detection)
 *
 * Lives alongside StatusCard on the bedside dashboard (Phase 9).
 */
export function AlertBadge({ prediction, confidence }: AlertBadgeProps) {
  const isAnomaly = prediction === "anomaly";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={prediction}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: isAnomaly
            ? "rgba(245,158,11,0.06)"
            : "rgba(76,215,246,0.04)",
          border: isAnomaly
            ? "1.5px solid rgba(245,158,11,0.25)"
            : "1.5px solid rgba(76,215,246,0.15)",
          boxShadow: isAnomaly
            ? "0 0 24px rgba(245,158,11,0.06)"
            : "none",
        }}
      >
        <div className="flex items-center gap-4 px-6 py-5">
          {/* Brain icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: isAnomaly
                ? "rgba(245,158,11,0.12)"
                : "rgba(76,215,246,0.08)",
            }}
          >
            <Brain
              className="w-5 h-5"
              style={{ color: isAnomaly ? "#f59e0b" : "#4cd7f6" }}
            />
          </div>

          {/* Label + result */}
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em] mb-1"
              style={{ color: "#45464d" }}
            >
              ML Anomaly Detection
            </p>

            <div className="flex items-center gap-2">
              {isAnomaly ? (
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#f59e0b" }}
                />
              ) : (
                <CheckCircle2
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#4cd7f6" }}
                />
              )}
              <span
                className="text-2xl font-black tracking-tight"
                style={{
                  color: isAnomaly ? "#f59e0b" : "#4cd7f6",
                  fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                }}
              >
                {isAnomaly ? "ANOMALY" : "NORMAL"}
              </span>
            </div>

            <p
              className="text-xs mt-1"
              style={{ color: "#45464d" }}
            >
              {isAnomaly
                ? "Subtle pattern detected outside learned norms"
                : "Vital-sign pattern within learned normal range"}
            </p>
          </div>

          {/* Confidence pill */}
          {confidence !== undefined && confidence > 0 && (
            <div
              className="flex-shrink-0 flex flex-col items-end gap-0.5"
            >
              <p className="text-xs" style={{ color: "#45464d" }}>
                confidence
              </p>
              <span
                className="text-lg font-black tabular-nums"
                style={{
                  color: isAnomaly ? "#fbbf24" : "#67e8f9",
                  fontFamily: "'Space Grotesk', monospace",
                }}
              >
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
