//! Catálogo de vozes: oficial (`rhasspy/piper-voices`) + comunidade.
//!
//! Espelha `src/engine/catalog/index.ts`. As vozes da comunidade vêm do mesmo
//! JSON usado pelo front (`include_str!`), então há uma única lista a manter.

use std::{collections::HashMap, path::Path};

use serde::Deserialize;

use crate::error::AppResult;

const OFFICIAL_BASE: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const OFFICIAL_INDEX: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json";
const COMMUNITY_JSON: &str = include_str!("../../../src/engine/catalog/community-voices.json");

/// Voz do catálogo com as URLs de download.
#[derive(Debug, Clone)]
pub struct CatalogVoice {
    pub id: String,
    pub language: String,
    pub name: String,
    pub quality: String,
    pub size_bytes: Option<u64>,
    pub source: &'static str,
    pub gender: Option<String>,
    pub license: Option<String>,
    pub commercial_use: Option<bool>,
    pub attribution: Option<String>,
    pub homepage: Option<String>,
    pub model_url: String,
    pub config_url: String,
}

// --- formato do voices.json oficial (só os campos usados) ---
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

// --- formato de community-voices.json ---
#[derive(Deserialize)]
struct CommunityFile {
    voices: Vec<CommunityVoice>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommunityVoice {
    id: String,
    language: String,
    name: String,
    quality: String,
    gender: Option<String>,
    size_bytes: Option<u64>,
    model_url: String,
    config_url: String,
    license: Option<String>,
    commercial_use: Option<bool>,
    attribution: Option<String>,
    homepage: Option<String>,
}

/// Baixa o índice oficial e devolve os bytes crus (para também salvar em cache).
pub async fn fetch_official_index(client: &reqwest::Client) -> AppResult<Vec<u8>> {
    Ok(client.get(OFFICIAL_INDEX).send().await?.error_for_status()?.bytes().await?.to_vec())
}

/// Monta o catálogo completo a partir do índice oficial (pode ser vazio).
/// Oficial vence em caso de id repetido. Ordena por idioma, nome e qualidade.
pub fn build(official_index: Option<&[u8]>) -> AppResult<Vec<CatalogVoice>> {
    let mut by_id: HashMap<String, CatalogVoice> =
        community().into_iter().map(|v| (v.id.clone(), v)).collect();

    if let Some(bytes) = official_index {
        for v in parse_official(bytes)? {
            by_id.insert(v.id.clone(), v);
        }
    }

    let mut voices: Vec<CatalogVoice> = by_id.into_values().collect();
    voices.sort_by(|a, b| {
        a.language
            .cmp(&b.language)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| quality_rank(&a.quality).cmp(&quality_rank(&b.quality)))
    });
    Ok(voices)
}

/// Lê o índice salvo na última busca bem-sucedida (uso offline).
pub fn read_cached_index(path: &Path) -> Option<Vec<u8>> {
    std::fs::read(path).ok()
}

pub fn write_cached_index(path: &Path, bytes: &[u8]) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, bytes);
}

fn parse_official(bytes: &[u8]) -> AppResult<Vec<CatalogVoice>> {
    let raw: HashMap<String, RawVoice> = serde_json::from_slice(bytes)?;
    Ok(raw
        .into_values()
        .filter_map(|v| {
            let (path, file) = v.files.iter().find(|(p, _)| p.ends_with(".onnx"))?;
            let dir = path.rsplit_once('/').map_or("", |(d, _)| d);
            Some(CatalogVoice {
                model_url: format!("{OFFICIAL_BASE}/{path}"),
                config_url: format!("{OFFICIAL_BASE}/{path}.json"),
                homepage: Some(format!("https://huggingface.co/rhasspy/piper-voices/tree/main/{dir}")),
                size_bytes: Some(file.size_bytes),
                id: v.key,
                language: v.language.code,
                name: v.name,
                quality: v.quality,
                source: "official",
                gender: None,
                license: None,
                commercial_use: None,
                attribution: None,
            })
        })
        .collect())
}

fn community() -> Vec<CatalogVoice> {
    let file: CommunityFile =
        serde_json::from_str(COMMUNITY_JSON).expect("community-voices.json inválido");
    file.voices
        .into_iter()
        .map(|v| CatalogVoice {
            id: v.id,
            language: v.language,
            name: v.name,
            quality: v.quality,
            size_bytes: v.size_bytes,
            source: "community",
            gender: v.gender,
            license: v.license,
            commercial_use: v.commercial_use,
            attribution: v.attribution,
            homepage: v.homepage,
            model_url: v.model_url,
            config_url: v.config_url,
        })
        .collect()
}

fn quality_rank(q: &str) -> u8 {
    match q {
        "x_low" => 0,
        "low" => 1,
        "medium" => 2,
        "high" => 3,
        _ => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_da_comunidade_e_valido() {
        let voices = community();
        assert!(voices.iter().any(|v| v.id == "pt_BR-razo-medium"));
        assert!(voices.iter().all(|v| v.model_url.starts_with("https://")));
    }

    #[test]
    fn catalogo_sem_rede_tem_a_comunidade() {
        let voices = build(None).unwrap();
        assert_eq!(voices.len(), community().len());
    }
}
