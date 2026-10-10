"""
Gera as amostras de preview das vozes (OGG Opus) a partir das frases de
`voice-demos/voice-exemples_<lang>.md`.

Saída:
  public/samples/<lang>/<voice-id>/<n>.ogg   (n = 1..N, uma por frase)
  src/data/voice-samples.json                (índice lido pela UI)

Requisitos (fora do projeto, só para gerar):
  pip install piper-tts      # Piper oficial (OHF-Voice/piper1-gpl)
  ffmpeg no PATH             # codificação Opus

Uso:
  python scripts/samples/generate_samples.py --cache <pasta-para-modelos> [--lang pt_BR] [--force]

Os modelos (~60 MB cada) são baixados para `--cache` e reaproveitados entre
execuções; nunca vão para o repositório.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import wave
from pathlib import Path

from piper import PiperVoice

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
COMMUNITY_JSON = ROOT / "src" / "engine" / "catalog" / "community-voices.json"
INDEX_JSON = ROOT / "src" / "data" / "voice-samples.json"
PUBLIC_DIR = ROOT / "public" / "samples"

# Opus a 32 kbps mono: ~4 KB/s, ótimo para voz e leve para a página.
FFMPEG_ARGS = ["-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-application", "voip", "-ac", "1"]


def parse_phrases(md_path: Path) -> list[dict]:
    """Extrai pares (frase entre aspas, linha de autoria iniciada por —)."""
    lines = [l.strip() for l in md_path.read_text(encoding="utf-8").splitlines()]
    phrases = []
    for i, line in enumerate(lines):
        match = re.match(r'^["“](.+)["”]$', line)
        if not match:
            continue
        source = next((l for l in lines[i + 1 : i + 3] if l.startswith("—")), "")
        phrases.append({"text": match.group(1).strip(), "source": source.lstrip("— ").strip()})
    if not phrases:
        sys.exit(f"nenhuma frase encontrada em {md_path}")
    return phrases


def list_voices(lang: str) -> list[dict]:
    """Vozes do idioma: oficiais (voices.json) + comunidade (mesmo JSON do app)."""
    with urllib.request.urlopen(f"{OFFICIAL_BASE}/voices.json") as res:
        official = json.load(res)

    voices = {}
    for v in official.values():
        if v["language"]["code"] != lang:
            continue
        path = next(p for p in v["files"] if p.endswith(".onnx"))
        url = f"{OFFICIAL_BASE}/{urllib.parse.quote(path)}"
        voices[v["key"]] = {"id": v["key"], "model": url, "config": f"{url}.json"}

    community = json.loads(COMMUNITY_JSON.read_text(encoding="utf-8"))["voices"]
    for v in community:
        if v["language"] == lang and v["id"] not in voices:
            voices[v["id"]] = {"id": v["id"], "model": v["modelUrl"], "config": v["configUrl"]}

    return sorted(voices.values(), key=lambda v: v["id"])


def fetch(url: str, dest: Path) -> None:
    """Baixa `url` para `dest` (atômico via .part); pula se já existe."""
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    print(f"  baixando {dest.name}…", flush=True)
    urllib.request.urlretrieve(url, part)
    part.replace(dest)


def synthesize_ogg(voice: PiperVoice, text: str, out: Path) -> None:
    """Sintetiza em WAV na memória e codifica para OGG Opus com o ffmpeg."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        voice.synthesize_wav(text, wav)

    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0", *FFMPEG_ARGS, str(out)],
        input=buf.getvalue(),
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", required=True, type=Path, help="pasta para os modelos baixados")
    parser.add_argument("--lang", default="pt_BR")
    parser.add_argument("--force", action="store_true", help="regera arquivos que já existem")
    args = parser.parse_args()

    md = ROOT / "voice-demos" / f"voice-exemples_{args.lang.replace('_', '').lower()}.md"
    phrases = parse_phrases(md)
    voices = list_voices(args.lang)
    print(f"{len(phrases)} frases × {len(voices)} vozes ({args.lang})")

    for v in voices:
        print(f"- {v['id']}")
        model = args.cache / f"{v['id']}.onnx"
        config = args.cache / f"{v['id']}.onnx.json"
        fetch(v["model"], model)
        fetch(v["config"], config)

        piper_voice = PiperVoice.load(model, config_path=config)
        for n, phrase in enumerate(phrases, start=1):
            out = PUBLIC_DIR / args.lang / v["id"] / f"{n}.ogg"
            if out.exists() and not args.force:
                continue
            synthesize_ogg(piper_voice, phrase["text"], out)
            print(f"    {n}.ogg  {out.stat().st_size // 1024} KB")

    # Índice consumido pela UI: frases + vozes que têm amostra local.
    index = json.loads(INDEX_JSON.read_text(encoding="utf-8")) if INDEX_JSON.exists() else {}
    index[args.lang] = {"phrases": phrases, "voices": [v["id"] for v in voices]}
    INDEX_JSON.parent.mkdir(parents=True, exist_ok=True)
    INDEX_JSON.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"índice atualizado: {INDEX_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
