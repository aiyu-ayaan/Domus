#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if domus_backend::cli::run(&args).await? {
        return Ok(());
    }
    domus_backend::bootstrap::bootstrap().await
}
