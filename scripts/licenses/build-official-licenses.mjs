/**
 * Gera `src/engine/catalog/official-licenses.json`: licença e situação de uso
 * comercial de cada voz oficial do Piper, a partir dos MODEL_CARDs.
 *
 * Regras:
 *  1. A licença declarada no MODEL_CARD (do dataset) é normalizada para um
 *     rótulo curto e classificada em: yes (permite comercial) | no | unclear.
 *  2. Se a voz foi ajustada ("Finetuned from …") a partir de outra, herda a
 *     restrição da base: base `no`/`unclear` rebaixa `yes` para `unclear`.
 *     Ex.: Faber (dataset CC0) ajustada da lessac (licença só p/ pesquisa).
 *
 * Uso: node scripts/licenses/build-official-licenses.mjs
 * Reexecute quando o catálogo oficial ganhar vozes novas.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'engine', 'catalog', 'official-licenses.json');
const BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

/** [regex, rótulo, situação] — a primeira regra que casar vence. */
const LICENSE_RULES = [
  [/blizzard|lessac/i, 'Blizzard 2013 (pesquisa)', 'no'],
  [/non-?commercial|\bnc\b|by-nc|-nc-|nc-sa|nc 4/i, null, 'no'],
  [/cc0|public domain|unlicense/i, null, 'yes'],
  [/by-sa|share-?alike|by sa/i, null, 'yes'],
  [/cc[- ]?by|creativecommons\.org\/licenses\/by\/|attribution/i, null, 'yes'],
  [/\bmit\b/i, 'MIT', 'yes'],
  [/apache/i, 'Apache 2.0', 'yes'],
  [/agpl/i, 'AGPL-3.0', 'yes'],
  [/\bgpl/i, 'GPL', 'yes'],
];

/** Rótulo curto para licenças Creative Commons / domínio público. */
function ccLabel(raw) {
  const s = raw.toLowerCase();
  if (/cc0/.test(s)) return 'CC0';
  if (/public domain/.test(s)) return 'Domínio público';
  if (/unlicense/.test(s)) return 'Unlicense';
  const version = (s.match(/(\d\.\d)/) || [])[1] ?? '4.0';
  const parts = ['BY'];
  if (/nc|non-?commercial/.test(s)) parts.push('NC');
  if (/sa|share-?alike/.test(s)) parts.push('SA');
  if (/nd|no-?deriv/.test(s)) parts.push('ND');
  return `CC ${parts.join('-')} ${version}`;
}

function classify(raw) {
  if (!raw) return { license: 'Não informada', commercial: 'unclear' };
  for (const [re, label, commercial] of LICENSE_RULES) {
    if (re.test(raw)) return { license: label ?? ccLabel(raw), commercial };
  }
  return { license: 'Ver cartão', commercial: 'unclear' };
}

const index = await (await fetch(`${BASE}/voices.json`)).json();
const voices = Object.values(index);

// Lê os MODEL_CARDs em paralelo (12 por vez).
const cards = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: 12 }, async () => {
    while (next < voices.length) {
      const v = voices[next++];
      const path = Object.keys(v.files).find((p) => p.endsWith('MODEL_CARD'));
      if (!path) continue;
      const res = await fetch(`${BASE}/${encodeURI(path)}`);
      if (res.ok) cards.set(v.key, await res.text());
    }
  }),
);

/** Encontra a voz-base citada em "Finetuned from …" (mesmo nome, preferindo a mesma qualidade). */
function findBase(voice, card) {
  const line = (card.match(/(?:fine-?tuned) from ([^\n]+)/i) || [])[1];
  if (!line) return null;
  const quality = (line.match(/\((x_low|low|medium|high) quality\)/i) || [])[1]?.toLowerCase();
  const candidates = voices.filter(
    (o) => o.key !== voice.key && new RegExp(`\\b${o.name.replace(/[_-]/g, '[ _-]?')}\\b`, 'i').test(line),
  );
  return candidates.find((o) => o.quality === quality) ?? candidates.find((o) => o.quality === 'medium') ?? candidates[0] ?? null;
}

const result = {};
const resolving = new Set();

function resolve(voice) {
  if (result[voice.key]) return result[voice.key];
  const card = cards.get(voice.key) ?? '';
  const raw = (card.match(/License:\s*(.+)/i) || [])[1]?.trim();
  const own = classify(raw);
  const entry = { license: own.license, commercial: own.commercial };

  const base = findBase(voice, card);
  if (base && !resolving.has(base.key)) {
    resolving.add(voice.key);
    const b = resolve(base);
    resolving.delete(voice.key);
    if (entry.commercial === 'yes' && b.commercial !== 'yes') {
      entry.commercial = 'unclear';
      entry.note = `Ajustada a partir de ${base.key} (${b.license}).`;
    }
  }
  result[voice.key] = entry;
  return entry;
}

voices.forEach(resolve);

const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');

const tally = Object.values(result).reduce((t, e) => ((t[e.commercial] = (t[e.commercial] ?? 0) + 1), t), {});
console.log(`${Object.keys(result).length} vozes →`, tally);
for (const [k, e] of Object.entries(sorted).filter(([k]) => k.startsWith('pt_'))) {
  console.log(' ', k.padEnd(22), e.commercial.padEnd(8), e.license, e.note ?? '');
}
