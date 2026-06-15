"use client";

import { useEffect, useRef, useState } from "react";
import { getStreamUrl } from "@/lib/api";
import type { Status } from "./StatusCard.types";

export interface StreamReading {
  spo2: number;
  bpm: number;
  temperature: number;
  status: Status;
  /** ML model prediction: "normal" | "anomaly" */
  prediction: string;
  confidence: number;
  alert: boolean;
  ts: string;
}

export function useSSEStream() {
  const [latest, setLatest] = useState<StreamReading | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [readings, setReadings] = useState<StreamReading[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      if (esRef.current) esRef.current.close();

      const es = new EventSource(getStreamUrl());
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status === "disconnected") {
            setStatus("disconnected");
            setLatest(null);
            return;
          }
          const reading = data as StreamReading;
          setLatest(reading);
          setStatus(reading.status as Status);
          setReadings((prev) => {
            const next = [...prev, reading];
            return next.slice(-60);
          });
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
  }, []);

  return { latest, status, readings };
}
