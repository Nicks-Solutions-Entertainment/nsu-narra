//! Estado compartilhado entre comandos (registrado com `.manage()`).

use std::{
    collections::HashMap,
    path::Path,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use crate::{
    error::{AppError, AppResult},
    services::catalog::{self, CatalogVoice},
};

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

    /// Retorna o catálogo completo (todos os idiomas, oficial + comunidade).
    ///
    /// Desempenho: o `voices.json` remoto é baixado uma única vez por execução
    /// e memoizado. Ele também é salvo em `cache_path`; se a rede falhar, essa
    /// cópia é usada (sem memoizar, para tentar a rede de novo depois).
    pub async fn catalog(&self, cache_path: &Path) -> AppResult<Arc<Vec<CatalogVoice>>> {
        let mut guard = self.catalog.lock().await;
        if let Some(list) = guard.as_ref() {
            return Ok(list.clone());
        }
        match catalog::fetch_official_index(&self.http).await {
            Ok(bytes) => {
                let list = Arc::new(catalog::build(Some(&bytes))?);
                catalog::write_cached_index(cache_path, &bytes);
                *guard = Some(list.clone());
                Ok(list)
            }
            Err(err) => {
                eprintln!("índice remoto indisponível, usando cópia local: {err}");
                let cached = catalog::read_cached_index(cache_path);
                Ok(Arc::new(catalog::build(cached.as_deref())?))
            }
        }
    }

    /// Busca uma voz no catálogo pelo id.
    pub async fn find_voice(&self, cache_path: &Path, id: &str) -> AppResult<CatalogVoice> {
        self.catalog(cache_path)
            .await?
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
