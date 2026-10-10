# Piper TTS App — Plano do Projeto

App com interface gráfica para gerar áudio (narração) a partir de texto, usando vozes **Piper** em PT-BR. Roda no navegador/celular (PWA no GitHub Pages) e como app desktop instalável (Tauri + Rust).

---

## 1. Objetivo

- Qualquer pessoa, sem conhecimento técnico, abre um link e gera áudio: escolhe a voz, digita o texto, clica em gerar e baixa o `.wav`.
- Tudo roda **localmente no aparelho** (sem servidor, sem custo, sem API paga).
- Versão desktop opcional, com instalador de dois cliques, que também serve de projeto para aprender Rust.

## 2. Stack consolidada

| Camada | Tecnologia |
|---|---|
| Front-end | TypeScript + Next.js (React) em modo estático (`output: 'export'`) |
| Motor web (PWA) | Piper em WASM via `onnxruntime-web` (biblioteca candidata: `@mintplex-labs/piper-tts-web`) |
| Motor desktop | Rust + Tauri 2, chamando o Piper como processo externo |
| Hospedagem web | GitHub Pages (via GitHub Actions) |
| Distribuição desktop | GitHub Releases (instaladores `.msi`/`.exe` gerados pelo Actions) |
| Vozes | `rhasspy/piper-voices` no Hugging Face (baixadas pelo app, nunca commitadas no repo) |

Regra do projeto: **uma interface, dois motores.** A UI não sabe qual motor está usando.

## 3. Estado das validações

**Confirmado**
- Existem bibliotecas que rodam Piper no navegador com ONNX Runtime Web: `@mintplex-labs/piper-tts-web`, `piper-tts-web` e `piper-plus`. A primeira expõe `predict`, `download`, `stored`, `remove` e `voices`, que mapeiam quase 1:1 para a nossa interface.
- O **Sherpa-ONNX** também roda modelos Piper em WASM e tem demo pública. É o plano B para o motor web.
- O Piper atual (`OHF-Voice/piper1-gpl`) é instalado com `pip install piper-tts`. O repositório está procurando mantenedores.
- A licença do Piper atual e do `espeak-ng` embutido é **GPL-3.0**.

**Ainda NÃO confirmado (fazer na Fase 0)**
- Se alguma dessas bibliotecas WASM carrega as vozes **pt-BR** (`pt_BR-faber-medium` etc.) e gera áudio com qualidade aceitável no navegador. É a peça que sustenta a versão Pages.
- Se o repositório de vozes tem um índice (`voices.json`) na raiz. A listagem do Hugging Face veio truncada, então não consegui ver. Se não houver, o app lê a lista pela própria biblioteca (`tts.voices()`) ou por um índice próprio em `public/voices.json`.
- Como o desktop obtém o Piper. O repositório novo não mostra releases com binários, então as opções são: (a) exigir Python + `pip install piper-tts`, (b) empacotar um binário antigo do `rhasspy/piper` como sidecar do Tauri, (c) usar o `ort` (ONNX Runtime para Rust) direto, o que é mais difícil. Decidir na Fase 2.
- Flags exatas da CLI do `piper-tts` atual. Conferir `docs/CLI.md` do repositório, porque os nomes mudaram em relação à versão antiga (`-m`/`-f` vs `--model`/`--output_file`).

## 4. Arquitetura

```
┌──────────────────────────────────────────┐
│  UI Next.js (estática)                   │
│  texto · voz · gerar · player · baixar   │
└───────────────┬──────────────────────────┘
                │ interface TtsEngine
      ┌─────────┴──────────┐
      ▼                    ▼
 WasmEngine           TauriEngine
 (navegador/PWA)      (desktop)
 onnxruntime-web      invoke() → Rust
 vozes em IndexedDB   Command → piper
                      vozes em app data dir
```

Seleção do motor em tempo de execução: no Tauri 2 use `isTauri()` de `@tauri-apps/api/core`. (Na conversa anterior citei `window.__TAURI__`; no Tauri 2 esse objeto global só existe se `withGlobalTauri` estiver ativo, então `isTauri()` é o jeito certo.)

## 5. Estrutura de pastas

```
piper-tts-app/
├─ PLANO-PIPER-TTS.md
├─ package.json
├─ next.config.ts
├─ public/
│  ├─ coi-serviceworker.js        # habilita threads WASM no Pages
│  └─ manifest.webmanifest        # PWA
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  ├─ VoicePicker.tsx
│  │  ├─ TextInput.tsx
│  │  └─ AudioPlayer.tsx
│  └─ engine/
│     ├─ types.ts                 # interface TtsEngine
│     ├─ index.ts                 # escolhe o motor
│     ├─ wasm-engine.ts
│     ├─ tauri-engine.ts
│     └─ chunk.ts                 # divide texto em frases
├─ cli/                           # Fase 2: CLI em Rust (aprendizado)
│  ├─ Cargo.toml
│  └─ src/main.rs
├─ src-tauri/                     # Fase 3: criado por `tauri init`
└─ .github/workflows/
   ├─ pages.yml
   └─ release.yml
```

## 6. Setup no VSCode

**Pré-requisitos**
- Node.js LTS e Git
- Rust: https://rustup.rs (Fases 2 em diante)
- Windows: Visual Studio Build Tools com "Desktop development with C++" e WebView2 (Fase 3)
- Extensões do VSCode: `rust-analyzer`, `Tauri`, `ESLint`, `Tailwind CSS IntelliSense` (opcional)

**Criar o projeto**
```bash
npx create-next-app@latest piper-tts-app --typescript --app --src-dir --eslint
cd piper-tts-app
npm install @mintplex-labs/piper-tts-web
code .
```

## 7. Fase 0 — Spike do WASM (fazer antes de tudo)

Objetivo: provar que uma voz pt-BR gera áudio no navegador. Se falhar, o plano da versão Pages muda (ver riscos).

Em `src/app/page.tsx`, uma página mínima:

```tsx
'use client';
import { useState } from 'react';
import * as tts from '@mintplex-labs/piper-tts-web';

export default function Page() {
  const [url, setUrl] = useState<string>();
  const [log, setLog] = useState('');

  async function gerar() {
    const wav = await tts.predict(
      { text: 'Olá, este é um teste de narração em português.', voiceId: 'pt_BR-faber-medium' },
      (p) => setLog(JSON.stringify(p)),
    );
    setUrl(URL.createObjectURL(wav));
  }

  return (
    <main style={{ padding: 24 }}>
      <button onClick={gerar}>Gerar</button>
      <pre>{log}</pre>
      {url && <audio controls src={url} />}
    </main>
  );
}
```

Critérios de aprovação:
- Gera áudio pt-BR audível e sem cortes.
- Funciona no Chrome desktop e no Chrome do seu celular.
- Anote o tempo de geração de um parágrafo de ~500 caracteres.

Se a biblioteca escolhida não suportar pt-BR ou der erro, testar `piper-tts-web` e o Sherpa-ONNX WASM (demo em `k2-fsa.github.io/sherpa/onnx/tts/wasm`).

## 8. Fase 1 — PWA no GitHub Pages

### 8.1 `next.config.ts`

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // No Pages o site fica em /<nome-do-repo>
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
};

export default nextConfig;
```

### 8.2 Interface do motor — `src/engine/types.ts`

```ts
export interface VoiceInfo {
  id: string;          // ex.: "pt_BR-faber-medium"
  language: string;    // ex.: "pt_BR"
  name: string;        // ex.: "faber"
  quality: string;     // "low" | "medium" | "high"
  installed: boolean;
}

export interface TtsEngine {
  listVoices(): Promise<VoiceInfo[]>;
  downloadVoice(id: string, onProgress?: (pct: number) => void): Promise<void>;
  removeVoice(id: string): Promise<void>;
  synthesize(text: string, voiceId: string): Promise<Blob>; // WAV
}
```

### 8.3 Motor web — `src/engine/wasm-engine.ts`

Ajuste os nomes conforme a biblioteca que passar na Fase 0.

```ts
import * as tts from '@mintplex-labs/piper-tts-web';
import type { TtsEngine, VoiceInfo } from './types';
import { splitSentences } from './chunk';

export class WasmEngine implements TtsEngine {
  async listVoices(): Promise<VoiceInfo[]> {
    const all = await tts.voices(); // verificar o formato real do retorno
    const stored = new Set(await tts.stored());
    return Object.values(all)
      .filter((v: any) => v.language?.code?.startsWith('pt_BR'))
      .map((v: any) => ({
        id: v.key,
        language: 'pt_BR',
        name: v.name,
        quality: v.quality,
        installed: stored.has(v.key),
      }));
  }

  async downloadVoice(id: string, onProgress?: (pct: number) => void) {
    await tts.download(id, (p: any) => onProgress?.(Math.round((p.loaded / p.total) * 100)));
  }

  async removeVoice(id: string) {
    await tts.remove(id);
  }

  async synthesize(text: string, voiceId: string): Promise<Blob> {
    // Textos longos: gerar por frase e juntar (evita estourar memória no celular)
    const parts: Blob[] = [];
    for (const sentence of splitSentences(text)) {
      parts.push(await tts.predict({ text: sentence, voiceId }));
    }
    return concatWav(parts);
  }
}

// Junta WAVs 16-bit PCM mono com o mesmo sample rate em um único WAV.
async function concatWav(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  const buffers = await Promise.all(blobs.map((b) => b.arrayBuffer()));
  const header = buffers[0].slice(0, 44);
  const data = buffers.map((b) => new Uint8Array(b.slice(44)));
  const total = data.reduce((n, d) => n + d.length, 0);
  const out = new Uint8Array(44 + total);
  out.set(new Uint8Array(header), 0);
  let off = 44;
  for (const d of data) { out.set(d, off); off += d.length; }
  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + total, true);  // tamanho do RIFF
  view.setUint32(40, total, true);      // tamanho do chunk "data"
  return new Blob([out], { type: 'audio/wav' });
}
```

### 8.4 Divisão de texto — `src/engine/chunk.ts`

```ts
export function splitSentences(text: string, maxLen = 300): string[] {
  const raw = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const s of raw.map((x) => x.trim()).filter(Boolean)) {
    if ((buf + ' ' + s).length > maxLen && buf) { out.push(buf); buf = s; }
    else buf = buf ? buf + ' ' + s : s;
  }
  if (buf) out.push(buf);
  return out;
}
```

### 8.5 Escolha do motor — `src/engine/index.ts`

```ts
import type { TtsEngine } from './types';

export async function createEngine(): Promise<TtsEngine> {
  if (typeof window !== 'undefined') {
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (isTauri()) {
        const { TauriEngine } = await import('./tauri-engine');
        return new TauriEngine();
      }
    } catch { /* fora do Tauri */ }
  }
  const { WasmEngine } = await import('./wasm-engine');
  return new WasmEngine();
}
```

### 8.6 Threads WASM no GitHub Pages

O Pages não permite configurar cabeçalhos COOP/COEP, que o WASM com várias threads exige. Solução: copiar o `coi-serviceworker.js` (projeto `gzuidhof/coi-serviceworker`) para `public/` e registrá-lo no `layout.tsx` com `<script src={`${basePath}/coi-serviceworker.js`} />`. Sem isso o app ainda funciona em thread única, só mais lento.

### 8.7 PWA

`public/manifest.webmanifest` com `name`, `short_name`, `start_url`, `display: "standalone"`, `theme_color` e ícones 192/512. O objetivo é permitir "Adicionar à tela inicial" no celular. Depois dá para adicionar cache offline (service worker próprio) para o app abrir sem internet.

### 8.8 Deploy — `.github/workflows/pages.yml`

```yaml
name: Deploy Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_BASE_PATH: /${{ github.event.repository.name }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: out }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```

No repositório: Settings → Pages → Source: **GitHub Actions**.

### 8.9 Tela do app (mínimo)

1. Seletor de voz (lista pt-BR, botão baixar com barra de progresso, selo "instalada").
2. Caixa de texto com contador de caracteres.
3. Botão **Gerar**, com estado "gerando frase X de Y".
4. Player `<audio controls>` e botão **Baixar .wav**.

## 9. Fase 2 — CLI em Rust (aprendizado)

Objetivo: aprender o básico de Rust num projeto pequeno que já será reaproveitado no Tauri.

```bash
cargo new cli --name piper-cli
```

`cli/src/main.rs` (apenas biblioteca padrão, sem crates):

```rust
use std::{
    env, fs,
    io::Write,
    process::{Command, Stdio},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 4 {
        eprintln!("uso: piper-cli <roteiro.txt> <voz.onnx> <saida.wav>");
        std::process::exit(1);
    }

    let texto = fs::read_to_string(&args[1])?;

    // Flags -m / -f: conferir docs/CLI.md do piper-tts atual.
    let mut filho = Command::new("piper")
        .args(["-m", &args[2], "-f", &args[3]])
        .stdin(Stdio::piped())
        .spawn()?;

    filho.stdin.take().unwrap().write_all(texto.as_bytes())?;

    let status = filho.wait()?;
    if !status.success() {
        return Err(format!("piper terminou com erro: {status}").into());
    }

    println!("Áudio salvo em {}", args[3]);
    Ok(())
}
```

Testar:
```bash
pip install piper-tts
python -m piper.download_voices pt_BR-faber-medium
cargo run -- roteiro.txt pt_BR-faber-medium.onnx saida.wav
```

Conceitos que esta fase cobre: `Result` e `?`, ownership de `String`, `Command`, I/O de arquivos. Evolução natural: trocar `Box<dyn Error>` por `thiserror`, adicionar `clap` para argumentos e `reqwest` para baixar vozes.

## 10. Fase 3 — Tauri 2 no desktop

```bash
npm install -D @tauri-apps/cli@latest
npm install @tauri-apps/api
npx tauri init
```

Configuração principal no `tauri.conf.json`:
- `build.frontendDist`: `"../out"`
- `build.devUrl`: `"http://localhost:3000"`
- `build.beforeDevCommand`: `"npm run dev"`
- `build.beforeBuildCommand`: `"npm run build"`

### 10.1 Commands em Rust (`src-tauri/src/lib.rs`)

```rust
use std::{io::Write, path::PathBuf, process::{Command, Stdio}};
use tauri::Manager;

fn voices_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("voices");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn synthesize(app: tauri::AppHandle, text: String, voice_id: String) -> Result<Vec<u8>, String> {
    let model = voices_dir(&app)?.join(format!("{voice_id}.onnx"));
    let out = std::env::temp_dir().join("piper-out.wav");

    let mut child = Command::new("piper")   // Fase 3: trocar por sidecar empacotado
        .args(["-m", model.to_str().unwrap(), "-f", out.to_str().unwrap()])
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    child.stdin.take().unwrap().write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    std::fs::read(&out).map_err(|e| e.to_string())
}

// Também criar: list_installed_voices, download_voice (reqwest), remove_voice.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![synthesize])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app");
}
```

### 10.2 Motor Tauri — `src/engine/tauri-engine.ts`

```ts
import { invoke } from '@tauri-apps/api/core';
import type { TtsEngine, VoiceInfo } from './types';

export class TauriEngine implements TtsEngine {
  async listVoices(): Promise<VoiceInfo[]> { return invoke('list_voices'); }
  async downloadVoice(id: string) { await invoke('download_voice', { voiceId: id }); }
  async removeVoice(id: string) { await invoke('remove_voice', { voiceId: id }); }

  async synthesize(text: string, voiceId: string): Promise<Blob> {
    const bytes = await invoke<number[]>('synthesize', { text, voiceId });
    return new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
  }
}
```

### 10.3 Como entregar o Piper dentro do instalador

Decisão pendente (ver seção 3). Para o usuário final **não** exigir Python, a opção mais realista é empacotar o executável do Piper como *sidecar* do Tauri (`bundle.externalBin`). Validar qual binário usar e a licença antes de distribuir.

### 10.4 Release — `.github/workflows/release.yml`

Usar a action oficial `tauri-apps/tauri-action` com matriz Windows/macOS/Linux, disparada por tag (`v*`), publicando os instaladores em Releases. O README do projeto fica com uma linha: "Baixe o instalador na página de Releases".

## 11. Fase 4 — Celular

Ordem de preferência:
1. **PWA** (já pronta na Fase 1). Instala pela tela inicial e funciona no Android e no iOS.
2. **Capacitor** embrulhando o build estático do Next.js, se for preciso publicar nas lojas. Se o WASM ficar lento, escrever um plugin que chame o Sherpa-ONNX nativo (Kotlin/Swift), mantendo a UI.
3. **Tauri mobile**, só se o suporte estiver estável quando chegar nesta fase.

Lembrar: acelerar com NPU/GPU rende pouco para o Piper. O que ajuda é gerar por frase, em worker separado, e usar vozes `medium`.

## 12. Licenças (antes de divulgar)

- **Piper e espeak-ng:** GPL-3.0. Distribuir um app que os embute impõe condições (código-fonte disponível sob GPL). Para um projeto aberto no GitHub isso normalmente é aceitável; para um app fechado, não.
- **Código das bibliotecas WASM:** conferir a licença de cada uma (as de `piper-tts-web` citam MIT para os modelos, mas o phonemizer usa espeak-ng).
- **Cada voz tem a sua licença.** Conferir no cartão de cada voz antes de oferecer no app. A Faber está em CC0 segundo o Hugging Face.
- **Uso comercial dos áudios** (monetização no YouTube): conferir a licença da voz escolhida, não só a do Piper.

## 13. Riscos e planos B

| Risco | Plano B |
|---|---|
| Nenhuma lib WASM gera pt-BR bom | Sherpa-ONNX WASM; ou Kokoro (`kokoro-js`) que já roda no navegador, com voz pt-BR menos natural |
| WASM lento em celular fraco | Vozes `medium`, geração por frase, Capacitor + plugin nativo |
| iOS limita memória/armazenamento da PWA | Oferecer só vozes `medium`; avisar o tamanho antes do download |
| CORS bloqueia download de voz do Hugging Face | Hospedar as vozes escolhidas em Releases do próprio repo ou em outro CDN |
| Sem binário standalone do Piper | Sidecar com binário antigo, ou exigir `pip install piper-tts` no desktop |
| Tauri mobile instável | Ficar no PWA/Capacitor |

## 14. Checklist

- [x] Fase 0: spike WASM gera pt-BR no PC (`@mintplex-labs/piper-tts-web` + onnxruntime servido em `public/ort/`)
- [ ] Fase 0: spike WASM gera pt-BR no celular
- [x] Fase 0: confirmar índice de vozes — existe `voices.json` na raiz do `rhasspy/piper-voices` (177 vozes, 58 idiomas)
- [x] Fase 1: `output: 'export'` + interface `TtsEngine` + `WasmEngine`
- [x] Fase 1: tela com seletor de voz, texto, gerar, player e baixar (layout de chat, prévias, gerenciar vozes)
- [x] Fase 1: manifest PWA + `coi-serviceworker`
- [ ] Fase 1: deploy no GitHub Pages — workflow pronto (dispara por tag `v*`); falta liberar tags no environment `github-pages` e publicar a primeira tag
- [ ] Fase 2: CLI em Rust funcionando com `.txt` → `.wav` — código em `cli/`, ainda não compilado
- [ ] Fase 3: Tauri com `TauriEngine` (listar, baixar, gerar) — código em `src-tauri/`, ainda não compilado
- [ ] Fase 3: decidir como embutir o Piper e fechar a questão da licença
- [ ] Fase 3: release automático dos instaladores — `release.yml` pronto, ainda não executado
- [ ] Fase 4: decidir entre PWA puro e Capacitor
- [x] Voz feminina pt-BR: Dii (OpenVoiceOS/TigreGotico), CC BY-NC-ND 4.0 — somente uso não comercial

## 15. Links

- Piper (atual): https://github.com/OHF-Voice/piper1-gpl
- Vozes: https://huggingface.co/rhasspy/piper-voices
- Piper no navegador: https://github.com/Mintplex-Labs/piper-tts-web
- Sherpa-ONNX (WASM e mobile): https://k2-fsa.github.io/sherpa/onnx/tts/wasm/index.html
- Tauri 2: https://v2.tauri.app
- coi-serviceworker: https://github.com/gzuidhof/coi-serviceworker