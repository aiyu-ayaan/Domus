#[tokio::main]
async fn main() -> anyhow::Result<()> {
    domus_backend::bootstrap::bootstrap().await
}
