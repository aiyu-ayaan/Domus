from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_rooms() -> list[dict]:
    return [
        {"id": "room-1", "name": "Living Room"},
        {"id": "room-2", "name": "Bedroom"},
        {"id": "room-3", "name": "Kitchen"}
    ]
