//! Live event stream for the UI. Device events are filtered by the user's access.

use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
use crate::modules::devices::service::visible_ids;
use axum::{
    extract::{ws::Message, ws::WebSocket, State, WebSocketUpgrade},
    response::Response,
};
use std::collections::HashSet;
use tokio::sync::broadcast::error::RecvError;

pub async fn ws_handler(State(s): State<AppState>, user: AuthUser, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| stream(socket, s, user))
}

/// On a failed lookup the user sees no device events rather than all of them.
async fn visible(s: &AppState, user: &AuthUser) -> Option<HashSet<String>> {
    visible_ids(s, user).await.unwrap_or_else(|_| Some(HashSet::new()))
}

async fn stream(mut socket: WebSocket, s: AppState, mut user: AuthUser) {
    let mut rx = s.bus.subscribe();
    let mut visible = visible(&s, &user).await;
    let _ = socket.send(Message::Text(r#"{"type":"connected"}"#.into())).await;

    loop {
        tokio::select! {
            event = rx.recv() => {
                let event = match event {
                    Ok(e) => e,
                    // Client missed events: tell it to refetch.
                    Err(RecvError::Lagged(_)) => {
                        if socket.send(Message::Text(r#"{"type":"resync"}"#.into())).await.is_err() { return; }
                        continue;
                    }
                    Err(RecvError::Closed) => return,
                };
                // Access may have changed: an open socket must not outlive a revoked grant or a deleted account.
                if matches!(event, SystemEvent::UsersChanged | SystemEvent::UserUpdated { .. } | SystemEvent::RoomsChanged) {
                    match AuthUser::load(&s.pool, &user.id).await {
                        Ok(Some(u)) => user = u,
                        Ok(None) => return,
                        Err(_) => {}
                    }
                    visible = self::visible(&s, &user).await;
                }
                if matches!(event, SystemEvent::DeviceAdded { .. } | SystemEvent::DeviceUpdated { .. } | SystemEvent::DeviceRemoved { .. }) {
                    visible = self::visible(&s, &user).await;
                }
                if let (Some(set), Some(id)) = (&visible, event.device_id()) {
                    if !set.contains(id) && !matches!(event, SystemEvent::DeviceRemoved { .. }) {
                        continue;
                    }
                }
                // Discovery details are admin-only.
                if !user.is_admin() && matches!(event, SystemEvent::DeviceDiscovered { .. }) {
                    continue;
                }
                let Ok(text) = serde_json::to_string(&event) else { continue };
                if socket.send(Message::Text(text)).await.is_err() {
                    return;
                }
            }
            msg = socket.recv() => match msg {
                Some(Ok(Message::Ping(p))) => { let _ = socket.send(Message::Pong(p)).await; }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return,
                _ => {}
            }
        }
    }
}
