/**
 * Contrato entre a UI e os motores de síntese.
 *
 * Regra do projeto: "uma interface, dois motores". A UI só conhece estes tipos;
 * `WasmEngine` (navegador) e `TauriEngine` (desktop) implementam `TtsEngine`.
 */

/** Qualidade de modelo publicada no catálogo do Piper. */
export type VoiceQuality = 'x_low' | 'low' | 'medium' | 'high';

/** Metadados de uma voz exibidos no seletor. */
export interface VoiceInfo {
  /** Identificador do Piper, ex.: `pt_BR-faber-medium`. */
  id: string;
  /** Código de idioma, ex.: `pt_BR`. */
  language: string;
  /** Nome do locutor, ex.: `faber`. */
  name: string;
  quality: VoiceQuality | string;
  /** Tamanho do modelo `.onnx` em bytes (para avisar antes do download). */
  sizeBytes?: number;
  /** `true` se o modelo já está salvo no aparelho. */
  installed: boolean;
}

/** Progresso de geração: `done` de `total` trechos concluídos. */
export interface SynthesisProgress {
  done: number;
  total: number;
}

export interface SynthesizeOptions {
  onProgress?: (progress: SynthesisProgress) => void;
  /** Cancela a geração entre trechos (cooperativo). */
  signal?: AbortSignal;
}

export interface DownloadOptions {
  /** Percentual 0–100. */
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

/** Interface única que a UI usa para falar com qualquer motor. */
export interface TtsEngine {
  /** Nome do motor para diagnóstico (`wasm` | `tauri`). */
  readonly kind: 'wasm' | 'tauri';

  /** Lista as vozes pt-BR disponíveis, marcando as já instaladas. */
  listVoices(): Promise<VoiceInfo[]>;

  /** Baixa e persiste o modelo de uma voz. */
  downloadVoice(id: string, options?: DownloadOptions): Promise<void>;

  /** Remove o modelo de uma voz do aparelho. */
  removeVoice(id: string): Promise<void>;

  /** Gera áudio WAV (PCM 16-bit mono) para o texto informado. */
  synthesize(text: string, voiceId: string, options?: SynthesizeOptions): Promise<Blob>;

  /** Libera recursos (workers, sessões). Opcional. */
  dispose?(): void;
}

/** Idioma alvo do app. Centralizado para facilitar suporte a outros idiomas. */
export const TARGET_LANGUAGE = 'pt_BR';

/** Erro lançado quando o usuário cancela uma operação. */
export class AbortError extends Error {
  constructor(message = 'Operação cancelada.') {
    super(message);
    this.name = 'AbortError';
  }
}
