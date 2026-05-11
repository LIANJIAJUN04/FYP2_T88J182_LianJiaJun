"use client";

import type { AlertBadgeProps } from "./AlertBadge.types";

export function AlertBadge({ count, hasUnresolved }: AlertBadgeProps) {
  if (count === 0) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: "#0c1524", color: "#334155", border: "1px solid #1e3a5f" }}
      >
        None
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
      style={
        hasUnresolved
          ? { background: "#ef444418", color: "#f87171", border: "1px solid #ef444430" }
          : { background: "#f59e0b18", color: "#fbbf24", border: "1px solid #f59e0b30" }
      }
    >
      {count} {count === 1 ? "alert" : "alerts"}
    </span>
  );
}
