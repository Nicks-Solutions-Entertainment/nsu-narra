//! Rota de síntese de áudio.

use tauri::{ipc::Response, AppHandle};

use crate::{
    error::{AppError, AppResult},
    services::{piper, storage},
};

/// `invoke('synthesize', { text, voiceId })` → `ArrayBuffer` (WAV)
///
/// Gera a narração com o Piper nativo.
///
/// Desempenho: retorna `ipc::Response` com os bytes crus. Devolver `Vec<u8>`
/// serializaria o WAV como array JSON de números (várias vezes maior e lento
/// de decodificar no front).
#[tauri::command]
pub async fn synthesize(app: AppHandle, text: String, voice_id: String) -> AppResult<Response> {
    storage::validate_voice_id(&voice_id)?;
    if text.trim().is_empty() {
        return Err(AppError::EmptyText);
    }

    let dir = storage::voices_dir(&app)?;
    if !storage::is_installed(&dir, &voice_id) {
        return Err(AppError::VoiceNotInstalled(voice_id));
    }

    let wav = piper::synthesize(&storage::model_path(&dir, &voice_id), &text).await?;
    Ok(Response::new(wav))
}
