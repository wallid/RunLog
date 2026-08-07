/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

/**
 * Build-time configuration.
 *
 * All three are optional. Without `VITE_SENTRY_DSN` the crash-reporting SDK is
 * never started and the app makes no request of its own — which is the default
 * for local development and for a fork.
 */
interface ImportMetaEnv {
  /** Sentry project DSN. Absent means crash reporting is compiled out. */
  readonly VITE_SENTRY_DSN?: string;
  /** Version string reports are attributed to, usually the commit SHA. */
  readonly VITE_SENTRY_RELEASE?: string;
  /** 0 to 1. Left at 0 unless a build is specifically investigating timing. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
