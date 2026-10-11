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
    group: 'Interface',
    items: [
      { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT' },
      { name: 'React Router', url: 'https://github.com/remix-run/react-router', license: 'MIT' },
      { name: 'TanStack Query', url: 'https://github.com/TanStack/query', license: 'MIT' },
      { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', license: 'MIT' },
      { name: 'Phosphor Icons', url: 'https://github.com/phosphor-icons/react', license: 'MIT' },
      { name: 'DiceBear', url: 'https://github.com/dicebear/dicebear', license: 'MIT (artwork: per style)' },
      { name: 'Inter', url: 'https://github.com/rsms/inter', license: 'OFL-1.1' },
      { name: 'react-markdown', url: 'https://github.com/remarkjs/react-markdown', license: 'MIT' },
      { name: 'react-qr-code', url: 'https://github.com/rosskhanas/react-qr-code', license: 'MIT' },
      { name: 'Vite', url: 'https://github.com/vitejs/vite', license: 'MIT' },
      { name: 'Electron', url: 'https://github.com/electron/electron', license: 'MIT' },
    ],
  },
  {
    group: 'Server',
    items: [
      { name: 'Rust', url: 'https://github.com/rust-lang/rust', license: 'MIT / Apache-2.0' },
      { name: 'Tokio', url: 'https://github.com/tokio-rs/tokio', license: 'MIT' },
      { name: 'axum', url: 'https://github.com/tokio-rs/axum', license: 'MIT' },
      { name: 'SQLx', url: 'https://github.com/launchbadge/sqlx', license: 'MIT / Apache-2.0' },
      { name: 'rumqttc', url: 'https://github.com/bytebeamio/rumqtt', license: 'Apache-2.0' },
      { name: 'rustls', url: 'https://github.com/rustls/rustls', license: 'Apache-2.0 / ISC / MIT' },
      { name: 'reqwest', url: 'https://github.com/seanmonstar/reqwest', license: 'MIT / Apache-2.0' },
    ],
  },
  {
    group: 'Inspiration',
    items: [{ name: 'Home Assistant', url: 'https://www.home-assistant.io', license: 'Tuya QR sign-in flow follows its design' }],
  },
]
