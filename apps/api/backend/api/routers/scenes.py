from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_scenes() -> list[dict]:
    return [
        {"id": "scene-1", "name": "Movie Night"},
        {"id": "scene-2", "name": "Away Mode"},
        {"id": "scene-3", "name": "Sleep Mode"}
    ]
