"""Unit tests for status.py — get_status() boundary conditions."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from status import get_status


# ── Normal range ────────────────────────────────────────────────────────────

def test_all_normal():
    assert get_status(spo2=97.0, bpm=75, temperature=36.8) == "normal"

def test_normal_lower_boundary():
    # spo2=95, bpm=60, temp=36.1 — all exactly at the normal lower edge
    assert get_status(spo2=95.0, bpm=60, temperature=36.1) == "normal"

def test_normal_upper_boundary():
    # bpm=100, temp=37.2 — exactly at the normal upper edge
    assert get_status(spo2=99.0, bpm=100, temperature=37.2) == "normal"


# ── Warning range ───────────────────────────────────────────────────────────

def test_warning_low_spo2():
    # spo2=94 is in warning zone (90–94)
    assert get_status(spo2=94.0, bpm=75, temperature=36.8) == "warning"

def test_warning_high_bpm():
    # bpm=101 just above normal (100)
    assert get_status(spo2=97.0, bpm=101, temperature=36.8) == "warning"

def test_warning_low_bpm():
    # bpm=59 just below normal (60)
    assert get_status(spo2=97.0, bpm=59, temperature=36.8) == "warning"

def test_warning_high_temp():
    # temp=37.3 just above normal (37.2)
    assert get_status(spo2=97.0, bpm=75, temperature=37.3) == "warning"


# ── Danger range ─────────────────────────────────────────────────────────────

def test_danger_low_spo2():
    assert get_status(spo2=89.0, bpm=75, temperature=36.8) == "danger"

def test_danger_spo2_boundary():
    # spo2=90 is danger (< 90 means < 90, so 89.9 is danger, 90 is warning)
    assert get_status(spo2=90.0, bpm=75, temperature=36.8) == "warning"

def test_danger_high_bpm():
    assert get_status(spo2=97.0, bpm=131, temperature=36.8) == "danger"

def test_danger_low_bpm():
    assert get_status(spo2=97.0, bpm=39, temperature=36.8) == "danger"

def test_danger_high_temp():
    assert get_status(spo2=97.0, bpm=75, temperature=38.1) == "danger"

def test_danger_low_temp():
    assert get_status(spo2=97.0, bpm=75, temperature=34.9) == "danger"

def test_danger_beats_warning():
    # spo2=94 (warning) + bpm=131 (danger) → should be danger
    assert get_status(spo2=94.0, bpm=131, temperature=36.8) == "danger"


# ── SpO2 = None (sensor unavailable) ────────────────────────────────────────

def test_spo2_none_normal():
    # Without SpO2 data, normal vitals remain normal
    assert get_status(spo2=None, bpm=75, temperature=36.8) == "normal"

def test_spo2_none_danger_from_bpm():
    # SpO2 unavailable but BPM is critical
    assert get_status(spo2=None, bpm=35, temperature=36.8) == "danger"

def test_spo2_none_warning_from_temp():
    assert get_status(spo2=None, bpm=75, temperature=37.5) == "warning"


# ── Temperature = 0.0 (sensor unavailable sentinel) ──────────────────────────

def test_temp_zero_ignored():
    # temp=0.0 is treated as unavailable — should not trigger danger/warning
    assert get_status(spo2=97.0, bpm=75, temperature=0.0) == "normal"
