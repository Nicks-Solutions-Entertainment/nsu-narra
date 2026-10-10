# Narra Voice Lab — Proposta

Projeto separado para **treinar vozes Piper pt-BR** no PC local (RTX 3060 8 GB), destilando vozes do Kokoro, com acompanhamento por console, seleção de voz e retomada automática após interrupções.

> Status: proposta. Nada foi instalado nem treinado ainda. Os números de tempo são estimativas a confirmar na Fase 0.

---

## 1. Objetivo

Produzir vozes **Piper pt-BR com licença que permita uso comercial**, para entrar no catálogo do Narra (`community-voices.json`) com selo ⚖ verde.

Hoje nenhuma voz pt-BR do catálogo é liberada sem ressalva: todas as oficiais foram ajustadas a partir de bases não comerciais (`lessac`, `ryan`), e as da comunidade são não comerciais ou têm a mesma origem.

**Como:** destilação.

1. O **Kokoro-82M** (Apache 2.0) lê ~2.500 frases pt-BR com uma de suas vozes (Dora, Alex, Santa) → dataset sintético.
2. Uma voz **Piper medium** é ajustada (*fine-tuned*) com esse dataset a partir de um checkpoint em **domínio público** (`ljspeech`, `bryce` ou `john`).
3. O resultado é um `.onnx` Piper comum: ~8× mais rápido que o Kokoro no navegador (medido no spike: RTF 0,24 × 1,92) e com o timbre da voz de origem.

**Fora do escopo:** clonar vozes de pessoas reais, treinar vozes de outros idiomas (a estrutura permite, mas não é o foco), servir as vozes (isso é papel do Narra).

---

## 2. Licenças da cadeia

| Peça | Licença | Efeito |
|---|---|---|
| Frases (Common Voice pt) | CC0 | uso livre |
| Kokoro-82M (pesos e saídas) | Apache 2.0 | permite uso comercial; incluir aviso e crédito |
| Checkpoint base (`ljspeech`/`bryce`/`john` medium) | domínio público | sem restrição herdada |
| Código de treino (`piper1-gpl`) | GPL-3.0 | vale para o código, não para os pesos gerados |
| **Voz resultante** | **proposta: Apache 2.0** | ⚖ verde no Narra, com crédito ao Kokoro |

Ressalva a registrar no cartão de cada voz: o Kokoro não informa de quem são as gravações que deram origem às vozes Dora/Alex/Santa.

O repositório do Voice Lab usa **GPL-3.0**, porque importa o código de treino do Piper.

---

## 3. Criação do repositório

1. **Pasta:** fora do projeto web, por exemplo `C:\dev\narra-voice-lab`. O código é pequeno; dados e checkpoints ficam em volume do Docker (no C:, 403 GB livres). O F: (27 GB livres) não deve receber dados de treino.
2. **Git:**
   ```bash
   git init -b main narra-voice-lab
   ```
   `.gitignore` com `outputs/`, `*.ckpt`, `*.onnx`, `*.wav`, `__pycache__/`, `.venv/`.
3. **Licença:** `LICENSE` GPL-3.0 e `NOTICE` com os créditos do Kokoro (Apache 2.0) e do Piper.
4. **Remoto:** repositório no GitHub (privado ou público). As vozes prontas são publicadas no **Hugging Face** (o Narra baixa de lá com CORS), não no GitHub.
5. **Pré-requisito do PC:** Docker Desktop com backend WSL2 (já instalado) e o teste de GPU da Fase 0.

### Estrutura

```
narra-voice-lab/
├─ README.md
├─ PLANO.md                    # este documento
├─ LICENSE · NOTICE
├─ compose.yaml                # serviço com GPU, volume, porta do console
├─ docker/
│  ├─ Dockerfile
│  └─ entrypoint.sh            # sobe o orquestrador + o console web
├─ configs/
│  ├─ voices.yaml              # vozes de origem (Kokoro) e bases de treino
│  └─ defaults.yaml            # épocas, lote, intervalo de checkpoint…
├─ voicelab/                   # pacote Python
│  ├─ cli.py                   # `voicelab tui | add | status | pause | resume`
│  ├─ orchestrator.py          # executa a fila; retoma ao iniciar
│  ├─ state.py                 # SQLite: jobs, etapas, progresso
│  ├─ stages/
│  │  ├─ corpus.py             # baixa e filtra frases CC0
│  │  ├─ dataset.py            # Kokoro → WAV 22.050 Hz + metadata.csv
│  │  ├─ train.py              # fine-tune Piper (subprocesso)
│  │  ├─ export.py             # .onnx + .onnx.json
│  │  └─ samples.py            # OGGs de prévia com as frases do Narra
│  ├─ progress_callback.py     # callback do Lightning → state.py
│  └─ tui/app.py               # console (Textual)
└─ tests/
```

---

## 4. Docker

### Imagem

| Camada | Escolha | Motivo |
|---|---|---|
| Base | `pytorch/pytorch:<versão>-cuda12.x-cudnn9-runtime` (oficial) | já traz PyTorch + CUDA compatíveis; driver 610 suporta CUDA 12 |
| Sistema | `espeak-ng`, `build-essential`, `ffmpeg`, `ttyd` | fonemas, extensão C do treino (`monotonic_align`), OGG, console web |
| Treino | `piper-tts[train]` (piper1-gpl) | treino oficial do Piper (PyTorch Lightning) |
| Professor | `kokoro` (pacote oficial, PyTorch na GPU) | implementação de referência, com o mesmo G2P (`misaki`/espeak `pt-br`) usado no treino do Kokoro |
| Console | `textual`, `rich`, `pynvml` | barras de progresso, seleção de voz, métricas da GPU |

As versões ficam **fixadas** no Dockerfile após a Fase 0. A imagem esperada tem ~8–10 GB.

### `compose.yaml` (esboço)

```yaml
services:
  voicelab:
    build: ./docker
    restart: unless-stopped          # volta sozinho após reiniciar o PC/Docker
    stop_grace_period: 2m            # tempo para salvar checkpoint no `docker stop`
    gpus: all
    shm_size: 4gb                    # DataLoader do PyTorch
    ports:
      - "127.0.0.1:7681:7681"        # console (só nesta máquina)
    volumes:
      - voicelab-data:/data          # corpus, datasets, checkpoints, estado
      - ./outputs:/outputs           # .onnx, .json e OGGs prontos (visíveis no Windows)
volumes:
  voicelab-data:
```

**Volume nomeado** para os dados: milhares de WAVs pequenos numa pasta do Windows montada no container ficam lentos. Só a saída final vai para `./outputs`.

---

## 5. Console de monitoramento

**Porta 7681**, aberta só em `127.0.0.1`: o `ttyd` serve o console (um app de terminal em **Textual**) no navegador, em `http://localhost:7681`. O mesmo console abre num terminal local com:

```bash
docker compose exec voicelab voicelab tui
```

O console **só observa e comanda**. O treino roda no orquestrador, em outro processo: fechar a aba ou o console não afeta o treino.

### Tela principal (esboço)

```
┌ Narra Voice Lab ───────────────────────────────── GPU RTX 3060 · 87% · 6,9/8 GB · 71 °C ┐
│ Progresso geral   ████████████░░░░░░░░░░░░  48%   2 de 3 vozes · termina em ~19 h       │
│                                                                                          │
│ ▶ pt_BR-dora-medium (Kokoro pf_dora → base ljspeech)                                     │
│   1 Corpus      ██████████████████████████ 100%  2.512 frases                            │
│   2 Dataset     ██████████████████████████ 100%  2.512/2.512 WAVs · 3,1 h de áudio       │
│   3 Treino      ███████████░░░░░░░░░░░░░░░  42%  época 842/2000 · passo 61/210           │
│                 loss_g 24,1 · loss_d 2,3 · 1,9 it/s · época em ~1m50s · faltam ~13 h     │
│                 último checkpoint: época 800 (há 9 min) · prévia: outputs/dora/e800/     │
│   4 Exportação  ░░░░░░░░░░░░░░░░░░░░░░░░░░   —                                           │
│                                                                                          │
│   pt_BR-alex-medium   na fila                                                            │
│   pt_BR-santa-medium  concluída ✓  (outputs/santa/)                                      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [N] nova voz  [P] pausar  [R] retomar  [C] cancelar  [↑↓] reordenar  [L] logs  [Q] sair  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Cálculo do progresso
- **Por voz:** etapas com pesos fixos (corpus 2%, dataset 15%, treino 78%, exportação e prévias 5%). O treino conta `(época atual + passo/passos por época) / épocas-alvo`.
- **Geral:** média das vozes da fila, ponderada pelo tamanho de cada job.
- **Tempo restante:** média móvel da duração das últimas épocas.
- **Fonte dos dados:** um callback do Lightning grava época, passo e perdas no SQLite a cada ~10 s; o `pynvml` lê uso, memória e temperatura da GPU. O console só lê o banco.

### Prévia durante o treino
A cada checkpoint (padrão: a cada 100 épocas), o orquestrador gera as 5 frases de `voice-exemples_ptbr.md` em `outputs/<voz>/e<época>/`. Assim dá para **ouvir a evolução no Windows** e parar quando estiver bom.

---

## 6. Seleção de voz

`[N] nova voz` abre um formulário no console:

| Campo | Opções | Padrão |
|---|---|---|
| Voz de origem (Kokoro) | `pf_dora`, `pm_alex`, `pm_santa` (lidas de `configs/voices.yaml`) | — |
| Base de treino | `ljspeech` medium, `bryce` medium, `john` medium (todas domínio público) | `ljspeech` |
| Tamanho do corpus | 1.500 / 2.500 / 4.000 frases | 2.500 |
| Épocas-alvo | número | 2.000 |
| Lote | 8 / 12 / 16 (limitado pela memória da GPU) | 12 (com fp16) |
| Nome final | `pt_BR-<nome>-medium` | gerado |

O job entra numa **fila** executada uma voz por vez, porque a GPU só comporta um treino. Também dá para enfileirar sem o console:

```bash
docker compose exec voicelab voicelab add --source pf_dora --base ljspeech
```

---

## 7. Resistência a interrupções

Regra: **qualquer etapa pode ser interrompida a qualquer momento e retomada sem refazer trabalho**, seja por `docker stop`, reinício do PC, queda de energia ou travamento.

| Peça | Como resiste |
|---|---|
| Estado dos jobs | SQLite no volume (modo WAL). Cada etapa registra `pendente → em andamento → concluída` |
| Início do container | o `entrypoint` sobe o orquestrador, que encontra o job "em andamento" e o continua |
| Corpus | arquivo final gravado de uma vez (temporário + renomear); se existir, a etapa é pulada |
| Dataset | cada WAV é gravado como temporário e renomeado. Na retomada, frases com WAV válido são puladas. O `metadata.csv` é gerado no fim, a partir dos WAVs existentes |
| Treino | checkpoint a cada N épocas + `last.ckpt` (`save_last`). A retomada usa `ckpt_path=last.ckpt`, com época, otimizador e passo restaurados |
| `docker stop` | o orquestrador recebe SIGTERM, pede ao Lightning para parar ao fim do passo atual e salva o `last.ckpt`. O `stop_grace_period: 2m` dá tempo para isso |
| Queda de energia | perde no máximo o trabalho desde o último checkpoint (padrão: 100 épocas, ~3 h; ajustável) |
| Reinício do PC | `restart: unless-stopped` religa o container quando o Docker Desktop sobe |
| Disco | mantém os últimos 3 checkpoints, mais os marcados como "bons" pelo usuário |

O treino roda como **subprocesso** do orquestrador. Se o treino travar (por exemplo, por falta de memória na GPU), o orquestrador registra o erro, reduz o lote e tenta de novo a partir do último checkpoint, até um limite de tentativas.

---

## 8. Pipeline por voz

1. **Corpus:** frases do Common Voice pt (CC0), filtradas para 20–180 caracteres, sem estrangeirismos, com números por extenso (`num2words`, pt_BR). As frases do `voice-exemples_ptbr.md` ficam **fora** do treino, reservadas para avaliação.
2. **Dataset:** `kokoro` (`lang_code='p'`, voz escolhida) na GPU → áudio a 24 kHz → reamostrado para 22.050 Hz → `wavs/<id>.wav` + `metadata.csv` (`id|texto`), no formato LJSpeech.
3. **Treino:** `python -m piper.train fit …` com `espeak_voice=pt-br`, `sample_rate=22050`, `ckpt_path=<base>.ckpt`, precisão `16-mixed`. Os parâmetros exatos são conferidos no `docs/TRAINING.md` do piper1-gpl na Fase 0.
4. **Exportação:** checkpoint escolhido → `.onnx` + `.onnx.json`.
5. **Prévias:** OGG Opus 32 kbps com as frases do Narra (mesmo formato de `public/samples/`).
6. **Publicação** (manual, com aprovação): repositório no Hugging Face com cartão da voz (licença, créditos, base, dataset), mais uma entrada em `community-voices.json` do Narra com `commercial: "yes"`.

---

## 9. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | GPU no Docker, versões fixadas, treino de 10 épocas | `nvidia-smi` no container; treino roda e retoma após `docker stop` |
| 1 | Corpus + dataset da Dora | ~3 h de áudio; amostras soam iguais ao Kokoro |
| 2 | Orquestrador, estado e retomada | matar o container em cada etapa e confirmar que retoma |
| 3 | Console (Textual + ttyd) | progresso, seleção de voz e comandos funcionando em `localhost:7681` |
| 4 | Treino piloto completo (Dora) | prévias por checkpoint; você aprova a qualidade |
| 5 | Exportação e integração no Narra | voz no Hugging Face e no catálogo, com ⚖ verde |
| 6 | Alex e Santa | mesma rotina, só enfileirar |

---

## 10. Estimativas (a confirmar na Fase 0)

| Item | Estimativa |
|---|---|
| Gerar o dataset (2.500 frases, GPU) | 10–20 min por voz |
| Treino (medium, lote 12, fp16, RTX 3060 8 GB) | 12–24 h por voz |
| Imagem Docker | 8–10 GB |
| Volume por voz (dataset + 3 checkpoints) | ~4 GB |
| Downloads iniciais | ~5 GB (imagem + Kokoro + checkpoint base) |

---

## 11. Riscos e planos B

| Risco | Plano B |
|---|---|
| Docker Desktop não expõe a GPU | instalar Ubuntu no WSL2 e rodar os mesmos scripts sem Docker |
| 8 GB de memória de vídeo insuficientes | lote 8, `max_phoneme_ids` menor, acúmulo de gradiente |
| Voz Piper soa abaixo do Kokoro | mais frases (4.000), mais épocas, testar a base `bryce` em vez de `ljspeech` |
| Erros de pronúncia do Kokoro em pt-BR | filtrar frases problemáticas do corpus; revisar as prévias |
| Treino longo esquenta ou ocupa o PC | limite de potência da GPU (`nvidia-smi -pl`), pausar pelo console |
| Versão do piper1-gpl muda as flags de treino | versões fixadas na imagem; atualizar só de propósito |

---

## 12. Referências

- Piper (treino): https://github.com/OHF-Voice/piper1-gpl
- Checkpoints oficiais: https://huggingface.co/datasets/rhasspy/piper-checkpoints
- Kokoro-82M: https://huggingface.co/hexgrad/Kokoro-82M
- Common Voice (frases CC0): https://github.com/common-voice/common-voice
- Textual: https://textual.textualize.io · ttyd: https://github.com/tsl0922/ttyd
