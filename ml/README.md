# ML — Anomaly Detection

Notebooks and data for training the health-risk anomaly detection model used in Phase 9.

## Goal

Detect subtle anomalies **not** caught by the rule-based thresholds — unusual patterns within technically normal ranges (e.g. SpO₂ fluctuating rapidly at 95%).

## Structure

```
ml/
├── collect_data.ipynb     # Export readings from InfluxDB, engineer rolling features
├── train_model.ipynb      # Train XGBoost model, tune threshold, export artefacts
└── data/
    └── readings.csv       # Raw exported readings (gitignored if large)
```

## Algorithm

- **Phase 1 (no labels):** Isolation Forest (`contamination=0.05`)
- **Phase 2 (labeled):** XGBoost binary classifier

## Features

| Feature | Description |
|---|---|
| `BPM` | Heart rate |
| `Temperature` | Body temperature °C |
| `SpO2` | Blood oxygen % |
| `temp_deviation` | `abs(temperature - 37.0)` |
| `hr_spo2_ratio` | `BPM / SpO2` |

## Training

1. Run `collect_data.ipynb` — exports from InfluxDB and engineers features
2. Run `train_model.ipynb` — trains, evaluates (target < 5% false positive), exports:
   - `health_risk_model.joblib`
   - `health_risk_scaler.joblib`
   - `health_risk_label_encoder.joblib`
3. The artefacts are loaded by `backend/local/ml/predict.py` at FastAPI startup

## Clinical Threshold

Youden's J statistic (OOF-tuned): **0.5380**. Probability index: `predict_proba(X)[0][0]` = P(High Risk).

## Notes

- Model artefacts are **gitignored** — retrain locally after cloning
- The `predict.py` inference module gracefully falls back to `"normal"` if artefacts are missing
- Safety override in `readings.py`: if rule-based status is DANGER, ML prediction is forced to `"anomaly"` to avoid clinically misleading disagreement
