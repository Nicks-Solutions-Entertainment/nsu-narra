import type { DownloadOptions, SynthesizeOptions, TtsEngine, VoiceInfo } from '../types';
import { AbortError } from '../types';
import { wavBlob } from '../wav';
import type { WorkerOp, WorkerOps, WorkerRequest, WorkerResponse } from './protocol';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Motor do navegador/PWA: Piper em WASM (onnxruntime-web) dentro de um Web Worker.
 *
 * Esta classe roda no thread da UI e só faz RPC com o worker; nenhum trabalho
 * pesado acontece aqui.
 *
 * Desempenho:
 *  - O worker é criado sob demanda (na primeira chamada).
 *  - O áudio volta como ArrayBuffer transferido (sem cópia).
 */
export class WasmEngine implements TtsEngine {
  readonly kind = 'wasm' as const;

  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  /** Lista as vozes pt-BR e quais já estão no OPFS. */
  listVoices(): Promise<VoiceInfo[]> {
    return this.call('listVoices', {});
  }

  /** Baixa a voz para o OPFS, reportando percentual 0–100. */
  async downloadVoice(id: string, { onProgress, signal }: DownloadOptions = {}): Promise<void> {
    await this.call('download', { voiceId: id }, {
      signal,
      onProgress: onProgress && ((loaded, total) => onProgress(total ? Math.round((loaded / total) * 100) : 0)),
    });
  }

  /** Remove a voz do OPFS. */
  async removeVoice(id: string): Promise<void> {
    await this.call('remove', { voiceId: id });
  }

  /** Gera o WAV no worker, reportando "trecho X de Y". */
  async synthesize(text: string, voiceId: string, { onProgress, signal }: SynthesizeOptions = {}): Promise<Blob> {
    const bytes = await this.call('synthesize', { text, voiceId }, {
      signal,
      onProgress: onProgress && ((done, total) => onProgress({ done, total })),
    });
    return wavBlob(bytes);
  }

  /** Encerra o worker e rejeita chamadas pendentes. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('Motor encerrado.'));
  }

  /**
   * Envia uma requisição tipada ao worker e aguarda o resultado.
   * Um `AbortSignal` dispara `cancel` no worker, que interrompe no próximo ponto seguro.
   */
  private call<K extends WorkerOp>(
    op: K,
    params: WorkerOps[K]['params'],
    opts: { signal?: AbortSignal; onProgress?: Pending['onProgress'] } = {},
  ): Promise<WorkerOps[K]['result']> {
    if (opts.signal?.aborted) return Promise.reject(new AbortError());

    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const onAbort = () => worker.postMessage({ id: this.nextId++, op: 'cancel', params: { targetId: id } } satisfies WorkerRequest);
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      this.pending.set(id, {
        onProgress: opts.onProgress,
        resolve: (v) => {
          opts.signal?.removeEventListener('abort', onAbort);
          resolve(v as WorkerOps[K]['result']);
        },
        reject: (e) => {
          opts.signal?.removeEventListener('abort', onAbort);
          reject(e);
        },
      });
      worker.postMessage({ id, op, params } as WorkerRequest);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(e.data);
    worker.onerror = (e) => {
      this.rejectAll(new Error(e.message || 'Falha no worker de síntese.'));
      worker.terminate();
      if (this.worker === worker) this.worker = null; // a próxima chamada recria o worker
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(msg: WorkerResponse) {
    const p = this.pending.get(msg.id);
    if (!p) return;

    if (msg.kind === 'progress') {
      p.onProgress?.(msg.done, msg.total);
      return;
    }

    this.pending.delete(msg.id);
    if (msg.kind === 'result') p.resolve(msg.result);
    else p.reject(msg.aborted ? new AbortError(msg.message) : new Error(msg.message));
  }

  private rejectAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
