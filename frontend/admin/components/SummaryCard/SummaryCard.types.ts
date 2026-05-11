export interface SummaryCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  description?: string;
  loading?: boolean;
}
