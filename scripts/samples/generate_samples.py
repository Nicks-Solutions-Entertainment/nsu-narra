"""
Gera as amostras de preview das vozes (OGG Opus) a partir das frases de
`voice-demos/voice-exemples_<lang>.md`.

Saída:
  public/samples/<lang>/<voice-id>/<n>.ogg   (n = 1..N, uma por frase)
  src/data/voice-samples.json                (índice lido pela UI)

Requisitos (fora do projeto, só para gerar):
  pip install piper-tts      # Piper oficial (OHF-Voice/piper1-gpl)
  pip install supertonic     # SDK do Supertonic 3 (só para a família supertonic)
  ffmpeg no PATH             # codificação Opus

Uso:
  python scripts/samples/generate_samples.py --cache <pasta-para-modelos> [--lang pt_BR] [--force]
      [--families piper,supertonic]

Os modelos Piper (~60 MB cada) são baixados para `--cache` e reaproveitados
entre execuções; o SDK do Supertonic guarda os seus (~400 MB) em
`~/.cache/supertonic3`. Nada disso vai para o repositório.
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

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
COMMUNITY_JSON = ROOT / "src" / "engine" / "catalog" / "community-voices.json"
SUPERTONIC_JSON = ROOT / "src" / "engine" / "catalog" / "supertonic-voices.json"
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


# Ritmo da fala, igual a `SPEECH_PACE` em src/engine/wasm/speech-pace.ts.
SPEECH_PACE = 1.2


# Supertonic, igual a `src/engine/wasm/supertonic.ts` e `src/engine/tuning.ts`.
SUPERTONIC_SPEED = 1.05 / SPEECH_PACE
SUPERTONIC_STEPS = 8
SUPERTONIC_GAP_SECONDS = 0.3


def synthesize_ogg(voice, text: str, out: Path) -> None:
    """Sintetiza com o Piper em WAV na memória e codifica para OGG Opus."""
    from piper import SynthesisConfig

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        pace = SynthesisConfig(length_scale=voice.config.length_scale * SPEECH_PACE)
        voice.synthesize_wav(text, wav, syn_config=pace)
    encode_ogg(buf.getvalue(), out)


def pcm_to_wav(samples, sample_rate: int) -> bytes:
    """Amostras float (-1..1) → WAV PCM 16-bit mono, como `pcmToWav` do app."""
    import numpy as np

    pcm = (np.clip(samples.reshape(-1), -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return buf.getvalue()


def encode_ogg(wav_bytes: bytes, out: Path) -> None:
    """Codifica um WAV em OGG Opus com o ffmpeg."""
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0", *FFMPEG_ARGS, str(out)],
        input=wav_bytes,
        check=True,
    )


def generate_piper(lang: str, phrases: list[dict], cache: Path, force: bool) -> list[str]:
    """Amostras das vozes Piper do idioma; devolve os ids gerados."""
    from piper import PiperVoice

    voices = list_voices(lang)
    print(f"Piper: {len(phrases)} frases × {len(voices)} vozes ({lang})")
    for v in voices:
        print(f"- {v['id']}")
        model = cache / f"{v['id']}.onnx"
        config = cache / f"{v['id']}.onnx.json"
        fetch(v["model"], model)
        fetch(v["config"], config)

        piper_voice = PiperVoice.load(model, config_path=config)
        for n, phrase in enumerate(phrases, start=1):
            out = PUBLIC_DIR / lang / v["id"] / f"{n}.ogg"
            if out.exists() and not force:
                continue
            synthesize_ogg(piper_voice, phrase["text"], out)
            print(f"    {n}.ogg  {out.stat().st_size // 1024} KB")
    return [v["id"] for v in voices]


def generate_supertonic(lang: str, phrases: list[dict], force: bool) -> list[str]:
    """Amostras das vozes Supertonic 3 do idioma (SDK oficial, mesmos ajustes do app)."""
    from supertonic import TTS

    catalog = json.loads(SUPERTONIC_JSON.read_text(encoding="utf-8"))
    voices = [v for v in catalog["voices"] if v["language"] == lang]
    if not voices:
        return []
    print(f"Supertonic: {len(phrases)} frases × {len(voices)} vozes ({lang})")
    tts = TTS(model="supertonic-3", auto_download=True)
    for v in voices:
        print(f"- {v['id']}")
        style = tts.get_voice_style(voice_name=v["style"])
        for n, phrase in enumerate(phrases, start=1):
            out = PUBLIC_DIR / lang / v["id"] / f"{n}.ogg"
            if out.exists() and not force:
                continue
            wav, _ = tts.synthesize(
                phrase["text"],
                voice_style=style,
                total_steps=SUPERTONIC_STEPS,
                speed=SUPERTONIC_SPEED,
                silence_duration=SUPERTONIC_GAP_SECONDS,
                lang=catalog["lang"],
            )
            encode_ogg(pcm_to_wav(wav, tts.sample_rate), out)
            print(f"    {n}.ogg  {out.stat().st_size // 1024} KB")
    return [v["id"] for v in voices]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", required=True, type=Path, help="pasta para os modelos baixados")
    parser.add_argument("--lang", default="pt_BR")
    parser.add_argument("--force", action="store_true", help="regera arquivos que já existem")
    parser.add_argument("--families", default="piper,supertonic", help="famílias a gerar, separadas por vírgula")
    args = parser.parse_args()
    families = {f.strip() for f in args.families.split(",")}

    md = ROOT / "voice-demos" / f"voice-exemples_{args.lang.replace('_', '').lower()}.md"
    phrases = parse_phrases(md)
    generated: list[str] = []
    if "piper" in families:
        generated += generate_piper(args.lang, phrases, args.cache, args.force)
    if "supertonic" in families:
        generated += generate_supertonic(args.lang, phrases, args.force)

    # Índice consumido pela UI: frases + vozes que têm amostra local.
    index = json.loads(INDEX_JSON.read_text(encoding="utf-8")) if INDEX_JSON.exists() else {}
    # Preserva vozes com amostras geradas fora deste script (ex.: Kokoro).
    previous = index.get(args.lang, {}).get("voices", [])
    index[args.lang] = {"phrases": phrases, "voices": sorted(set(previous) | set(generated))}
    INDEX_JSON.parent.mkdir(parents=True, exist_ok=True)
    INDEX_JSON.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"índice atualizado: {INDEX_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
