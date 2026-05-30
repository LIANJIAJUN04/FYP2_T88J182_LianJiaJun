"use client";

import { useEffect, useRef, useState } from "react";
import { getStreamUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Status } from "./StatusCard.types";

export interface StreamReading {
  spo2: number;
  bpm: number;
  temperature: number;
  status: Status;
  /** ML model prediction: "normal" | "anomaly" */
  prediction: string;
  /** Confidence of the predicted ML class (0–1). Added in Phase 9. */
  confidence?: number;
  alert: boolean;
  ts: string;
}

// A reading is considered stale (device offline) when its timestamp is
// more than 15 s behind wall-clock time. The cloud SSE re-sends the last
// InfluxDB reading every 2 s, so a frozen ts advances the stale clock.
const STALE_THRESHOLD_MS = 15_000;

export function useCloudSSEStream(patientId: string) {
  const [latest, setLatest] = useState<StreamReading | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [readings, setReadings] = useState<StreamReading[]>([]);
  const [isStale, setIsStale] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!patientId) return;

    function connect() {
      if (esRef.current) esRef.current.close();
      const token = getToken() ?? "";
      const url = getStreamUrl(patientId, token);
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data: StreamReading = JSON.parse(e.data);
          const readingAge = Date.now() - new Date(data.ts).getTime();
          setIsStale(readingAge > STALE_THRESHOLD_MS);
          setLatest(data);
          setStatus(data.status as Status);
          setReadings((prev) => [...prev, data].slice(-60));
        } catch (err) {
          console.warn("[SSE] Parse error:", err);
        }
      };

      es.onerror = () => {
        setStatus("connecting");
        es.close();
        reconnectRef.current = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      esRef.current?.close();
    };
  }, [patientId]);

  return { latest, status, readings, isStale };
}
