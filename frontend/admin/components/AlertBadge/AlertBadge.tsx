"use client";

import type { AlertBadgeProps } from "./AlertBadge.types";

export function AlertBadge({ count, hasUnresolved }: AlertBadgeProps) {
  if (count === 0) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: "rgba(255,255,255,0.03)", color: "#45464d", border: "1px solid rgba(255,255,255,0.07)" }}
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
          ? { background: "rgba(255,180,171,0.08)", color: "#ffb4ab", border: "1px solid rgba(255,180,171,0.2)" }
          : { background: "rgba(245,158,11,0.08)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }
      }
    >
      {count} {count === 1 ? "alert" : "alerts"}
    </span>
  );
}
