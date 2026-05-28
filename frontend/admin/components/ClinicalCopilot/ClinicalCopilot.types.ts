export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  timestamp: Date;
  isError?: boolean;
}

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
  messages: ChatMessage[];
  initializing: boolean;
  sending: boolean;
  onSendMessage: (message: string) => Promise<void>;
}
