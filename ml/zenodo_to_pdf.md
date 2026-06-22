# Data Folder — Contents and Source URLs

### Real-Time Health Monitoring via Wearable IoT with Cloud Analytics

**Author:** Lian Jia Jun (Multimedia University)
**Date:** 2026-06-22 · v1.0

---

## Part 1 — Data in this folder (self-collected & generated)

**Permanent archive:** an identical copy is deposited on Zenodo with a DOI —
[https://doi.org/10.5281/zenodo.20793920](https://doi.org/10.5281/zenodo.20793920)
("Real-Time Health Monitoring via Wearable IoT with Cloud Analytics," Lian Jia Jun, 2026-06-22).
License: CC-BY 4.0.

| Folder | Nature | Contents |
|---|---|---|
| `ml/collected_data/` | **REAL — collected** | 7,285 readings across 5 anonymised subjects (`subject_01`–`subject_05`), exported from InfluxDB Cloud via `ml/export_collected_dataset.py`. Collected via the project's own ESP32 + MQTT + bedside InfluxDB pipeline, 2026-05 to 2026-06. Fields: `ts`, `anon_subject_id`, `spo2`, `bpm`, `temperature`, `status` (rule-based), `prediction`/`confidence` (ML), `alert`, `bridge_ts`. No clinical ground-truth diagnostic labels — `status`/`prediction` are the system's own outputs, not external annotations. Consent obtained from all test subjects and a supervisor/ethics check completed prior to publication. |
| `ml/raw/` | **PUBLIC — third-party, archived** | Frozen byte-for-byte snapshot of two Kaggle datasets used to train and externally validate the XGBoost vital-signs risk classifier. Archived here (and on Zenodo) because Kaggle dataset pages are not citable and may be edited or removed by the uploader at any time. See Part 2 for full citations and licences. |
| `ml/` (root .joblib files + `model_metadata.json`) | **Outputs** | Trained XGBoost model, `StandardScaler`, `LabelEncoder`, and an audit-trail JSON (CV AUC, external AUC, recall, etc.). Fully regenerable by re-running `ml/health_risk_ml.ipynb` end-to-end under `GLOBAL_SEED = 42` against the two files in `ml/raw/`. |

---

## Part 2 — Public datasets used (URLs & citations)

### Public dataset 1 — Human Vital Sign Dataset (training data)

- **Publisher:** nasirayub2, via Kaggle
- **Title:** Human Vital Sign Dataset
- **URL:** [https://www.kaggle.com/datasets/nasirayub2/human-vital-sign-dataset](https://www.kaggle.com/datasets/nasirayub2/human-vital-sign-dataset)
- **Licence:** `CC0: Public Domain` (checked on the Kaggle Data Card, 2026-06-22)
- **Role in this project:** Training + internal test split (200,020 rows)
- **Citation:** nasirayub2 (2024). *Human Vital Sign Dataset* [Data set]. Kaggle. [https://www.kaggle.com/datasets/nasirayub2/human-vital-sign-dataset](https://www.kaggle.com/datasets/nasirayub2/human-vital-sign-dataset)

### Public dataset 2 — IoMT Dataset for ML-Based Health Monitoring (external validation)

- **Publisher:** prokashbarmancu, via Kaggle
- **Title:** IoMT Dataset for ML-Based Health Monitoring
- **URL:** [https://www.kaggle.com/datasets/prokashbarmancu/iomt-alert](https://www.kaggle.com/datasets/prokashbarmancu/iomt-alert)
- **Licence:** Kaggle's Data Card lists `"Other (specified in description)"` — the dataset description itself does not actually state any licence terms. No explicit licence could be confirmed as of 2026-06-22. Used here strictly for non-commercial academic research (external domain-shift validation only — never trained on); the original Kaggle page should be re-checked for any future use.
- **Role in this project:** External domain-shift validation only (~50,000 rows), never trained on — used to test generalisation of the model trained on Dataset 1
- **Citation:** prokashbarmancu (n.d.). *IoMT Dataset for ML-Based Health Monitoring* [Data set]. Kaggle. [https://www.kaggle.com/datasets/prokashbarmancu/iomt-alert](https://www.kaggle.com/datasets/prokashbarmancu/iomt-alert)

---

## Notes

- Both raw files in `ml/raw/` and the collected-data file in `ml/collected_data/` are gitignored in this repository (too large / third-party / privacy-sensitive to commit) — the Zenodo deposit above is the permanent, citable copy of all three.
- `ml/collected_data/_patient_id_mapping_DO_NOT_PUBLISH.csv` is **not** part of any public archive — it is the only file that re-links an anonymised `subject_NN` ID back to a real Supabase patient UUID, and stays local-only.
- Random seed for all ML training/validation: `GLOBAL_SEED = 42` (see root `README.md` → Reproducibility).
