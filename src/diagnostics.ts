export type DiagnosticCode =
  | 'loader/build-not-found'
  | 'loader/sw-timeout'
  | 'loader/duplicate-playwright'
  | 'popup/no-active-tab'
  | 'content-ui/not-injected'
  | 'content-ui/wrong-frame'
  | 'background/restart-timeout'
  | 'background/eval-failed'
  | 'storage/key-absent';

export interface Diagnostic {
  code: DiagnosticCode;
  [extra: string]: unknown;
}

const HINTS: Record<DiagnosticCode, string> = {
  'loader/build-not-found':
    'extensionPath does not point at a built extension — expected a manifest.json there.',
  'loader/sw-timeout':
    'no MV3 service worker registered after load — check manifest "background.service_worker".',
  'loader/duplicate-playwright':
    "two @playwright/test copies were resolved (crxbox vs consumer) — crxbox must share the consumer's single instance. Consume crxbox as a published or `npm pack`ed tarball, or dedupe so only one @playwright/test exists; do not live-symlink a dev checkout that ships its own node_modules.",
  'popup/no-active-tab':
    'openForTab() needs a focused active tab — pass the page you navigated, and avoid stealing focus.',
  'content-ui/not-injected':
    'the root selector never appeared in the expected frame — check the content script matches/run_at, or pass { frame } if it injects into an iframe.',
  'content-ui/wrong-frame':
    'the target <iframe> element was not found in the outer page — verify the { frame } selector matches the iframe that hosts the UI.',
  'background/restart-timeout':
    'the service worker did not come back after kill() — it may be crashing on startup; check SW console logs.',
  'background/eval-failed':
    'evaluate() threw inside the service worker — see cause; remember the SW has no DOM.',
  'storage/key-absent':
    'no value is stored under this key — confirm the write happened and the storage area (local/sync/session) is correct.',
};

export function formatMessage(d: Diagnostic, summary?: string): string {
  const head = summary ?? d.code;
  const json = JSON.stringify(d);
  const hint = HINTS[d.code] ? `\n  hint: ${HINTS[d.code]}` : '';
  return `${head}\n  crxbox: ${json}${hint}`;
}

export class CrxboxError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(diagnostic: Diagnostic, summary?: string) {
    super(formatMessage(diagnostic, summary));
    this.name = 'CrxboxError';
    this.diagnostic = diagnostic;
  }
}
