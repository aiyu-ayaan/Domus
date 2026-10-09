#[tokio::main]
async fn main() -> anyhow::Result<()> {
    docus_backend::bootstrap::bootstrap().await
}
