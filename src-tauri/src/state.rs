//! Estado compartilhado entre comandos (registrado com `.manage()`).

use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use crate::{
    error::{AppError, AppResult},
    services::catalog::{self, CatalogVoice},
};

/// Idioma alvo do app (igual a `TARGET_LANGUAGE` no front).
pub const TARGET_LANGUAGE: &str = "pt_BR";

pub struct AppState {
    /// Cliente HTTP único: reaproveita conexões TLS entre requisições.
    pub http: reqwest::Client,
    /// Catálogo memoizado após a primeira busca bem-sucedida.
    catalog: tokio::sync::Mutex<Option<Arc<Vec<CatalogVoice>>>>,
    /// Sinal de cancelamento por voz em download.
    downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("narra/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        Self { http, catalog: Default::default(), downloads: Default::default() }
    }

    /// Retorna o catálogo de vozes do idioma alvo.
    ///
    /// Desempenho: o `voices.json` remoto é baixado e filtrado uma única vez
    /// por execução. Se a rede falhar, usa a lista embutida sem memoizar,
    /// para tentar de novo na próxima chamada.
    pub async fn catalog(&self) -> Arc<Vec<CatalogVoice>> {
        let mut guard = self.catalog.lock().await;
        if let Some(list) = guard.as_ref() {
            return list.clone();
        }
        match catalog::fetch(&self.http, TARGET_LANGUAGE).await {
            Ok(list) => {
                let list = Arc::new(list);
                *guard = Some(list.clone());
                list
            }
            Err(err) => {
                eprintln!("catálogo remoto indisponível, usando lista embutida: {err}");
                Arc::new(catalog::fallback())
            }
        }
    }

    /// Busca uma voz no catálogo pelo id.
    pub async fn find_voice(&self, id: &str) -> AppResult<CatalogVoice> {
        self.catalog()
            .await
            .iter()
            .find(|v| v.id == id)
            .cloned()
            .ok_or_else(|| AppError::UnknownVoice(id.to_string()))
    }

    /// Registra um download em andamento e devolve seu sinal de cancelamento.
    pub fn begin_download(&self, id: &str) -> AppResult<Arc<AtomicBool>> {
        let mut map = self.downloads.lock().expect("mutex de downloads");
        if map.contains_key(id) {
            return Err(AppError::AlreadyDownloading(id.to_string()));
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(id.to_string(), flag.clone());
        Ok(flag)
    }

    /// Remove o registro de download (sucesso, erro ou cancelamento).
    pub fn end_download(&self, id: &str) {
        self.downloads.lock().expect("mutex de downloads").remove(id);
    }

    /// Sinaliza cancelamento; o laço de download verifica entre blocos.
    pub fn cancel_download(&self, id: &str) {
        if let Some(flag) = self.downloads.lock().expect("mutex de downloads").get(id) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
}
