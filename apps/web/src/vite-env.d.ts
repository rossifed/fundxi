/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_STREAM_URL?: string;
  readonly VITE_SHARES_PER_PLAYER?: string;
  readonly VITE_MAX_GROSS_LEVERAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
