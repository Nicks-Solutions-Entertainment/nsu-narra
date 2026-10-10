# Narra — narração PT-BR com vozes Piper

Digite um texto, escolha uma voz e baixe o `.wav`. Tudo roda **no aparelho**: no navegador (PWA, Piper em WASM) ou no desktop (Tauri + Piper nativo). O plano completo está em [concept.md](concept.md).

## Rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # export estático em out/
npm run lint && npm run typecheck
```

Desktop (requer Rust, e o Piper com `pip install piper-tts` ou `PIPER_BIN` apontando para o executável):

```bash
npm run tauri dev
npm run tauri build
```

CLI de aprendizado (Fase 2):

```bash
cd cli && cargo run -- roteiro.txt pt_BR-faber-medium.onnx saida.wav
```

## Arquitetura

Uma interface (`TtsEngine`), dois motores, escolhidos em tempo de execução por `createEngine()`.

```
src/
├─ app/                    rotas (App Router): layout.tsx, page.tsx (rota "/")
├─ features/narrator/      NarratorScreen: container (layout de chat) que liga
│                          hooks a componentes
├─ components/             apresentação pura (só props): Composer, VoiceControls,
│                          VoiceNotice, NarrationList/Item, Select, Toggle, Icon,
│                          ProgressBar, Alert
├─ hooks/                  estado e lógica de UI: useEngine, useVoices (idioma +
│                          voz), useNarrations (histórico), useDraft, usePreference
├─ lib/                    utilitários puros (formatação, idiomas, localStorage)
└─ engine/
   ├─ types.ts             contrato TtsEngine
   ├─ index.ts             createEngine(): Tauri ou WASM
   ├─ catalog/             catálogo oficial (rhasspy) + community-voices.json
   │                       (fonte única, também lida pelo Rust)
   ├─ chunk.ts / wav.ts    divisão de texto e junção de WAVs
   ├─ tauri-engine.ts      invoke() → Rust
   └─ wasm/
      ├─ wasm-engine.ts    cliente RPC na thread da UI
      ├─ tts.worker.ts     inferência ONNX num Web Worker
      ├─ protocol.ts       mensagens UI ↔ worker
      ├─ voice-catalog.ts  catálogo + cache offline (memoizado)
      └─ voice-store.ts    modelos no OPFS (download em streaming)

src-tauri/src/
├─ lib.rs                  registro de estado e comandos
├─ commands/               rotas IPC: list_voices, download_voice,
│                          cancel_download, remove_voice, synthesize
├─ services/               catalog, storage, downloader, piper
├─ state.rs                cliente HTTP, cache do catálogo, downloads ativos
├─ models.rs / error.rs    tipos para o front e erros serializáveis
cli/                       Fase 2: CLI em Rust só com std
```

## Vozes

O catálogo junta o `voices.json` oficial do [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) (todos os idiomas) com as vozes da comunidade em [community-voices.json](src/engine/catalog/community-voices.json). O índice oficial fica salvo localmente para listar vozes offline.

Para adicionar uma voz da comunidade, ela precisa: estar num host com CORS (o Hugging Face serve), usar `phoneme_type: espeak`, ter `.onnx` + config acessíveis e uma licença que permita redistribuir o modelo sem modificação. Preencha `license`, `commercialUse` e `attribution` — a UI mostra esses dados.

## Decisões de desempenho

- **Inferência fora da thread da UI**: o motor WASM roda num Web Worker; o áudio volta como `ArrayBuffer` transferido (sem cópia).
- **Bundle inicial enxuto**: onnxruntime e piper-phonemize só entram no chunk do worker, e cada motor é carregado por `import()` dinâmico.
- **Download em streaming** direto para o OPFS (web) ou disco (desktop), com gravação atômica: memória constante e nenhum modelo corrompido se o download for interrompido.
- **Sessão ONNX reutilizada** entre gerações da mesma voz; só uma voz carregada por vez.
- **Progresso com throttle**: mensagens só quando o percentual inteiro muda.
- **Geração por trechos** (web) com cancelamento entre trechos; no desktop, uma única execução do Piper para não recarregar o modelo.
- **IPC binário no Tauri**: `synthesize` devolve `ipc::Response` (bytes crus) em vez de um array JSON.
- **React**: componentes de lista memoizados e callbacks estáveis, para não re-renderizar a lista de vozes a cada tecla; rascunho salvo com debounce; object URLs revogados ao trocar de áudio.

## Pendências (ver concept.md §3 e §14)

- Fase 0: validar no navegador (PC e celular) que `pt_BR-faber-medium` gera áudio com qualidade aceitável.
- Desktop: decidir como empacotar o Piper (sidecar) e conferir licenças (GPL-3.0).
- Conferir as flags do `piper-tts` atual (`-m` / `-f`) em `docs/CLI.md`.

## Licença

GPL-3.0-or-later (o Piper e o espeak-ng são GPL-3.0). Cada voz tem a própria licença: confira antes de uso comercial.
