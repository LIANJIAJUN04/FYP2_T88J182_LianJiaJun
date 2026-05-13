def get_status(spo2: float | None, bpm: int, temperature: float) -> str:
    temp_available = temperature != 0.0

    if (
        (spo2 is not None and spo2 < 90)
        or bpm < 40
        or bpm > 130
        or (temp_available and temperature > 38)
        or (temp_available and temperature < 35)
    ):
        return "danger"
    elif (
        (spo2 is not None and spo2 < 95)
        or bpm < 60
        or bpm > 100
        or (temp_available and temperature > 37.2)
    ):
        return "warning"
    else:
        return "normal"
