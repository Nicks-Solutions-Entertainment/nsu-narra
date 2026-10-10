import type { VoiceInfo } from '../types';

/**
 * Protocolo de mensagens entre `WasmEngine` (thread da UI) e `tts.worker.ts`.
 *
 * Cada requisição tem um `id` único; o worker responde com zero ou mais
 * `progress` e, por fim, exatamente um `result` ou `error` com o mesmo `id`.
 */

/** Operações suportadas e o tipo de retorno de cada uma. */
export interface WorkerOps {
  listVoices: { params: Record<string, never>; result: VoiceInfo[] };
  download: { params: { voiceId: string }; result: null };
  remove: { params: { voiceId: string }; result: null };
  synthesize: { params: { text: string; voiceId: string }; result: ArrayBuffer };
}

export type WorkerOp = keyof WorkerOps;

export type WorkerRequest =
  | { [K in WorkerOp]: { id: number; op: K; params: WorkerOps[K]['params'] } }[WorkerOp]
  | { id: number; op: 'cancel'; params: { targetId: number } };

/**
 * Progresso genérico: `done`/`total`.
 * - download: bytes recebidos / bytes totais
 * - synthesize: trechos gerados / trechos totais
 */
export type WorkerResponse =
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'result'; result: unknown }
  | { id: number; kind: 'error'; message: string; aborted: boolean };
