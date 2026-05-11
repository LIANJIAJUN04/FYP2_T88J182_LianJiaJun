"use client";

import type { Reading } from "./LiveChart.types";

export function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function prepareChartData(readings: Reading[]) {
  return readings.map((r) => ({
    time: formatTime(r.ts),
    spo2: r.spo2,
    bpm: r.bpm,
    temperature: r.temperature,
  }));
}
