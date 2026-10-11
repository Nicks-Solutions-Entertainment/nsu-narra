//! Execução do Piper como processo externo.
//!
//! Fase 3: hoje usa `piper` do PATH (ou `PIPER_BIN`). Para o instalador final,
//! trocar por um sidecar empacotado (`bundle.externalBin`), ver concept.md §10.3.

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicU64, Ordering},
};

use tokio::{io::AsyncWriteExt, process::Command};

use crate::error::{AppError, AppResult};

/// Ritmo da fala: alonga os fonemas (1.0 = padrão do modelo, rápido demais
/// para narração). Manter igual a `SPEECH_PACE` em `src/engine/wasm/speech-pace.ts`.
const LENGTH_SCALE: &str = "1.2";

/// Caminho do executável: `PIPER_BIN` ou `piper` no PATH.
fn piper_bin() -> OsString {
    std::env::var_os("PIPER_BIN").unwrap_or_else(|| "piper".into())
}

/// Gera um WAV a partir de `text` usando o modelo `model` e devolve os bytes.
///
/// Desempenho:
/// - Processo assíncrono (`tokio::process`): não bloqueia threads do runtime
///   enquanto o Piper trabalha.
/// - Uma única execução para o texto inteiro: o modelo é carregado uma vez e
///   o Piper divide as frases internamente.
/// - Arquivo temporário com nome único por chamada (gerações simultâneas não
///   colidem) e removido ao final.
pub async fn synthesize(model: &Path, text: &str) -> AppResult<Vec<u8>> {
    let out = unique_temp_wav();
    let result = run_piper(model, text, &out).await;
    let bytes = match result {
        Ok(()) => tokio::fs::read(&out).await.map_err(AppError::from),
        Err(e) => Err(e),
    };
    let _ = tokio::fs::remove_file(&out).await;
    bytes
}

async fn run_piper(model: &Path, text: &str, out: &Path) -> AppResult<()> {
    let mut cmd = Command::new(piper_bin());
    // Flags -m / -f: conferir docs/CLI.md do piper-tts instalado.
    cmd.arg("-m")
        .arg(model)
        .arg("-f")
        .arg(out)
        .arg("--length_scale")
        .arg(LENGTH_SCALE)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: não abre uma janela de console a cada geração.
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::PiperNotFound,
        _ => AppError::Io(e),
    })?;

    // Envia o texto e fecha o stdin (drop) para sinalizar fim da entrada.
    {
        let mut stdin = child.stdin.take().ok_or_else(|| AppError::Piper("stdin indisponível".into()))?;
        stdin.write_all(normalize(text).as_bytes()).await?;
    }

    let output = child.wait_with_output().await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr.lines().rev().take(3).collect::<Vec<_>>().join(" | ");
        return Err(AppError::Piper(format!("{} {tail}", output.status)));
    }
    Ok(())
}

/// Colapsa quebras de linha e espaços para gerar um único arquivo.
fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn unique_temp_wav() -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("narra-{}-{n}.wav", std::process::id()))
}
