"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MLBadgeProps } from "./MLBadge.types";

/**
 * MLBadge — displays the ML anomaly detection result on the admin patient detail page.
 *
 * Complements StatusCard (rule-based thresholds) with pattern-based detection.
 * StatusCard catches known dangerous values; MLBadge catches subtle physiological
 * patterns that fall within technically normal thresholds.
 *
 * Phase 9 — shown in the admin patient detail page alongside StatusCard.
 */
export function MLBadge({ prediction, confidence }: MLBadgeProps) {
  const isAnomaly = prediction === "anomaly";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={prediction}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative rounded-2xl overflow-hidden h-full"
        style={{
          background: isAnomaly
            ? "rgba(245,158,11,0.06)"
            : "rgba(76,215,246,0.04)",
          border: isAnomaly
            ? "1.5px solid rgba(245,158,11,0.25)"
            : "1.5px solid rgba(76,215,246,0.15)",
          boxShadow: isAnomaly
            ? "0 0 32px rgba(245,158,11,0.07)"
            : "none",
        }}
      >
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-8 text-center h-full">
          {/* Brain icon */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: isAnomaly
                ? "rgba(245,158,11,0.12)"
                : "rgba(76,215,246,0.08)",
            }}
          >
            <Brain
              className="w-6 h-6"
              style={{ color: isAnomaly ? "#f59e0b" : "#4cd7f6" }}
            />
          </div>

          {/* Header label */}
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#45464d" }}
          >
            ML Detection
          </p>

          {/* Prediction label */}
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
            <motion.span
              className="text-3xl font-black tracking-tight"
              style={{
                color: isAnomaly ? "#f59e0b" : "#4cd7f6",
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
              }}
            >
              {isAnomaly ? "ANOMALY" : "NORMAL"}
            </motion.span>
          </div>

          {/* Confidence */}
          {confidence !== undefined && confidence > 0 && (
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: isAnomaly ? "#fbbf24" : "#67e8f9" }}
              >
                {(confidence * 100).toFixed(1)}% confidence
              </span>
            </div>
          )}

          {/* Subtitle */}
          <p
            className="text-xs leading-relaxed max-w-[180px]"
            style={{ color: "#45464d" }}
          >
            {isAnomaly
              ? "Pattern outside learned physiological norms"
              : "Pattern within learned normal range"}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
