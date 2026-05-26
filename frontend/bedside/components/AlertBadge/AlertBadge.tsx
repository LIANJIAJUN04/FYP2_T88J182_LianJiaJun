"use client";

import { Brain, CheckCircle, AlertTriangle } from "lucide-react";
import type { AlertBadgeProps } from "./AlertBadge.types";

export function AlertBadge({ prediction, confidence }: AlertBadgeProps) {
  const isAnomaly = prediction === "anomaly";

  const accent      = isAnomaly ? "#f59e0b" : "#22c55e";   // amber : green
  const bgAccent    = isAnomaly
    ? "rgba(245,158,11,0.08)"
    : "rgba(34,197,94,0.06)";
  const borderColor = isAnomaly
    ? "rgba(245,158,11,0.25)"
    : "rgba(34,197,94,0.15)";
  const label       = isAnomaly ? "ANOMALY" : "NORMAL";
  const subtext     = isAnomaly
    ? "Unusual pattern detected — review vitals"
    : "Vital-sign pattern within learned normal range";
  const Icon        = isAnomaly ? AlertTriangle : CheckCircle;

  return (
    <div
      className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
      style={{
        background: bgAccent,
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 24px ${isAnomaly ? "rgba(245,158,11,0.06)" : "rgba(34,197,94,0.04)"}`,
      }}
    >
      {/* Left — icon + label */}
      <div className="flex items-center gap-4">
        {/* Brain icon badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Brain className="w-5 h-5" style={{ color: "#4cd7f6" }} />
        </div>

        <div>
          <p
            className="text-xs font-semibold tracking-widest mb-1"
            style={{ color: "#45464d", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
          >
            ML ANOMALY DETECTION
          </p>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
            <span
              className="text-lg font-black tracking-wide"
              style={{ color: accent, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
            >
              {label}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#606068" }}>
            {subtext}
          </p>
        </div>
      </div>

      {/* Right — alert status */}
      <div className="text-right flex-shrink-0">
        <p
          className="text-sm font-black tracking-wide uppercase"
          style={{ color: accent, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
        >
          {isAnomaly ? "Alert Triggered" : "No Alert"}
        </p>
      </div>
    </div>
  );
}
