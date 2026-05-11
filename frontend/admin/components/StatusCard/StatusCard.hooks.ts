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
  prediction: string;
  alert: boolean;
  ts: string;
}

export function useCloudSSEStream(patientId: string) {
  const [latest, setLatest] = useState<StreamReading | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [readings, setReadings] = useState<StreamReading[]>([]);
  const esRef = useRef<EventSource | null>(null);

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
          setLatest(data);
          setStatus(data.status as Status);
          setReadings((prev) => [...prev, data].slice(-60));
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
  }, [patientId]);

  return { latest, status, readings };
}
