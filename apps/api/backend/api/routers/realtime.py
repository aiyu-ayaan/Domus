from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/events")
async def event_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        await websocket.send_json({"type": "connected", "scope": "domus-realtime"})
        while True:
            message = await websocket.receive_text()
            await websocket.send_json({"type": "echo", "message": message})
    except WebSocketDisconnect:
        return
