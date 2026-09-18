/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  /** DEBUG ONLY: access token Drive cấp thủ công — xem .env.example */
  readonly VITE_DRIVE_ACCESS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
