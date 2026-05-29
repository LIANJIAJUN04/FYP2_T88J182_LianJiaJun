import type { Reading, AbnormalSegment, Patient } from "@/lib/api";

export type { AbnormalSegment };

export interface AlertHighlight {
  startTs: number; // ms epoch — start of the alert window
  endTs: number;   // ms epoch — end of the alert window
  metric?: string; // 'spo2' | 'bpm' | 'temperature' — auto-switches chart tab
}

export interface HistoryChartProps {
  patientId: string;
  patient?: Patient;        // for Excel report header metadata
  readings: Reading[];
  loading: boolean;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFetch: () => void;
  highlight?: AlertHighlight;
  onMarkAreaClick?: () => void;
  // Called when a clinician clicks an anomaly segment band on the chart.
  // Receives the segment so the caller can open ClinicalCopilot with context.
  onSegmentClick?: (seg: AbnormalSegment) => void;
  // Optional: backend-supplied segments. Falls back to client-side derivation from
  // alert/status fields when omitted or empty.
  abnormalSegments?: AbnormalSegment[];
}
