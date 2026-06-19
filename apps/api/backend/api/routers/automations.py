from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_automations() -> list[dict]:
    return [
        {"id": "auto-1", "name": "Motion -> Hallway Lights", "enabled": True},
        {"id": "auto-2", "name": "Sunset -> Outdoor Lights", "enabled": True},
        {"id": "auto-3", "name": "Offline -> Notify", "enabled": True}
    ]
