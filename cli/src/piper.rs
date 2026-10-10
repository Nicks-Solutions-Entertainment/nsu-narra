//! Execução do Piper como processo externo.

use std::{
    ffi::OsString,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

/// Caminho do executável: `PIPER_BIN` ou `piper` no PATH.
pub fn piper_bin() -> OsString {
    std::env::var_os("PIPER_BIN").unwrap_or_else(|| "piper".into())
}

/// Gera `output` a partir de `text` com o modelo `model`.
///
/// O texto vai pelo stdin (sem limite de tamanho de linha de comando).
/// Quebras de linha viram espaços para o Piper produzir um único arquivo.
///
/// Flags `-m` (modelo) e `-f` (arquivo de saída): conferir `docs/CLI.md`
/// do `piper-tts` instalado se a versão mudar.
pub fn synthesize_to_file(text: &str, model: &Path, output: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let mut child = Command::new(piper_bin())
        .arg("-m")
        .arg(model)
        .arg("-f")
        .arg(output)
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("não foi possível executar o piper ({e}). Instale com `pip install piper-tts` ou defina PIPER_BIN."))?;

    // `take()` move o stdin para fora do `child`; ao sair do bloco ele é
    // fechado (drop), sinalizando fim de entrada para o Piper.
    {
        let mut stdin = child.stdin.take().ok_or("stdin do piper indisponível")?;
        stdin.write_all(normalize(text).as_bytes())?;
    }

    let status = child.wait()?;
    if !status.success() {
        return Err(format!("piper terminou com erro: {status}").into());
    }
    Ok(())
}

/// Colapsa espaços e quebras de linha em um único espaço.
fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn normaliza_quebras_de_linha() {
        assert_eq!(normalize("Olá,\n  mundo.\r\n\nFim."), "Olá, mundo. Fim.");
    }
}
