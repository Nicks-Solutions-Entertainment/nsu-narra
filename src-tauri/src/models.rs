//! Tipos enviados ao front. Espelham `src/engine/types.ts` (camelCase).

use serde::Serialize;

/// Equivalente Rust de `VoiceInfo` do TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub id: String,
    pub language: String,
    pub name: String,
    pub quality: String,
    pub size_bytes: Option<u64>,
    pub installed: bool,
}

/// Progresso de download enviado pelo `Channel`.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct DownloadProgress {
    pub loaded: u64,
    pub total: u64,
}
