"""
ML inference module for health-risk classification.

Model  : XGBoost (trained in ML/health_risk_ml.ipynb)
Artefacts live at: <project_root>/ML/

Feature order (must match training — see ML/ml.md Section 6):
  [BPM, Temperature, SpO2, temp_deviation, hr_spo2_ratio]

  temp_deviation = abs(temperature - 37.0)
  hr_spo2_ratio  = BPM / SpO2

Clinical threshold: 0.5380  (Youden's J, OOF-tuned — see Section 11)
Label mapping: "High Risk" → "anomaly" | "Low Risk" → "normal"

Probability index: predict_proba(X)[0][0] == P(High Risk)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Resolve <project_root>/ML relative to this file's location
# predict.py is at:  backend/local/ml/predict.py
# project root:      ../../../../  (4 levels up)
_ML_DIR = Path(__file__).resolve().parent.parent.parent.parent / "ML"

_THRESHOLD: float = 0.5380  # Youden's J (from model_metadata.json — Section 11)

_FEATURE_NAMES = ["BPM", "Temperature", "SpO2", "temp_deviation", "hr_spo2_ratio"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_model() -> dict[str, Any] | None:
    """
    Load model artefacts from ML/.
    Returns a dict {model, scaler, encoder} or None if any file is missing.
    Called once at FastAPI startup and stored in app.state.ml_model.
    """
    try:
        model = joblib.load(_ML_DIR / "health_risk_model.joblib")
        scaler = joblib.load(_ML_DIR / "health_risk_scaler.joblib")
        encoder = joblib.load(_ML_DIR / "health_risk_label_encoder.joblib")
        logger.info("[ML] Artefacts loaded from %s", _ML_DIR)
        return {"model": model, "scaler": scaler, "encoder": encoder}
    except Exception as exc:
        logger.warning(
            "[ML] Could not load artefacts from %s: %s — predictions will default to 'normal'",
            _ML_DIR,
            exc,
        )
        return None


def run_inference(
    artefacts: dict[str, Any] | None,
    bpm: int | float,
    temperature: float,
    spo2: float | None,
) -> dict[str, Any]:
    """
    Run ML inference on a single vital-sign reading.

    Args:
        artefacts:   dict returned by load_model(), or None (graceful no-op).
        bpm:         Heart rate in beats per minute.
        temperature: Body temperature in °C.
        spo2:        SpO₂ percentage, or None if sensor unavailable.

    Returns:
        {
          "prediction": "normal" | "anomaly",
          "confidence": float  # probability of the predicted class (0–1)
        }

    Falls back to {"prediction": "normal", "confidence": 0.0} if:
      - artefacts is None (model not loaded)
      - spo2 is None (can't compute hr_spo2_ratio)
      - any unexpected exception during inference
    """
    if artefacts is None or spo2 is None:
        return {"prediction": "normal", "confidence": 0.0}

    try:
        temp_deviation = abs(float(temperature) - 37.0)
        hr_spo2_ratio = float(bpm) / max(float(spo2), 0.001)  # guard ÷0

        # Shape: (1, 5) — named columns must match what the scaler was fitted on
        X_raw = pd.DataFrame(
            [[float(bpm), float(temperature), float(spo2), temp_deviation, hr_spo2_ratio]],
            columns=_FEATURE_NAMES,
        )
        X_scaled = artefacts["scaler"].transform(X_raw)

        # predict_proba → [[P(High Risk), P(Low Risk)]]
        # label_classes = ["High Risk", "Low Risk"]  (index 0 = High Risk)
        prob_high_risk: float = float(artefacts["model"].predict_proba(X_scaled)[0][0])

        is_anomaly = prob_high_risk >= _THRESHOLD
        # Return the confidence of the *predicted* class
        confidence = prob_high_risk if is_anomaly else (1.0 - prob_high_risk)

        return {
            "prediction": "anomaly" if is_anomaly else "normal",
            "confidence": round(confidence, 4),
        }
    except Exception as exc:
        logger.warning("[ML] Inference error: %s — defaulting to 'normal'", exc)
        return {"prediction": "normal", "confidence": 0.0}
