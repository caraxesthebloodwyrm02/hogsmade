# Control Room Test README

This folder is a small simulation of airflow and light coordination.
It produces runtime status text, visual transport references, and calendar phase artifacts (including Google Calendar-compatible ICS output).
Use this page as a fast revision card.

## Run All Tests

```bash
python -m unittest discover -s control_room -p 'test_*.py' -v
```

## 30-Second Mental Model

1. Airflow readings become a category (`Smooth Flow`, `Thermal Drift`, `Air Drift`, `Correction Zone`).
2. The category maps to a light phase (`Cruise`, `Warm Shift`, `Vector Shift`, `Recovery`).
3. Interval nodes move through realtime transport lanes.
4. Calendar phases become deterministic ICS events for GCal-style import.

## Smoke Tests (Quick Confidence)

- `test_smoke_runtime_packet_pipeline` in `test_smoke.py`:
Checks that airflow runtime text and airflow->light packet generation both work in one pass.
- `test_smoke_visual_and_gcal_artifacts` in `test_smoke.py`:
Checks that visual transport output and GCal ICS output are generated with expected markers.

## Main Unit Tests By Purpose

- `test_airflow.py`:
Validates fallback rules, thresholds, cadence/rhythm mapping, and visual reference structure.
- `test_light_control.py`:
Validates airflow->light mapping, reverse hints, calendar phase tracking, ICS export fields, cadence order, deterministic output, and integration consistency.

## Fast Revision Prompts

- Can I explain how a wait-time interval affects airflow state?
- Can I explain how airflow category changes light phase?
- Can I explain what makes the ICS output deterministic and import-friendly?
- Can I name the two smoke tests and what they protect?
