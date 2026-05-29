export interface Reading {
  ts: string;
  spo2: number;
  bpm: number;
  temperature: number;
  status: string;
  alert: boolean;
}

export interface LiveChartProps {
  readings: Reading[];
}
