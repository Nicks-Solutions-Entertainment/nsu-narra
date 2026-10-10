import { NarratorScreen } from '@/features/narrator/NarratorScreen';

/**
 * Rota `/` — tela única do app.
 *
 * Server Component: o HTML estático é gerado no build (`output: 'export'`);
 * só `NarratorScreen` é hidratado no cliente.
 */
export default function HomePage() {
  return <NarratorScreen />;
}
