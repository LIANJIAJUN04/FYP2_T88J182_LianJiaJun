"use client";

import type { StreamReading } from "@/components/StatusCard/StatusCard.hooks";

export function prepareChartData(readings: StreamReading[]) {
  return readings.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    spo2: r.spo2,
    bpm: r.bpm,
    temperature: r.temperature,
  }));
}
