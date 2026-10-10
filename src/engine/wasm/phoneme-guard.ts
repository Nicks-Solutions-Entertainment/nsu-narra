/**
 * Compatibilidade com modelos Piper antigos (ex.: `pt_BR-edresson-low`, Piper 0.2.0).
 *
 * A biblioteca converte texto em ids de fonema com a tabela padrão do espeak
 * (ids até ~151), ignorando a `phoneme_id_map` da voz. Modelos antigos têm
 * menos símbolos (130), e um fonema fora da tabela faz o ONNX falhar com
 * "indices element out of data bounds" no nó Gather.
 *
 * Solução: remover da entrada os ids que o modelo não conhece — o mesmo que o
 * Piper nativo faz com fonemas ausentes. Os ids em comum são idênticos nas
 * duas tabelas, então o resultado das vozes novas não muda.
 */

type Ort = typeof import('onnxruntime-web');
type Session = Awaited<ReturnType<Ort['InferenceSession']['create']>>;
type Feeds = Record<string, InstanceType<Ort['Tensor']>>;

/** Vocabulário da próxima sessão a ser criada (definido pelo worker). */
let pendingVocabulary: ReadonlySet<number> | null = null;

/**
 * Define os ids válidos para a próxima sessão ONNX criada.
 * Deve ser chamado antes de `TtsSession.create`.
 */
export function setNextVocabulary(config: { phoneme_id_map?: Record<string, number[]> } | null): void {
  pendingVocabulary = config?.phoneme_id_map
    ? new Set(Object.values(config.phoneme_id_map).flat())
    : null;
}

/**
 * Devolve uma cópia do módulo `ort` cujo `InferenceSession.create` produz
 * sessões com filtro de fonemas. `env` e `Tensor` continuam sendo os mesmos
 * objetos, então as configurações feitas pela biblioteca valem normalmente.
 */
export function withPhonemeGuard(ort: Ort): Ort {
  // `create` tem várias sobrecargas; os argumentos são repassados como vieram.
  const originalCreate = ort.InferenceSession.create as (...args: unknown[]) => Promise<Session>;
  const create = async (...args: unknown[]) => {
    const vocabulary = pendingVocabulary;
    const session = await originalCreate(...args);
    return vocabulary ? guardRun(ort, session, vocabulary) : session;
  };

  return { ...ort, InferenceSession: { ...ort.InferenceSession, create } } as Ort;
}

/**
 * Envolve `session.run` para filtrar `input` e corrigir `input_lengths`.
 * Custo: um `filter` sobre algumas centenas de ids por trecho (desprezível
 * perto da inferência). Se nada for removido, os tensores originais são usados.
 */
function guardRun(ort: Ort, session: Session, vocabulary: ReadonlySet<number>): Session {
  const run = session.run.bind(session);

  session.run = ((feeds: Feeds, ...rest: unknown[]) => {
    const input = feeds.input;
    if (input?.type === 'int64') {
      const ids = input.data as BigInt64Array;
      const kept = ids.filter((id) => vocabulary.has(Number(id)));
      if (kept.length !== ids.length) {
        if (kept.length === 0) throw new Error('O texto não contém sons suportados por esta voz.');
        feeds = {
          ...feeds,
          input: new ort.Tensor('int64', kept, [1, kept.length]),
          input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(kept.length)), [1]),
        };
      }
    }
    return (run as (...a: unknown[]) => ReturnType<Session['run']>)(feeds, ...rest);
  }) as Session['run'];

  return session;
}
