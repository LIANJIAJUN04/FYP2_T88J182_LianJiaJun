def get_status(spo2: float, bpm: int, temperature: float) -> str:
    if (
        spo2 < 90
        or bpm < 40
        or bpm > 130
        or temperature > 38
        or temperature < 35
    ):
        return "danger"
    elif (
        spo2 < 95
        or bpm < 60
        or bpm > 100
        or temperature > 37.2
    ):
        return "warning"
    else:
        return "normal"
