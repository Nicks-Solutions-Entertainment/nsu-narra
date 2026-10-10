import { Channel, invoke } from '@tauri-apps/api/core';
import type { DownloadOptions, SynthesizeOptions, TtsEngine, VoiceInfo } from './types';
import { AbortError } from './types';
import { wavBlob } from './wav';

/** Evento de progresso enviado pelo comando Rust `download_voice` via Channel. */
interface DownloadProgressEvent {
  loaded: number;
  total: number;
}

/**
 * Motor desktop: delega ao back-end Rust (Tauri 2), que roda o Piper nativo.
 *
 * Mapeamento para os comandos em `src-tauri/src/commands/`:
 *  - `list_voices`    → listVoices
 *  - `download_voice` → downloadVoice (progresso por `Channel`)
 *  - `remove_voice`   → removeVoice
 *  - `synthesize`     → synthesize (retorna bytes crus, sem JSON)
 *
 * Desempenho: `synthesize` envia o texto inteiro de uma vez. Cada chamada
 * inicia um processo do Piper e carrega o modelo, então dividir em trechos
 * aqui multiplicaria esse custo; o Piper já processa frase a frase.
 */
export class TauriEngine implements TtsEngine {
  readonly kind = 'tauri' as const;

  listVoices(): Promise<VoiceInfo[]> {
    return invoke<VoiceInfo[]>('list_voices');
  }

  async downloadVoice(id: string, { onProgress, signal }: DownloadOptions = {}): Promise<void> {
    if (signal?.aborted) throw new AbortError();

    const channel = new Channel<DownloadProgressEvent>();
    let lastPct = -1;
    channel.onmessage = ({ loaded, total }) => {
      const pct = total ? Math.round((loaded / total) * 100) : 0;
      if (pct !== lastPct) onProgress?.((lastPct = pct));
    };

    const onAbort = () => void invoke('cancel_download', { voiceId: id });
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await invoke('download_voice', { voiceId: id, onProgress: channel });
    } catch (err) {
      if (signal?.aborted) throw new AbortError('Download cancelado.');
      throw toError(err);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async removeVoice(id: string): Promise<void> {
    await invoke('remove_voice', { voiceId: id }).catch((e) => Promise.reject(toError(e)));
  }

  async synthesize(text: string, voiceId: string, { onProgress, signal }: SynthesizeOptions = {}): Promise<Blob> {
    if (signal?.aborted) throw new AbortError();
    onProgress?.({ done: 0, total: 1 });

    // O comando retorna `tauri::ipc::Response`, que chega como ArrayBuffer
    // (evita serializar o WAV como array JSON de números).
    const bytes = await invoke<ArrayBuffer>('synthesize', { text, voiceId }).catch((e) =>
      Promise.reject(toError(e)),
    );
    if (signal?.aborted) throw new AbortError('Geração cancelada.');

    onProgress?.({ done: 1, total: 1 });
    return wavBlob(bytes);
  }
}

/** Erros do Rust chegam como string serializada; normaliza para `Error`. */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
