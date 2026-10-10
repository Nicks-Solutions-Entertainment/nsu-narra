//! Catálogo de vozes do repositório `rhasspy/piper-voices` no Hugging Face.

use std::collections::HashMap;

use serde::Deserialize;

use crate::error::AppResult;

/// Base para baixar arquivos do repositório de vozes.
pub const HF_BASE: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const VOICES_JSON: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json";

/// Voz do catálogo com o caminho do modelo no repositório.
#[derive(Debug, Clone)]
pub struct CatalogVoice {
    pub id: String,
    pub language: String,
    pub name: String,
    pub quality: String,
    pub size_bytes: Option<u64>,
    /// Caminho relativo do `.onnx`, ex.: `pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx`.
    pub model_path: String,
}

impl CatalogVoice {
    pub fn model_url(&self) -> String {
        format!("{HF_BASE}/{}", self.model_path)
    }

    pub fn config_url(&self) -> String {
        format!("{HF_BASE}/{}.json", self.model_path)
    }
}

// Formato do voices.json (só os campos usados; o resto é ignorado pelo serde).
#[derive(Deserialize)]
struct RawVoice {
    key: String,
    name: String,
    language: RawLanguage,
    quality: String,
    files: HashMap<String, RawFile>,
}

#[derive(Deserialize)]
struct RawLanguage {
    code: String,
}

#[derive(Deserialize)]
struct RawFile {
    size_bytes: u64,
}

/// Baixa o `voices.json` e retorna as vozes do idioma `language`, ordenadas.
pub async fn fetch(client: &reqwest::Client, language: &str) -> AppResult<Vec<CatalogVoice>> {
    let body = client.get(VOICES_JSON).send().await?.error_for_status()?.bytes().await?;
    let raw: HashMap<String, RawVoice> = serde_json::from_slice(&body)?;

    let mut voices: Vec<CatalogVoice> = raw
        .into_values()
        .filter(|v| v.language.code.starts_with(language))
        .filter_map(|v| {
            let (model_path, file) = v.files.iter().find(|(path, _)| path.ends_with(".onnx"))?;
            Some(CatalogVoice {
                model_path: model_path.clone(),
                size_bytes: Some(file.size_bytes),
                id: v.key,
                language: v.language.code,
                name: v.name,
                quality: v.quality,
            })
        })
        .collect();

    voices.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.quality.cmp(&b.quality)));
    Ok(voices)
}

/// Lista mínima usada quando o catálogo remoto está indisponível (offline).
pub fn fallback() -> Vec<CatalogVoice> {
    [("edresson", "low"), ("faber", "medium")]
        .into_iter()
        .map(|(name, quality)| {
            let id = format!("pt_BR-{name}-{quality}");
            CatalogVoice {
                model_path: format!("pt/pt_BR/{name}/{quality}/{id}.onnx"),
                id,
                language: "pt_BR".into(),
                name: name.into(),
                quality: quality.into(),
                size_bytes: None,
            }
        })
        .collect()
}
