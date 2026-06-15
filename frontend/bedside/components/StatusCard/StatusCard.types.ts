export type Status = "normal" | "warning" | "danger" | "connecting" | "disconnected";

export interface StatusConfig {
  label: string;
  bg: string;
  border: string;
  textColor: string;
  dotColor: string;
  pulse: boolean;
  glow: string;
}

export interface StatusCardProps {
  status: Status;
  lastUpdate?: string;
}
