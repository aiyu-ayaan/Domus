/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_FLAVOR?: 'dev' | 'prod'
  readonly DOCUS_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
