import type { Status, StatusConfig } from "./StatusCard.types";

export const statusConfig: Record<Status, StatusConfig> = {
  normal: {
    label: "NORMAL",
    bg: "linear-gradient(135deg, #052e16 0%, #064e3b 100%)",
    border: "#16a34a",
    textColor: "#4ade80",
    dotColor: "#22c55e",
    pulse: false,
    glow: "0 0 40px rgba(34, 197, 94, 0.2)",
  },
  warning: {
    label: "WARNING",
    bg: "linear-gradient(135deg, #422006 0%, #451a03 100%)",
    border: "#d97706",
    textColor: "#fbbf24",
    dotColor: "#f59e0b",
    pulse: false,
    glow: "0 0 40px rgba(245, 158, 11, 0.25)",
  },
  danger: {
    label: "DANGER",
    bg: "linear-gradient(135deg, #3f0000 0%, #450a0a 100%)",
    border: "#dc2626",
    textColor: "#f87171",
    dotColor: "#ef4444",
    pulse: true,
    glow: "0 0 40px rgba(239, 68, 68, 0.35)",
  },
  connecting: {
    label: "CONNECTING",
    bg: "linear-gradient(135deg, #0c1524 0%, #0f1e38 100%)",
    border: "#1e3a5f",
    textColor: "#60a5fa",
    dotColor: "#3b82f6",
    pulse: false,
    glow: "0 0 40px rgba(59, 130, 246, 0.15)",
  },
};
