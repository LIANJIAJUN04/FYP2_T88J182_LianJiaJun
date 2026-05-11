export type MetricKey = "spo2" | "bpm" | "temperature";

export interface GaugeCardProps {
  metric: MetricKey;
  value: number | null;
  unit: string;
  label: string;
  min: number;
  max: number;
  normalRange: [number, number];
  warningRange: [number, number];
  icon: React.ReactNode;
}
