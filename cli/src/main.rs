//! piper-cli — converte um roteiro `.txt` em narração `.wav` usando o Piper.
//!
//! Uso: `piper-cli <roteiro.txt> <voz.onnx> <saida.wav>`
//!
//! O executável do Piper é procurado no PATH (`piper`) ou na variável de
//! ambiente `PIPER_BIN`.

mod args;
mod piper;

use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("erro: {err}");
            ExitCode::FAILURE
        }
    }
}

/// Fluxo principal: lê argumentos, lê o roteiro e chama o Piper.
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = args::Args::parse(std::env::args().skip(1))?;

    let text = std::fs::read_to_string(&args.script)?;
    if text.trim().is_empty() {
        return Err("o roteiro está vazio".into());
    }

    piper::synthesize_to_file(&text, &args.model, &args.output)?;

    println!("Áudio salvo em {}", args.output.display());
    Ok(())
}
