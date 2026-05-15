"use client";

import { motion, AnimatePresence } from "framer-motion";
import { statusConfig } from "./StatusCard.utils";
import type { StatusCardProps } from "./StatusCard.types";

export function StatusCard({ status, lastUpdate, compact = false }: StatusCardProps) {
  const cfg = statusConfig[status];

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold"
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          color: cfg.textColor,
        }}
      >
        <span
          className={`w-2 h-2 rounded-full ${cfg.pulse ? "pulse-danger" : ""}`}
          style={{ background: cfg.dotColor, boxShadow: `0 0 6px ${cfg.dotColor}` }}
        />
        {cfg.label}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl h-full"
        style={{
          background: cfg.bg,
          border: `1.5px solid ${cfg.border}`,
          boxShadow: cfg.glow,
        }}
      >
        {cfg.pulse && (
          <div
            className="absolute inset-0 rounded-2xl pulse-danger pointer-events-none"
            style={{ border: `2px solid ${cfg.border}` }}
          />
        )}

        <div className="flex flex-col items-center justify-center gap-4 px-8 py-10 h-full">
          <p
            className="text-xs font-semibold uppercase tracking-[0.25em]"
            style={{ color: cfg.textColor, opacity: 0.7 }}
          >
            Patient Status
          </p>

          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${status === "connecting" ? "blink-dot" : ""} ${cfg.pulse ? "pulse-danger" : ""}`}
              style={{ background: cfg.dotColor, boxShadow: `0 0 10px ${cfg.dotColor}` }}
            />
            <motion.span
              className="text-4xl font-black tracking-tight"
              style={{ color: cfg.textColor }}
            >
              {cfg.label}
            </motion.span>
          </div>

          {lastUpdate && (
            <p className="text-xs" style={{ color: cfg.textColor, opacity: 0.5 }}>
              Last updated {lastUpdate}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
