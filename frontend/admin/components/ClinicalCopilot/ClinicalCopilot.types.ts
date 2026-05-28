export interface CopilotReadingPoint {
  ts: string;
  spo2: number;
  bpm: number;
  temperature: number;
}

export interface ClinicalContext {
  alertId: string;
  metric: string;
  value: number;
  triggeredAt: string;
  resolvedAt: string | null;
  readingsSlice: CopilotReadingPoint[];
}

export interface ClinicalCopilotProps {
  isOpen: boolean;
  onClose: () => void;
  context: ClinicalContext | null;
  analysis: string | null;
  loading: boolean;
  error: string | null;
}
