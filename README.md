# Narra — narração PT-BR com vozes Piper

Digite um texto, escolha uma voz e baixe o `.wav`. Tudo roda **no aparelho**: no navegador (PWA, Piper em WASM) ou no desktop (Tauri + Piper nativo). O plano completo está em [concept.md](concept.md).

## Rodar

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm build            # export estático em out/
pnpm lint && pnpm typecheck
```

Desktop (requer Rust, e o Piper com `pip install piper-tts` ou `PIPER_BIN` apontando para o executável):

```bash
pnpm tauri dev
pnpm tauri build
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

### Vozes Kokoro (flag `FEATURES.kokoro`)

Três vozes pt-BR do [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Dora, Alex e Santa; Apache 2.0, uso comercial ✓) rodam no navegador ao lado das vozes Piper:

- modelo compartilhado de ~88 MB, baixado uma vez, mais ~0,5 MB por voz; o modelo só é apagado quando a última voz Kokoro sai do aparelho;
- ~8× mais lentas que as vozes Piper para gerar (marcadas "Kokoro · mais lenta" no seletor);
- fonemas pelo espeak-ng do piper-phonemize (`pt-br`), inferência no mesmo onnxruntime 1.18;
- no desktop, rodam no motor WASM dentro da janela (o back-end Rust só roda Piper).

A flag é **temporária**: quando as vozes forem destiladas para Piper ([proposta](docs/proposta-narra-voice-lab.md)), desligue-a no build e o código do Kokoro sai do bundle:

```bash
NEXT_PUBLIC_FEATURE_KOKORO=off pnpm build
```

Depois, remova `src/engine/wasm/kokoro.ts`, `src/engine/catalog/kokoro-*` e as amostras `public/samples/pt_BR/pt_BR-kokoro_*`.

### Configuração da voz

O botão ao lado do seletor de voz abre os ajustes, salvos no navegador:

- **Velocidade** (0,70×–1,30× sobre o `SPEECH_PACE`): vale para Piper, Kokoro e Supertonic no navegador. No desktop, o Piper nativo ainda ignora esse ajuste;
- **Variação de ritmo** (0% a 10%, padrão ±3%; 0 desliga): cada trecho recebe uma variação aleatória de velocidade até esse limite, centrado para que a média do texto fique na velocidade escolhida (`chunkSpeeds` em `src/engine/tuning.ts`);
- **Qualidade (passos)**: só aparece para vozes Supertonic.

### Download do áudio

O ícone ⤓ ao lado do player abre o menu de formatos, com o tamanho estimado de cada um. A conversão acontece no aparelho, só no clique; o player continua tocando o WAV original.

| Formato | Como é gerado | Observação |
|---|---|---|
| **OGG** (recomendado) | Opus 64 kbps pelo codificador nativo do navegador (WebCodecs), reamostrado para 48 kHz, com empacotador OGG próprio | ~6–11× menor que o WAV. Fica desativado se o navegador não tiver WebCodecs com Opus |
| **MP3** | LAME em JavaScript ([@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs), LGPL-3.0), num worker | 64 kbps (16–24 kHz) ou 96 kbps (44,1 kHz). ~25–50 ms de silêncio no início, comum no formato |
| **FLAC** | Codificador próprio (preditores fixos + Rice), num worker | Sem perda (bit a bit igual ao WAV), ~40% do tamanho |
| **WAV** | O próprio áudio gerado | Original |

O código fica em `src/lib/audio-export/`; cada codificador só é baixado quando o formato é escolhido. Os OGG levam o comentário `Áudio gerado por IA (Narra)` nos metadados.

### Vozes Supertonic 3 (flag `FEATURES.supertonic`, experimental)

Dez vozes (F1–F5, M1–M5) do [Supertonic 3](https://huggingface.co/Supertone/supertonic-3) em português (`pt`), rodando no navegador:

- quatro modelos compartilhados (~380 MB), baixados uma única vez, mais ~0,3 MB por voz. Não há G2P: o texto vai direto ao modelo;
- **qualidade em passos** (2–16, padrão 8) no botão de configuração da voz, além de 0,3 s de silêncio entre trechos;
- pesos sob **OpenRAIL-M**: uso comercial permitido, com restrições de uso. É obrigatório avisar que o conteúdo foi gerado por IA, e é proibido se passar por alguém, desinformar ou dar aconselhamento médico. O aceite na tela está pendente: veja [update-plans/license-confirmation.md](update-plans/license-confirmation.md);
- a Supertone arquivou o projeto em 09/2026. As URLs estão fixadas na revisão `3cadd1e` do Hugging Face; troque `baseUrl` em `src/engine/catalog/supertonic-voices.json` quando houver um espelho próprio.

Para desligar: `NEXT_PUBLIC_FEATURE_SUPERTONIC=off pnpm build`. As prévias são geradas com `--families supertonic` no script de amostras (requer `pip install supertonic`).

### Licenças

Cada voz tem `license` e `commercial` (`yes` | `no` | `unclear`). Para as oficiais, isso vem de [official-licenses.json](src/engine/catalog/official-licenses.json), gerado a partir dos `MODEL_CARD`s; uma voz ajustada ("finetuned") a partir de outra herda a restrição da base — por isso Faber, Cadu e Jeff (dataset CC0, base `lessac` só para pesquisa) aparecem como "uso comercial incerto". Para atualizar quando o catálogo oficial mudar:

```bash
node scripts/licenses/build-official-licenses.mjs
```

### Prévias

O ▶ de cada voz usa, em ordem: um OGG pré-gravado do projeto (`public/samples/<idioma>/<voz>/<n>.ogg`, com uma frase sorteada a cada carregamento da página), a amostra publicada pelo Piper (vozes oficiais de outros idiomas) ou, se a voz estiver instalada, uma frase gerada no aparelho.

Para refazer os OGGs depois de mudar as frases em `voice-demos/voice-exemples_ptbr.md` ou adicionar vozes (requer `pip install piper-tts` e `ffmpeg`):

```bash
python scripts/samples/generate_samples.py --cache <pasta-para-modelos> --lang pt_BR --force
```

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

GPL-3.0-or-later ([LICENSE](LICENSE); o Piper e o espeak-ng são GPL-3.0). Cada voz tem a própria licença: confira antes de uso comercial. Os modelos Supertonic 3 seguem a OpenRAIL-M, cujas restrições de uso valem para quem gera o áudio.
