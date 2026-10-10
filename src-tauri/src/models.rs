//! Tipos enviados ao front. Espelham `src/engine/types.ts` (camelCase).

use serde::Serialize;

use crate::services::catalog::CatalogVoice;

/// Equivalente Rust de `VoiceInfo` do TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub id: String,
    pub language: String,
    pub name: String,
    pub quality: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    pub installed: bool,
    pub source: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    pub license: String,
    /// "yes" | "no" | "unclear" (mesmo que `CommercialUse` no TS)
    pub commercial: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attribution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_url: Option<String>,
}

impl VoiceInfo {
    /// Converte uma entrada do catálogo (sem as URLs de download).
    pub fn from_catalog(v: &CatalogVoice, installed: bool) -> Self {
        Self {
            id: v.id.clone(),
            language: v.language.clone(),
            name: v.name.clone(),
            quality: v.quality.clone(),
            size_bytes: v.size_bytes,
            installed,
            source: v.source,
            gender: v.gender.clone(),
            license: v.license.clone(),
            commercial: v.commercial.clone(),
            license_note: v.license_note.clone(),
            attribution: v.attribution.clone(),
            homepage: v.homepage.clone(),
            sample_url: v.sample_url.clone(),
        }
    }
}

/// Progresso de download enviado pelo `Channel`.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct DownloadProgress {
    pub loaded: u64,
    pub total: u64,
}
