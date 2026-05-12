"use client";

import { motion } from "framer-motion";
import { getValueColor, getArcPath } from "./GaugeCard.hooks";
import type { GaugeCardProps } from "./GaugeCard.types";

const CX = 80, CY = 80, R = 60;
const START_ANGLE = 150, END_ANGLE = 30;

function valueToAngle(value: number, min: number, max: number): number {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const sweep = END_ANGLE + 360 - START_ANGLE;
  return START_ANGLE + pct * sweep;
}

export function GaugeCard({ metric, value, unit, label, min, max, normalRange, warningRange, icon }: GaugeCardProps) {
  const color = getValueColor(value, normalRange, warningRange);
  const angle = value !== null ? valueToAngle(value, min, max) : START_ANGLE;
  const trackPath = getArcPath(CX, CY, R, START_ANGLE, END_ANGLE + 360 - 0.01);
  const valuePath = value !== null ? getArcPath(CX, CY, R, START_ANGLE, angle) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl p-5 flex flex-col items-center gap-2"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 20px ${color}18`,
      }}
    >
      <div className="flex items-center gap-2 w-full">
        <span style={{ color: "#bec6e0" }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c6c6cd" }}>
          {label}
        </span>
      </div>

      <div className="relative">
        <svg width="160" height="120" viewBox="0 0 160 120">
          <path
            d={trackPath}
            fill="none"
            stroke="#353436"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {valuePath && (
            <motion.path
              d={valuePath}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          )}
          {value !== null && (() => {
            const toRad = (d: number) => (d * Math.PI) / 180;
            const tipX = CX + R * Math.cos(toRad(angle));
            const tipY = CY + R * Math.sin(toRad(angle));
            return (
              <circle
                cx={tipX} cy={tipY} r="5" fill={color}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }}
              />
            );
          })()}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
          <motion.span
            key={value}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-3xl font-black tabular-nums leading-none"
            style={{ color, fontFamily: "'Space Grotesk', monospace" }}
          >
            {value !== null ? (metric === "temperature" ? value.toFixed(1) : Math.round(value)) : "--"}
          </motion.span>
          <span className="text-xs font-medium mt-0.5" style={{ color: "#909097" }}>{unit}</span>
        </div>
      </div>
    </motion.div>
  );
}
