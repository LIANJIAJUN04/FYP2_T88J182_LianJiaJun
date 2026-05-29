"use client";

import type { StreamReading } from "@/components/StatusCard/StatusCard.hooks";

export function prepareChartData(readings: StreamReading[]) {
  return readings.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    spo2: r.spo2,
    bpm: r.bpm,
    temperature: r.temperature,
  }));
}

/**
 * Finds contiguous alert sequences in the rolling readings window and returns
 * pairs of formatted time strings [rangeStart, rangeEnd] for ECharts markArea.
 *
 * Coordinates are the exact time-string values used as xAxis categories, so the
 * bounding box stays pinned to those historical ticks as new data arrives at the
 * right edge of the chart.
 */
export function computeAlertRanges(
  readings: StreamReading[]
): Array<[string, string]> {
  const ranges: Array<[string, string]> = [];
  let rangeStart: string | null = null;
  let lastAlertTime: string | null = null;

  for (const r of readings) {
    const t = new Date(r.ts).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (r.alert) {
      if (rangeStart === null) rangeStart = t;
      lastAlertTime = t;
    } else if (rangeStart !== null) {
      ranges.push([rangeStart, lastAlertTime!]);
      rangeStart = null;
      lastAlertTime = null;
    }
  }
  // Reading window ends while still inside an alert sequence
  if (rangeStart !== null) {
    ranges.push([rangeStart, lastAlertTime!]);
  }

  return ranges;
}
