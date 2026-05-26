export type MLPrediction = "normal" | "anomaly";

export interface MLBadgeProps {
  /** ML model prediction from the cloud SSE stream */
  prediction: MLPrediction;
  /** Confidence of the *predicted* class (0–1). Optional — hidden when 0. */
  confidence?: number;
}
