export interface GaugeCardProps {
  metric: string;
  value: number | null;
  unit: string;
  label: string;
  min: number;
  max: number;
  normalRange: [number, number];
  warningRange: [number, number];
  icon: React.ReactNode;
}
