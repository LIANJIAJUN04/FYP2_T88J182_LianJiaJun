"use client";

import { motion } from "framer-motion";
import type { SummaryCardProps } from "./SummaryCard.types";

export function SummaryCard({ label, value, icon, color, description, loading }: SummaryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "linear-gradient(145deg, #0c1524, #0f1e38)",
        border: "1.5px solid #1e3a5f",
        boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 20px ${color}10`,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
          {label}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-9 w-20" />
      ) : (
        <motion.p
          key={String(value)}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-4xl font-black tabular-nums leading-none"
          style={{ color }}
        >
          {value}
        </motion.p>
      )}

      {description && (
        <p className="text-xs" style={{ color: "#334155" }}>
          {description}
        </p>
      )}
    </motion.div>
  );
}
