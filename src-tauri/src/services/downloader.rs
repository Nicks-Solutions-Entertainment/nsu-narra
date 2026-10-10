//! Download em streaming com progresso e cancelamento.

use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use futures_util::StreamExt;
use tokio::io::{AsyncWriteExt, BufWriter};

use crate::error::{AppError, AppResult};

/// Baixa `url` para `dest`.
///
/// - Streaming: grava bloco a bloco, memória constante mesmo com modelos de ~60 MB.
/// - Atômico: escreve em `<dest>.part` e só renomeia no fim; um download
///   interrompido nunca deixa um modelo corrompido no lugar do final.
/// - `cancel` é verificado entre blocos.
/// - `on_progress(loaded, total)` é chamado a cada bloco; quem chama decide o throttle.
pub async fn download_to(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    cancel: &AtomicBool,
    on_progress: impl FnMut(u64, u64),
) -> AppResult<()> {
    let part = part_path(dest);
    let result = stream_to(client, url, &part, cancel, on_progress).await;

    match result {
        Ok(()) => {
            tokio::fs::rename(&part, dest).await?;
            Ok(())
        }
        Err(err) => {
            let _ = tokio::fs::remove_file(&part).await;
            Err(err)
        }
    }
}

async fn stream_to(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64, u64),
) -> AppResult<()> {
    let res = client.get(url).send().await?.error_for_status()?;
    let total = res.content_length().unwrap_or(0);

    let mut file = BufWriter::with_capacity(256 * 1024, tokio::fs::File::create(part).await?);
    let mut stream = res.bytes_stream();
    let mut loaded = 0u64;

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        loaded += chunk.len() as u64;
        on_progress(loaded, total);
    }

    file.flush().await?;
    Ok(())
}

fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}
