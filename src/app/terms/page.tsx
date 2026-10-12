import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader/AppHeader';
import { TermsAcceptance } from '@/components/TermsDialog/TermsAcceptance';
import supertonic from '@/engine/catalog/supertonic-voices.json';
import { TERMS_SUMMARY, TERMS_VERSION } from '@/lib/terms-content';
import styles from './termos.module.css';

export const metadata: Metadata = {
  title: 'Termos de Uso e licenças — Narra',
  description: 'Termos de Uso do Narra e licenças dos modelos e vozes.',
};

const version = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(TERMS_VERSION));

/**
 * Rota `/terms` — Termos de Uso e licenças (estática).
 *
 * Base: as restrições de uso do Anexo A da OpenRAIL-M (Supertonic 3), que o
 * Narra adota para todas as vozes. Elas valem para os modelos e o áudio
 * gerado, não para o código do app (GPL-3.0 não admite restrições extras).
 * Mudou algo relevante? Suba `TERMS_VERSION` em `src/lib/terms-content.ts`.
 */
export default function TermsPage() {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.content}>
        <h1>Termos de Uso e licenças</h1>
        <p className={styles.meta}>Versão de {version}</p>

        <section className={styles.summary} aria-labelledby="resumo">
          <h2 id="resumo">Resumo</h2>
          <ul>
            {TERMS_SUMMARY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <h2>1. Sobre o Narra</h2>
        <p>
          O Narra é um aplicativo de código aberto que transforma texto em fala com modelos de inteligência artificial
          executados no seu próprio aparelho. O texto que você digita e o áudio gerado não são enviados a servidores; os
          modelos de voz são baixados diretamente dos repositórios de origem.
        </p>

        <h2>2. Licenças dos modelos e vozes</h2>
        <p>
          Cada modelo e cada voz mantêm a licença definida por seus autores. O Narra apenas a indica (selo ⚖ ao lado de
          cada voz). Em caso de dúvida ou conflito, vale a licença original.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Licença</th>
                <th>Uso comercial</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vozes Piper (repositório oficial e comunidade)</td>
                <td>Própria de cada voz: CC0, CC BY, MIT, CC BY-NC, CC BY-NC-ND ou só pesquisa</td>
                <td>Depende da voz. As marcadas “não permite” só podem ser usadas sem fins comerciais; nas “incertas”, avalie antes.</td>
              </tr>
              <tr>
                <td>Kokoro-82M</td>
                <td>
                  <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
                    Apache 2.0
                  </a>
                </td>
                <td>Permitido.</td>
              </tr>
              <tr>
                <td>Supertonic 3</td>
                <td>
                  <a href={supertonic.licenseUrl} target="_blank" rel="noreferrer">
                    OpenRAIL-M
                  </a>
                </td>
                <td>Permitido, desde que respeitadas as regras da seção 3, que são condição da licença.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>3. Uso responsável</h2>
        <p>
          Estas regras vêm do Anexo A da licença OpenRAIL-M e são obrigatórias para as vozes Supertonic 3. O Narra as adota
          para todas as vozes. Você concorda em não usar os modelos, as vozes ou o áudio gerado para:
        </p>
        <ol type="a" className={styles.rules}>
          <li>violar leis ou regulamentos, nacionais ou internacionais;</li>
          <li>explorar, prejudicar ou tentar prejudicar menores de idade;</li>
          <li>gerar ou divulgar informação comprovadamente falsa com o objetivo de prejudicar alguém;</li>
          <li>gerar ou divulgar dados pessoais que possam ser usados para prejudicar uma pessoa;</li>
          <li>difamar, depreciar ou assediar outras pessoas;</li>
          <li>
            se passar por outra pessoa sem o consentimento dela, inclusive com deepfakes ou imitando a voz de pessoas
            reais;
          </li>
          <li>tomar decisões totalmente automatizadas que afetem direitos ou criem obrigações para alguém;</li>
          <li>
            discriminar ou prejudicar pessoas ou grupos com base em comportamento social, características pessoais ou
            características protegidas por lei;
          </li>
          <li>explorar vulnerabilidades ligadas a idade ou a condição social, física ou mental para causar dano;</li>
          <li>dar aconselhamento médico ou interpretar resultados médicos;</li>
          <li>
            gerar informações para a administração da justiça, policiamento, imigração ou asilo (por exemplo, prever a
            ocorrência de crimes).
          </li>
        </ol>

        <h2>4. Aviso de conteúdo gerado por IA</h2>
        <p>
          Ao publicar, compartilhar ou distribuir um áudio do Narra, informe de forma clara que ele foi gerado por
          inteligência artificial (por exemplo, na descrição, na legenda ou nos créditos). Plataformas como o YouTube
          também pedem que conteúdo sintético realista seja sinalizado no envio. Os arquivos OGG exportados levam essa
          marcação nos metadados, mas isso não substitui o aviso visível.
        </p>

        <h2>5. Seu conteúdo e sua responsabilidade</h2>
        <p>
          O áudio gerado é seu: os autores dos modelos não reivindicam direitos sobre ele. Você é responsável pelo uso que
          fizer do áudio e por ter o direito de narrar o texto usado (por exemplo, obras protegidas por direitos autorais).
        </p>

        <h2>6. Sem vínculo com os autores dos modelos</h2>
        <p>
          O Narra é um projeto independente. Nomes como Piper, Kokoro, Supertonic, Supertone, hexgrad e OpenVoiceOS aparecem
          apenas para identificar a origem e a licença de cada modelo e para dar o crédito que as licenças exigem. Eles não
          indicam parceria, patrocínio ou aprovação desses autores.
        </p>

        <h2>7. Sem garantias</h2>
        <p>
          O app e os modelos são oferecidos “no estado em que se encontram”, sem garantias de qualquer tipo, nos limites
          permitidos pela lei. Os autores do Narra e dos modelos não respondem por danos decorrentes do uso. O projeto
          Supertonic foi arquivado pela Supertone em 2026 e não recebe mais atualizações.
        </p>

        <h2>8. Licença do aplicativo</h2>
        <p>
          O código do Narra é distribuído sob a licença GPL-3.0-or-later (o Piper e o espeak-ng também são GPL-3.0). Estes
          termos não limitam os direitos que a GPL dá sobre o código-fonte; eles tratam do uso dos modelos, das vozes e do
          áudio gerado. Componentes de terceiros mantêm suas licenças: onnxruntime-web (MIT) e lamejs, usado na exportação
          em MP3 (LGPL-3.0).
        </p>

        <h2>9. Mudanças nestes termos</h2>
        <p>
          Estes termos podem ser atualizados. Quando isso acontecer, o Narra pedirá um novo aceite antes de você voltar a
          gerar áudio.
        </p>

        <TermsAcceptance />

        <p className={styles.back}>
          <Link href="/">← Voltar para o Narra</Link>
        </p>
      </main>
    </div>
  );
}
