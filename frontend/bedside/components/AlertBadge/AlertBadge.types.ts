export interface AlertBadgeProps {
  prediction: string;   // "normal" | "anomaly"
  confidence: number;   // 0–1 probability of the predicted class
}
