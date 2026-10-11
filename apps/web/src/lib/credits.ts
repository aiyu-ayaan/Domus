import { t } from '@/lib/i18n'

export const REPO_URL = 'https://github.com/aiyu-ayaan/Domus-Rust'
export const DEVELOPER = { name: 'aiyu-ayaan', github: 'https://github.com/aiyu-ayaan', site: 'https://aiyu.co.in' }

export interface Credit {
  name: string
  url: string
  license: string
}

/** Keep in sync with apps/web/package.json and backend/Cargo.toml. */
export const credits: { group: string; items: Credit[] }[] = [
  {
    group: t('credits.group.interface'),
    items: [
      { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT' },
      { name: 'React Router', url: 'https://github.com/remix-run/react-router', license: 'MIT' },
      { name: 'TanStack Query', url: 'https://github.com/TanStack/query', license: 'MIT' },
      { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', license: 'MIT' },
      { name: 'Phosphor Icons', url: 'https://github.com/phosphor-icons/react', license: 'MIT' },
      { name: 'Lucide', url: 'https://github.com/lucide-icons/lucide', license: 'ISC' },
      { name: 'DiceBear', url: 'https://github.com/dicebear/dicebear', license: 'MIT (artwork: per style)' },
      { name: 'Inter', url: 'https://github.com/rsms/inter', license: 'OFL-1.1' },
      { name: 'react-markdown and remark-gfm', url: 'https://github.com/remarkjs/react-markdown', license: 'MIT' },
      { name: 'react-qr-code', url: 'https://github.com/rosskhanas/react-qr-code', license: 'MIT' },
      { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript', license: 'Apache-2.0' },
      { name: 'Vite', url: 'https://github.com/vitejs/vite', license: 'MIT' },
      { name: 'Electron', url: 'https://github.com/electron/electron', license: 'MIT' },
      { name: 'electron-builder', url: 'https://github.com/electron-userland/electron-builder', license: 'MIT' },
    ],
  },
  {
    group: t('credits.group.server'),
    items: [
      { name: 'Rust', url: 'https://github.com/rust-lang/rust', license: 'MIT / Apache-2.0' },
      { name: 'Tokio', url: 'https://github.com/tokio-rs/tokio', license: 'MIT' },
      { name: 'axum', url: 'https://github.com/tokio-rs/axum', license: 'MIT' },
      { name: 'SQLx', url: 'https://github.com/launchbadge/sqlx', license: 'MIT / Apache-2.0' },
      { name: 'SQLite', url: 'https://www.sqlite.org', license: 'Public domain' },
      { name: 'rumqttc', url: 'https://github.com/bytebeamio/rumqtt', license: 'Apache-2.0' },
      { name: 'rustls', url: 'https://github.com/rustls/rustls', license: 'Apache-2.0 / ISC / MIT' },
      { name: 'reqwest', url: 'https://github.com/seanmonstar/reqwest', license: 'MIT / Apache-2.0' },
      { name: 'RustCrypto (AES-GCM, SHA-2, HMAC)', url: 'https://github.com/RustCrypto', license: 'MIT / Apache-2.0' },
      { name: 'argon2', url: 'https://github.com/RustCrypto/password-hashes', license: 'MIT / Apache-2.0' },
      { name: 'jsonwebtoken', url: 'https://github.com/Keats/jsonwebtoken', license: 'MIT' },
      { name: 'rcgen', url: 'https://github.com/rustls/rcgen', license: 'MIT / Apache-2.0' },
      { name: 'chrono and chrono-tz', url: 'https://github.com/chronotope/chrono', license: 'MIT / Apache-2.0' },
    ],
  },
  {
    group: t('credits.group.data'),
    items: [
      { name: 'Open-Meteo geocoding', url: 'https://open-meteo.com', license: 'CC BY 4.0 (place search for the home location, asked by your server)' },
      { name: 'GitHub Releases', url: 'https://docs.github.com/rest/releases', license: 'Update checks and release notes' },
    ],
  },
  {
    group: t('credits.group.inspiration'),
    items: [{ name: 'Home Assistant', url: 'https://www.home-assistant.io', license: 'Tuya QR sign-in flow follows its design' }],
  },
]
