# Light Control GCal Concept (ICS Example)

`light_control` uses the same phase cadence that drives airflow/light coordination to generate deterministic day-level calendar events, then exports them as Google Calendar-compatible ICS text so the phase model can be transported as a portable schedule artifact without network calls.

## How To Run

```bash
python -m unittest discover -s control_room -p 'test_*.py' -v
```

## Unittests As Main Examples

- `test_build_phase_events_matches_month_day_count`: proves monthly event generation is complete for every day in the month.
- `test_export_phase_events_to_ics_has_required_sections`: proves ICS structure contains `VCALENDAR` and `VEVENT` boundaries.
- `test_gcal_ics_example_contains_expected_fields`: proves each event includes `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, and `DESCRIPTION`.
- `test_gcal_ics_example_reflects_phase_cadence`: proves exported summaries follow cadence order (`map`, `balance`, `tighten`, `verify`).
- `test_gcal_ics_example_is_deterministic_for_fixed_input`: proves same year/month input yields stable ICS output.
- `test_gcal_ics_example_integrates_with_case_specific_reference`: proves case-specific reference uses the same calendar event source as the ICS export path.

## Minimal ICS Snippet

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ControlRoom//LightControl//EN
BEGIN:VEVENT
UID:20260301-map@controlroom.local
DTSTAMP:20260301T000000Z
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260302
SUMMARY:ControlRoom Phase: map
DESCRIPTION:Phase map on Monday, 2026-03-01 for airflow-light coordination.
END:VEVENT
END:VCALENDAR
```

## GCal Import Note

Google Calendar supports importing `.ics` files (`Settings -> Import & export -> Import`), which makes this output usable as a local-first phase schedule example.
