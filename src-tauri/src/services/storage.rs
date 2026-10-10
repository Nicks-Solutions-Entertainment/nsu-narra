//! Onde e como os modelos de voz ficam salvos no disco.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Diretório de vozes dentro do app data dir (criado se não existir).
pub fn voices_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir()?.join("voices");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn model_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.onnx"))
}

pub fn config_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.onnx.json"))
}

/// Uma voz está instalada quando modelo e configuração existem.
pub fn is_installed(dir: &Path, id: &str) -> bool {
    model_path(dir, id).is_file() && config_path(dir, id).is_file()
}

/// Ids das vozes instaladas, com uma única leitura do diretório.
pub fn installed_ids(dir: &Path) -> AppResult<HashSet<String>> {
    let names: HashSet<String> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .collect();

    Ok(names
        .iter()
        .filter_map(|n| n.strip_suffix(".onnx"))
        .filter(|id| names.contains(&format!("{id}.onnx.json")))
        .map(str::to_owned)
        .collect())
}

/// Garante que o id é um nome de arquivo seguro (evita path traversal).
pub fn validate_voice_id(id: &str) -> AppResult<()> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err(AppError::UnknownVoice(id.to_string()))
    }
}

/// Remove modelo e configuração; ignora arquivos que já não existem.
pub async fn remove_voice(dir: &Path, id: &str) -> AppResult<()> {
    for path in [model_path(dir, id), config_path(dir, id)] {
        match tokio::fs::remove_file(&path).await {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_voice_id;

    #[test]
    fn valida_ids() {
        assert!(validate_voice_id("pt_BR-faber-medium").is_ok());
        assert!(validate_voice_id("../etc/passwd").is_err());
        assert!(validate_voice_id("").is_err());
    }
}
