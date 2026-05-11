import type { Reading } from "@/lib/api";

export interface HistoryChartProps {
  readings: Reading[];
  loading: boolean;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFetch: () => void;
}
