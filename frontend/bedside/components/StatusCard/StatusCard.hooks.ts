"use client";

import { useEffect, useRef, useState } from "react";
import { getStreamUrl } from "@/lib/api";
import type { Status } from "./StatusCard.types";

export interface StreamReading {
  spo2: number;
  bpm: number;
  temperature: number;
  status: Status;
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

  useEffect(() => {
    function connect() {
      if (esRef.current) esRef.current.close();

      const es = new EventSource(getStreamUrl());
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data: StreamReading = JSON.parse(e.data);
          setLatest(data);
          setStatus(data.status as Status);
          setReadings((prev) => {
            const next = [...prev, data];
            return next.slice(-60);
          });
        } catch {}
      };

      es.onerror = () => {
        setStatus("connecting");
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      esRef.current?.close();
    };
  }, []);

  return { latest, status, readings };
}
