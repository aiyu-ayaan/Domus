pub mod model;
pub mod repository;
pub mod routes;
pub mod service;

pub use repository::DeviceRepository;
pub use routes::{device_routes, discovery_routes};
