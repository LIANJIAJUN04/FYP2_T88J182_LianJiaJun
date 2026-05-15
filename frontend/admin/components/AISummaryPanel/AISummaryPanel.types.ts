export interface AISummaryPanelProps {
  patientId: string;
  token: string;
}

export interface SummaryState {
  range: string;
  summary: string | null;
  period: string | null;
  readingsCount: number | null;
  loading: boolean;
  error: string | null;
}

export const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "1h",  label: "Last 1 hour" },
  { value: "6h",  label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d",  label: "Last 7 days" },
];
