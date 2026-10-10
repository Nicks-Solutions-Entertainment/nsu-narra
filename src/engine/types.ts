/**
 * Contrato entre a UI e os motores de síntese.
 *
 * Regra do projeto: "uma interface, dois motores". A UI só conhece estes tipos;
 * `WasmEngine` (navegador) e `TauriEngine` (desktop) implementam `TtsEngine`.
 */

/** Qualidade de modelo publicada no catálogo do Piper. */
export type VoiceQuality = 'x_low' | 'low' | 'medium' | 'high';

/** `official`: rhasspy/piper-voices · `community`: catalog/community-voices.json. */
export type VoiceSource = 'official' | 'community';

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
  source: VoiceSource;
  gender?: 'male' | 'female';
  /** Licença declarada pelo autor (vozes da comunidade). */
  license?: string;
  /** `false` quando a licença proíbe uso comercial. */
  commercialUse?: boolean;
  attribution?: string;
  /** Página do modelo (cartão com licença e detalhes). */
  homepage?: string;
  /** Amostra de áudio remota (preview sem baixar o modelo). */
  sampleUrl?: string;
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

  /** Lista todas as vozes disponíveis (todos os idiomas), marcando as instaladas. */
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

/** Erro lançado quando o usuário cancela uma operação. */
export class AbortError extends Error {
  constructor(message = 'Operação cancelada.') {
    super(message);
    this.name = 'AbortError';
  }
}
