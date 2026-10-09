use super::model::{CreateDeviceRequest, DeviceRecord, UpdateDeviceStateRequest};
use super::service::DeviceService;
use crate::api::error::ApiError;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn device_routes(service: Arc<DeviceService>) -> Router {
    Router::new()
        .route("/", get(list_devices).post(create_device))
        .route("/:id", get(get_device).delete(delete_device))
        .route("/:id/state", put(update_device_state))
        .with_state(service)
}

async fn list_devices(
    State(service): State<Arc<DeviceService>>,
) -> Result<Json<Vec<DeviceRecord>>, ApiError> {
    let devices = service.list_devices().await?;
    Ok(Json(devices))
}

async fn get_device(
    State(service): State<Arc<DeviceService>>,
    Path(id): Path<String>,
) -> Result<Json<DeviceRecord>, ApiError> {
    let device = service.get_device(&id).await?;
    Ok(Json(device))
}

async fn create_device(
    State(service): State<Arc<DeviceService>>,
    Json(payload): Json<CreateDeviceRequest>,
) -> Result<Json<DeviceRecord>, ApiError> {
    let device = service.create_device(payload).await?;
    Ok(Json(device))
}

async fn update_device_state(
    State(service): State<Arc<DeviceService>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateDeviceStateRequest>,
) -> Result<Json<Value>, ApiError> {
    service.update_state(&id, payload).await?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_device(
    State(service): State<Arc<DeviceService>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    service.delete_device(&id).await?;
    Ok(Json(json!({ "success": true })))
}
