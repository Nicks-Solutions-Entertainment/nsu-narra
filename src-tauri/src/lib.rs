//! Back-end desktop do Narra (Tauri 2).
//!
//! Camadas:
//! - `commands`: "rotas" IPC chamadas pelo front (`invoke`). Finas: validam
//!   entrada, chamam serviços e convertem o resultado.
//! - `services`: regras de negócio (catálogo, armazenamento, download, Piper).
//! - `state`: estado compartilhado (cliente HTTP, cache do catálogo, downloads).
//! - `models` / `error`: tipos trafegados para o front e erros serializáveis.

mod commands;
mod error;
mod models;
mod services;
mod state;

use state::AppState;

/// Monta e executa o app Tauri, registrando estado e comandos.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::voices::list_voices,
            commands::voices::download_voice,
            commands::voices::cancel_download,
            commands::voices::remove_voice,
            commands::synth::synthesize,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app");
}
