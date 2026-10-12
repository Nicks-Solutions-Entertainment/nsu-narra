import type { VoiceFamily, VoiceInfo } from '../types';

/**
 * Protocolo de mensagens entre `WasmEngine` (thread da UI) e `tts.worker.ts`.
 *
 * Cada requisição tem um `id` único; o worker responde com zero ou mais
 * `progress` e, por fim, exatamente um `result` ou `error` com o mesmo `id`.
 */

/** Operações suportadas e o tipo de retorno de cada uma. */
export interface WorkerOps {
  /** `families`: limita às famílias pedidas (o desktop só pede as que o Rust não roda). */
  listVoices: { params: { families?: VoiceFamily[] }; result: VoiceInfo[] };
  download: { params: { voiceId: string }; result: null };
  remove: { params: { voiceId: string }; result: null };
  /** `steps`/`speed`/`variation`: ajustes de voz (ver `SynthesizeOptions`). */
  synthesize: {
    params: { text: string; voiceId: string; steps?: number; speed?: number; variation?: number };
    result: ArrayBuffer;
  };
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
