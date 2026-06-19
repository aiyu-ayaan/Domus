from fastapi import APIRouter

router = APIRouter()


@router.get("")
def dashboard_summary() -> dict[str, object]:
    return {
        "devices": 42,
        "rooms": 7,
        "automations": 18,
        "energy_today_kwh": 12.8,
        "events": [
            "Motion detected in hallway",
            "Outdoor lights activated at sunset",
            "Bedroom switched to sleep mode"
        ]
    }
