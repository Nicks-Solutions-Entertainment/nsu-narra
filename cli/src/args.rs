//! Leitura dos argumentos de linha de comando (sem crates).

use std::path::PathBuf;

const USAGE: &str = "uso: piper-cli <roteiro.txt> <voz.onnx> <saida.wav>";

/// Argumentos validados da CLI.
#[derive(Debug)]
pub struct Args {
    /// Arquivo de texto com o roteiro.
    pub script: PathBuf,
    /// Modelo `.onnx` da voz (o `.onnx.json` deve estar ao lado).
    pub model: PathBuf,
    /// Arquivo `.wav` de saída.
    pub output: PathBuf,
}

impl Args {
    /// Interpreta exatamente três argumentos posicionais.
    ///
    /// Recebe um iterador (em vez de ler `env::args` direto) para ser testável.
    pub fn parse(mut it: impl Iterator<Item = String>) -> Result<Self, String> {
        let (Some(script), Some(model), Some(output), None) = (it.next(), it.next(), it.next(), it.next())
        else {
            return Err(USAGE.to_string());
        };

        let model = PathBuf::from(model);
        if !model.is_file() {
            return Err(format!("modelo não encontrado: {}", model.display()));
        }

        Ok(Self { script: script.into(), model, output: output.into() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: &[&str]) -> impl Iterator<Item = String> {
        v.iter().map(|s| s.to_string()).collect::<Vec<_>>().into_iter()
    }

    #[test]
    fn rejeita_numero_errado_de_argumentos() {
        assert!(Args::parse(args(&["a.txt"])).is_err());
        assert!(Args::parse(args(&["a", "b", "c", "d"])).is_err());
    }

    #[test]
    fn rejeita_modelo_inexistente() {
        let err = Args::parse(args(&["a.txt", "nao-existe.onnx", "out.wav"])).unwrap_err();
        assert!(err.contains("modelo não encontrado"));
    }
}
