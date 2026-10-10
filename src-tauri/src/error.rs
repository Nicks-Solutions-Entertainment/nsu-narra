//! Erros do back-end. Serializados como string para o front (`invoke` rejeita
//! a Promise com a mensagem).

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Voz desconhecida: {0}")]
    UnknownVoice(String),

    #[error("A voz {0} não está instalada. Baixe-a antes de gerar.")]
    VoiceNotInstalled(String),

    #[error("A voz {0} já está sendo baixada.")]
    AlreadyDownloading(String),

    #[error("Download cancelado.")]
    Cancelled,

    #[error("Digite algum texto para gerar o áudio.")]
    EmptyText,

    #[error("Piper não encontrado. Instale com `pip install piper-tts` ou defina PIPER_BIN.")]
    PiperNotFound,

    #[error("O Piper falhou: {0}")]
    Piper(String),

    #[error("Falha de rede: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Erro de arquivo: {0}")]
    Io(#[from] std::io::Error),

    #[error("Catálogo de vozes inválido: {0}")]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
