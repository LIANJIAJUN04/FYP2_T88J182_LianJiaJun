import type { Reading, AbnormalSegment } from "@/lib/api";

export type { AbnormalSegment };

export interface AlertHighlight {
  startTs: number; // ms epoch — start of the alert window
  endTs: number;   // ms epoch — end of the alert window
  metric?: string; // 'spo2' | 'bpm' | 'temperature' — auto-switches chart tab
}

export interface HistoryChartProps {
  patientId: string;
  readings: Reading[];
  loading: boolean;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFetch: () => void;
  highlight?: AlertHighlight;
  onMarkAreaClick?: () => void;
  abnormalSegments?: AbnormalSegment[];
}
