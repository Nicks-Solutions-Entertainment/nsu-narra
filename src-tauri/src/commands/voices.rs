//! Rotas de gerenciamento de vozes.

use tauri::{ipc::Channel, AppHandle, State};

use crate::{
    error::AppResult,
    models::{DownloadProgress, VoiceInfo},
    services::{downloader, storage},
    state::AppState,
};

/// `invoke('list_voices')` → `VoiceInfo[]`
///
/// Lista todas as vozes (oficiais + comunidade, todos os idiomas), marcando as
/// instaladas. Catálogo memoizado + uma única leitura de diretório por chamada.
#[tauri::command]
pub async fn list_voices(app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<VoiceInfo>> {
    let catalog = state.catalog(&storage::index_cache_path(&app)?).await?;
    let installed = storage::installed_ids(&storage::voices_dir(&app)?)?;

    Ok(catalog
        .iter()
        .map(|v| VoiceInfo::from_catalog(v, installed.contains(&v.id)))
        .collect())
}

/// `invoke('download_voice', { voiceId, onProgress: Channel })` → `void`
///
/// Baixa modelo e configuração da voz. O progresso do modelo é enviado pelo
/// `Channel` só quando o percentual inteiro muda (evita inundar o IPC).
#[tauri::command]
pub async fn download_voice(
    app: AppHandle,
    state: State<'_, AppState>,
    voice_id: String,
    on_progress: Channel<DownloadProgress>,
) -> AppResult<()> {
    storage::validate_voice_id(&voice_id)?;
    let voice = state.find_voice(&storage::index_cache_path(&app)?, &voice_id).await?;
    let dir = storage::voices_dir(&app)?;
    let cancel = state.begin_download(&voice_id)?;

    let result = async {
        let mut last_pct = u64::MAX;
        downloader::download_to(
            &state.http,
            &voice.model_url,
            &storage::model_path(&dir, &voice_id),
            &cancel,
            |loaded, total| {
                let pct = if total > 0 { loaded * 100 / total } else { 0 };
                if pct != last_pct {
                    last_pct = pct;
                    let _ = on_progress.send(DownloadProgress { loaded, total });
                }
            },
        )
        .await?;

        // Config por último: a voz só conta como instalada com os dois arquivos.
        downloader::download_to(
            &state.http,
            &voice.config_url,
            &storage::config_path(&dir, &voice_id),
            &cancel,
            |_, _| {},
        )
        .await
    }
    .await;

    state.end_download(&voice_id);
    result
}

/// `invoke('cancel_download', { voiceId })` → `void`
///
/// Pede o cancelamento de um download em andamento (efetivo no próximo bloco).
#[tauri::command]
pub fn cancel_download(state: State<'_, AppState>, voice_id: String) {
    state.cancel_download(&voice_id);
}

/// `invoke('remove_voice', { voiceId })` → `void`
///
/// Apaga os arquivos da voz do disco.
#[tauri::command]
pub async fn remove_voice(app: AppHandle, voice_id: String) -> AppResult<()> {
    storage::validate_voice_id(&voice_id)?;
    storage::remove_voice(&storage::voices_dir(&app)?, &voice_id).await
}
