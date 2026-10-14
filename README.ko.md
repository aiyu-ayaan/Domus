<img src="design-system/domus/brand/app-icon.svg" alt="Domus logo" width="72" />

# Domus

<p align="center">
  <b>Translations</b><br>
  <a href="README.md">English</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.bn.md">বাংলা</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.gu.md">ગુજરાતી</a> ·
  <a href="README.hi.md">हिन्दी</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.kn.md">ಕನ್ನಡ</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.ml.md">മലയാളം</a> ·
  <a href="README.mr.md">मराठी</a> ·
  <a href="README.pa.md">ਪੰਜਾਬੀ</a> ·
  <a href="README.pl.md">Polski</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.ta.md">தமிழ்</a> ·
  <a href="README.te.md">తెలుగు</a> ·
  <a href="README.th.md">ไทย</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.ur.md">اردو</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a>
</p>

[![Release](https://img.shields.io/github/actions/workflow/status/aiyu-ayaan/Domus-Rust/release.yml?branch=master&label=release&logo=githubactions&logoColor=white)](https://github.com/aiyu-ayaan/Domus-Rust/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/aiyu-ayaan/Domus-Rust?include_prereleases&label=version&logo=github)](https://github.com/aiyu-ayaan/Domus-Rust/releases)
[![License: MIT](https://img.shields.io/github/license/aiyu-ayaan/Domus-Rust)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/aiyu-ayaan/Domus-Rust/master)](https://github.com/aiyu-ayaan/Domus-Rust/commits/master)
[![Docker pulls](https://img.shields.io/docker/pulls/aiyuayaan/domus?logo=docker&logoColor=white)](https://hub.docker.com/r/aiyuayaan/domus)
[![Docker image size](https://img.shields.io/docker/image-size/aiyuayaan/domus/latest?logo=docker&logoColor=white)](https://hub.docker.com/r/aiyuayaan/domus)

![Rust](https://img.shields.io/badge/backend-Rust-000000?logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/web-React%20%2B%20TypeScript-149ECA?logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/desktop-Electron-47848F?logo=electron&logoColor=white)
![Android](https://img.shields.io/badge/android-Kotlin%20%2B%20Compose-3DDC84?logo=android&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-Home%20Assistant%20discovery-660066?logo=mqtt&logoColor=white)
![Matter](https://img.shields.io/badge/Matter-bridge-1A1A1A?logo=matter&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-Web%20%7C%20Linux%20%7C%20Windows%20%7C%20Android-informational)
![Languages](https://img.shields.io/badge/languages-27-blue?logo=googletranslate&logoColor=white)
[![Lines of code](https://img.shields.io/endpoint?url=https%3A%2F%2Fghloc.dev%2Fapi%2Faiyu-ayaan%2FDomus%2Fbadge%3Ffilter%3D.rs%24%2C.ts%24%2C.tsx%24%2C.kt%24%2C.kts%24%2C.js%24%2C.mjs%24%2C.css%24%2C.sql%24&label=lines%20of%20code&color=orange)](https://ghloc.dev/aiyu-ayaan/Domus)
![Encrypted](https://img.shields.io/badge/HTTPS-by%20default-success?logo=letsencrypt&logoColor=white)

홈 서버를 위해 설계된 로컬 우선(Local-first) 스마트 홈 허브입니다. Rust 백엔드, SQLite, React 웹 UI(및 Electron 데스크톱 셸)를 기반으로 구축되었으며, **Tuya / Smart Life**(개발자 계정 필요 없는 QR 코드 로그인), **TP-Link Tapo**(로컬 제어), **Xiaomi Mi Home**(로컬 제어, Mi 계정에서 토큰 추출), **Philips Hue**(로컬 브리지), **MQTT**(Zigbee2MQTT, ESPHome 및 Home Assistant 자동 검색을 지원하는 모든 장치) 등 플러그형 연동을 지원합니다. 내장된 **Matter 브리지**를 통해 Google Home, Apple Home, Alexa, Home Assistant에서 자체 로컬 네트워크를 통해 해당 기기의 전원 전환, 디밍 및 색상 조절을 직접 수행할 수 있습니다.

- 수신함 확인 또는 자동 추가 방식을 지원하는 새 기기 자동 검색
- 실시간 대시보드: 소비 전력, 누적 요금 및 예상 청구액, 공기질, 모션 / 도어 / 누수 / 배터리 측정값
- 방, 기기 그룹, 장면 및 자동화: 특정 시간, **일출 또는 일몰**(오프셋 설정 가능), 기기 상태 변경, 전력 수치(*X W 이상이 N 분간 지속될 때* 등), 오프라인 전환 또는 **실외 날씨** 기반 트리거 지원
- **자동화 실행 기록**: 각 자동화의 최근 50회 실행 기록 유지(실행을 촉발한 트리거와 실행을 보류한 조건 추적)
- **기기 히스토리**: 기기의 모든 상태 변경 사항과 변경 주체(사용자 및 사용한 앱, 자동화, Matter, 또는 기기 자체 조작)
- 자동화 작성 없이 사용 가능한 **스마트 알림**: 기기가 너무 오래 켜져 있을 때 알림, 공기청정기 필터 교체 사전 알림
- **Matter 브리지**: 클라우드 계정 없이 로컬에서 선택한 기기를 Google Home, Apple Home, Alexa, Home Assistant와 공유
- 대시보드에서 실내 측정값 옆에 표시되는 홈 위치의 **실외 날씨 및 공기질**(Open-Meteo 연동, API 키 불필요)
- **전환 전 확인**: 메인 스위치를 지정하여 모든 앱, 그룹, 장면 및 수동 자동화 실행 시 켜거나 끄기 전에 경고창 표시
- 모든 통화를 지원하는 단일 요율, 누진 구간(Slabs) 및 **시간대별 요금제(Time-of-day)**, 기기별 **대기 전력 비용**, 그리고 **태양광**(발전량, 잉여 송전량, 넷 미터링 또는 발전차액 지원요율)
- 관리자 / 구성원 / 게스트 역할을 포함한 다중 사용자 지원 및 방별·기기별 접근 권한 설정(보기 전용, 제어, 편집)
- 웹, Electron 데스크톱(Linux, Windows) 및 네이티브 Android 앱 간의 실시간 양방향 동기화
- 웹, 데스크톱 및 Android 앱에서 **27개 언어** 지원. 시스템 언어를 자동 감지하며 설정에서 변경 가능. 아랍어와 우르두어를 위한 우측에서 좌측으로(RTL) 레이아웃 지원
- 모든 앱에 마크다운, 표, 이미지를 지원하는 릴리스 정보를 담은 '업데이트' 페이지 제공
- 기본 HTTPS 적용, 저장된 자격 증명 및 기기 암호화 키 보호, 단일 파일 백업 및 복원 지원

아키텍처 및 다이어그램: [`development/docs/ARCHITECTURE.md`](development/docs/ARCHITECTURE.md) (요약은 [아래](#how-it-fits-together) 참조).
UI 디자인 프로필: [`design-system/domus/MASTER.md`](design-system/domus/MASTER.md).
개발 진행 상황: [`development/TODO.md`](development/TODO.md).

<a id="how-it-fits-together"></a>
## 전체 구조 및 작동 원리

```mermaid
flowchart LR
    subgraph Clients
        Web["React web UI"]
        Desk["Electron desktop"]
        And["Android app<br/>(Kotlin, Compose)"]
    end

    subgraph Server["Domus server: Rust (Axum, Tokio), one binary or Docker image"]
        direction TB
        TLS["HTTPS (rustls)"] --> Auth["JWT auth<br/>role and access read from the database"]
        Auth --> Modules["modules<br/>users · devices · rooms · scenes · automations<br/>energy · solar · notifications · integrations"]
        Auth --> WS["live events (WebSocket)"]
        Modules --> Mgr["DeviceManager<br/>poll · discover · command"]
        Mgr --> Bus(("EventBus"))
        Bus --> Engine["AutomationEngine<br/>time · sun · state · power · weather triggers<br/>run traces"]
        Engine --> Mgr
        Bus --> WS
        Bus --> Log["Logbook<br/>who changed what"]
        Bus --> Watch["Watchdog<br/>left-on · filter alerts"]
        Workers["workers<br/>poller · discovery · scheduler"] --> Mgr
        Workers --> Engine
        Weather["Weather<br/>every 30 min"] --> Bus
        Mgr --> Vault["Vault<br/>AES-256-GCM"]
        Bus --> Matter["Matter bridge<br/>rs-matter, own thread"]
        Matter --> Mgr
    end

    Ctrl["Google Home · Apple Home<br/>Alexa · Home Assistant"] <-->|"Matter over UDP 5540, mDNS"| Matter

    subgraph Plugins["integrations"]
        Tuya["Tuya / Smart Life<br/>cloud, QR login"]
        Tapo["Tapo<br/>local"]
        Xiaomi["Xiaomi<br/>local miIO"]
        Hue["Philips Hue<br/>local bridge"]
        Mqtt["MQTT<br/>Home Assistant discovery"]
    end

    DB[("SQLite<br/>data/domus.db")]
    Keys[["data/master.key · jwt.secret · tls/"]]
    Web & Desk & And -->|"HTTPS + WSS"| TLS
    Mgr --> Plugins
    Modules --> DB
    Vault -.-> Keys
    Modules -. "place search" .-> Geo(("Open-Meteo<br/>geocoding · weather · air"))
    Weather -. "weather and air at the home" .-> Geo
```

클라이언트 애플리케이션은 오직 서버와만 통신합니다. 서버는 기기와 통신하며(제조사가 허용하는 경우 로컬 통신) 모든 데이터를 하나의 SQLite 파일에 안전하게 보관합니다. 클라우드는 제조사에서 로컬 제어를 제공하지 않는 경우(Tuya)나 기기 키를 가져오는 경우(Xiaomi), 또는 선택적 조회(위치 검색, 홈 위치의 실외 날씨 및 공기질 [Open-Meteo, 위치가 설정된 경우에만 호출], GitHub 업데이트 확인)에만 제한적으로 사용됩니다. Matter 브리지는 오직 로컬 네트워크에서만 동작합니다.

### 데이터 모델

```mermaid
erDiagram
    users ||--o{ user_room_access : "rooms"
    rooms ||--o{ user_room_access : ""
    users ||--o{ user_device_access : "devices"
    devices ||--o{ user_device_access : ""
    rooms ||--o{ devices : contains
    integration_accounts ||--o{ devices : "linked via"
    integration_accounts ||--o{ discovered_devices : "found via"
    devices ||--o{ device_group_members : ""
    device_groups ||--o{ device_group_members : ""
    devices ||--o{ energy_metrics : samples
    devices ||--o{ air_metrics : samples
    devices ||--o{ device_events : history
    automations ||--o{ automation_runs : traces
    users {
        text id PK
        text role
        bool all_rooms
        bool kid
        bool must_change_password
        text reset_code_hash
    }
    user_room_access {
        text user_id
        text room_id
        bool can_control
        bool can_edit
    }
    user_device_access {
        text user_id
        text device_id
        bool can_control
        bool can_edit
    }
    devices {
        text id PK
        text integration_type
        text state_json
        text secrets_enc
        bool is_online
        bool confirm_changes
        int left_on_alert_minutes
    }
    device_events {
        text device_id
        text field
        text value
        text previous
        text actor
        datetime at
    }
    automation_runs {
        text automation_id
        text trigger
        text conditions
        text outcome
        text errors
    }
    discovered_devices {
        text id PK
        text status
        text secrets_enc
    }
    integration_accounts {
        text id PK
        text credentials_enc
        text status
    }
    energy_metrics {
        text device_id
        real power_watts
        real energy_kwh
        datetime recorded_at
    }
    air_metrics {
        text device_id
        real pm25
        datetime recorded_at
    }
    automations {
        text triggers_json
        text conditions_json
        text actions_json
        bool is_enabled
    }
    scenes {
        text actions_json
        text kind
    }
    electricity_settings {
        real rate_per_kwh
        text currency
        text slabs
        text time_of_use
        text solar_device_ids
        text export_mode
        real export_rate
    }
    notifications {
        text level
        text title
        bool is_read
        bool admin_only
    }
    app_settings {
        text key PK
        text value_json
    }
```

인증 자격 증명 및 기기 키는 데이터베이스 외부에 위치한 `data/master.key`로 암호화되어 봉인(`*_enc`)된 상태로 저장됩니다. 기능별 전체 다이어그램 모음은 [`development/docs`](development/docs)에서 확인하실 수 있습니다.

## 스크린샷

<p align="center"><img src="res/domus.gif" alt="Domus 데모" width="270" /></p>

**데스크톱** (Electron 및 웹)

<p>
  <img src="res/screenshots/desktop-dark-overview.png" width="49%" />
  <img src="res/screenshots/desktop-light-overview.png" width="49%" />
  <img src="res/screenshots/desktop-dark-energy.png" width="49%" />
  <img src="res/screenshots/desktop-dark-air-quality.png" width="49%" />
  <img src="res/screenshots/desktop-dark-devices.png" width="49%" />
  <img src="res/screenshots/desktop-dark-automations.png" width="49%" />
</p>

**Android 네이티브 앱**

<p>
  <img src="res/screenshots/android-home.png" width="19%" />
  <img src="res/screenshots/android-devices.png" width="19%" />
  <img src="res/screenshots/android-energy.png" width="19%" />
  <img src="res/screenshots/android-scenes.png" width="19%" />
  <img src="res/screenshots/android-settings.png" width="19%" />
</p>

**Android 태블릿** (840dp 이상 환경에서 2열 배치, '설정' 화면 목록 및 세부 정보 뷰)

<p>
  <img src="res/screenshots/android-tablet-home.png" width="49%" />
  <img src="res/screenshots/android-tablet-analytics.png" width="49%" />
  <img src="res/screenshots/android-tablet-devices.png" width="49%" />
  <img src="res/screenshots/android-tablet-scenes.png" width="49%" />
  <img src="res/screenshots/android-tablet-settings.png" width="49%" />
</p>

**모바일 웹**

<p>
  <img src="res/screenshots/mobile-dark-overview.png" width="19%" />
  <img src="res/screenshots/mobile-dark-devices.png" width="19%" />
  <img src="res/screenshots/mobile-dark-energy.png" width="19%" />
  <img src="res/screenshots/mobile-light-overview.png" width="19%" />
  <img src="res/screenshots/mobile-dark-rooms.png" width="19%" />
</p>

모든 원본 스크린샷은 [`res/screenshots`](res/screenshots)에 있으며, 고화질 전체 둘러보기 영상은 [`res/domus.mp4`](res/domus.mp4)에서 확인하실 수 있습니다.

## 다운로드

| 플랫폼 | 다운로드 및 설치 방법 |
|---|---|
| 서버 (Docker) | Docker Hub의 `aiyuayaan/domus` (amd64 및 arm64 지원) |
| Android | [최신 릴리스 페이지](https://github.com/aiyu-ayaan/Domus-Rust/releases)에서 `Domus-<version>.apk` 다운로드 |
| Linux 데스크톱 | 아래의 단일 라인 설치 스크립트 실행, 또는 릴리스의 `.deb` / `.AppImage` 파일 사용 |
| Windows 데스크톱 | 릴리스 페이지에서 `Domus-<version>-Setup.exe` 다운로드 |

### 서버

호스트 머신에는 하나의 compose 파일만 있으면 충분합니다:

```bash
mkdir domus && cd domus
wget https://raw.githubusercontent.com/aiyu-ayaan/Domus-Rust/master/docker-compose.yml
docker compose up -d
```

웹 브라우저에서 `https://<server-ip>:8443`으로 접속하여 관리자 계정을 생성합니다. `docker compose logs domus`를 실행하면 앱에서 첫 연결 시 확인을 요청하는 인증서 핑거프린트가 출력됩니다.

```bash
docker compose pull && docker compose up -d      # 최신 버전으로 업데이트
DOMUS_VERSION=beta docker compose up -d          # 업데이트 채널 추적: latest (기본값), beta, alpha 또는 0.0.1
TZ=Asia/Seoul DOMUS_PORT=9443 docker compose up -d
docker compose --profile mqtt up -d              # 선택 사양인 Mosquitto MQTT 브로커 함께 실행
```

설정을 영구 유지하려면 compose 파일과 동일한 디렉터리에 `.env` 파일을 만들고 `DOMUS_VERSION`, `TZ`, `DOMUS_PORT`를 지정하세요.

### Linux 데스크톱 앱

현재 사용자를 위한 최신 릴리스를 설치합니다(x86_64, root 권한 불필요): AppImage, Domus 아이콘이 포함된 애플리케이션 메뉴 항목, `domus` 명령어가 설정됩니다. 이후 앱 스스로 최신 버전을 유지합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/aiyu-ayaan/Domus-Rust/master/scripts/install-linux.sh | sh
# ... | sh -s -- --channel beta     베타 빌드 포함 (또는 alpha)
# ... | sh -s -- --uninstall        프로그램 삭제 (설정 파일은 보존됨)
```

### Android

릴리스 페이지에서 APK를 다운로드하여 엽니다. 이후 새 버전이 나오면 앱 실행 시 또는 설정 → 업데이트 화면에서 알림이 표시되며, Stable(안정판), Beta 또는 Alpha 채널을 선택하여 즉시 설치할 수 있습니다. Android 시스템에서 Domus의 앱 설치를 한 번만 허용해 주면 됩니다.

**업데이트** 페이지(Android에서는 설정 → 업데이트, 웹 및 데스크톱에서는 설정 → 정보 → 업데이트)에는 현재 실행 중인 버전, 해당 채널의 최신 버전 및 마크다운 형식의 릴리스 정보가 표시됩니다.

릴리스, 버전 번호 체계 및 업데이트 채널에 대한 자세한 내용은 [development/docs/RELEASE.md](development/docs/RELEASE.md)를 참조하세요.

## 요구 사항

- Rust 1.80 이상 (`cargo`)
- Node.js 18 이상 및 `pnpm`

## 개발 환경 실행

```bash
pnpm install
npm run dev            # 백엔드 (https://127.0.0.1:8443) + 웹 (http://localhost:3000)

npm run dev:backend    # 백엔드만 실행
npm run dev:web        # 웹 전용 실행 (/api 요청을 백엔드로 프록시)
npm run dev:desktop    # Electron 실행. 연결 페이지에서 서버 선택
```

http://localhost:3000 으로 접속합니다. 첫 접속 시 관리자 계정 생성을 요청합니다.

## 홈 서버에서 직접 실행

```bash
pnpm build:web                     # apps/web/dist 빌드 후 백엔드에서 정적 서빙
APP_ENV=production cargo run --release --manifest-path backend/Cargo.toml
```

그 후 브라우저에서 `https://<server-ip>:8443`을 엽니다. Matter 브리지가 켜져 있으면 로컬 LAN에서 UDP 5540(`[matter] port`) 및 mDNS도 사용합니다.

또는 본 저장소에서 직접 Docker 이미지를 빌드하여 실행할 수 있습니다(호스트 네트워킹 모드, 데이터는 `domus_data` 볼륨에 저장):

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Cloudflare Tunnel을 통한 외부 원격 접속, 앱이 내부망/외부망을 자동 전환하는 설정, 데스크톱 패키징 명령(`pnpm build:desktop`)은 [development/docs/DEPLOYMENT.md](development/docs/DEPLOYMENT.md)에 안내되어 있습니다.

처음 시작할 때 Domus는 `data/` 디렉터리에 다음 파일들을 생성합니다:

| 파일 | 용도 설명 |
|---|---|
| `domus.db` | SQLite 데이터베이스 파일 |
| `master.key` | 연동 자격 증명 및 기기 키 암호화 키 — **반드시 안전하게 백업하세요** |
| `jwt.secret` | 사용자 세션 토큰 서명 키 |
| `tls/` | 자체 서명 인증서 (`tls.cert_path` / `tls.key_path`를 통해 사용자 인증서로 교체 가능) |

설정 파일은 `config/default.toml`에 위치하며, 모든 항목은 `DOMUS__SECTION__KEY` 환경 변수로 덮어쓸 수 있습니다(`.env.example` 참조).

## 백업 및 복원

모든 데이터는 `data/`에 저장됩니다. 폴더 전체를 백업하거나 단일 파일 백업 기능을 사용할 수 있습니다:

**백업:** 관리자 계정으로 로그인 → 설정 → **백업** → *백업 다운로드*. 생성되는 파일은 마스터 키가 내부에 포함된 데이터베이스의 전체 복사본이므로 복원 후에도 연동된 계정을 바로 열 수 있습니다. 서버가 실행 중인 상태에서도 안전하게 생성됩니다. 이 파일이 있으면 연동 계정 정보를 열람할 수 있으므로 안전한 곳에 보관하세요. JWT 시크릿과 TLS 인증서는 백업 파일에 포함되지 않습니다.

**복원:** 서버를 중지한 후 다음 명령을 실행합니다:

```bash
# Docker 환경
docker compose cp domus-backup-2026-10-11.db domus:/app/data/restore.db
docker compose stop domus
docker compose run --rm domus domus-backend restore data/restore.db
docker compose start domus

# Docker를 사용하지 않는 경우 (저장소 루트에서 실행, ./data 디렉터리 기준)
domus-backend restore ~/Downloads/domus-backup-2026-10-11.db
```

기존 데이터는 `*.before-restore` 파일명으로 안전하게 옆에 보존됩니다. 새 장비에서 복원한 후에는 사용자가 다시 로그인해야 하며, 앱에서 새 인증서에 대한 신뢰 확인을 요청합니다. 환경 변수 `DOMUS_MASTER_KEY`로 키를 지정했던 경우 백업 파일에 키가 포함되지 않으므로 복원된 서버에도 동일한 환경 변수를 설정해야 합니다. 자세한 내용은 [development/docs/DEPLOYMENT.md](development/docs/DEPLOYMENT.md#backup-and-restore)를 참조하세요.

## 관리자 비밀번호를 잊어버린 경우

Domus에는 자체 메일 서버가 없으므로 이메일로 비밀번호 재설정 링크를 보내지 않습니다. 난이도 순으로 다음 방법을 사용할 수 있습니다:

1. **다른 관리자가 있는 경우**: 설정 → 사용자 및 접근 권한에서 해당 사용자의 *재설정 코드*를 켜고 생성된 8자리 코드를 전달받습니다(30분간 유효, 최대 5회 오류 시도 허용). 로그인 화면에서 *비밀번호를 잊으셨나요?*를 누르고 사용자 이름과 전달받은 코드를 입력합니다.
2. **서버 터미널에서 직접 실행** (Domus 실행 중이거나 정지된 상태 모두 가능, 로그인 불필요):

   ```bash
   docker compose exec domus domus-backend reset-password <username>              # 임의로 생성된 새 비밀번호 출력
   docker compose exec domus domus-backend reset-password <username> 'new-pass'   # 또는 직접 지정 (8자 이상)
   domus-backend reset-password <username>                                        # Docker 없이 저장소 루트에서 실행
   ```

   해당 비밀번호로 로그인한 뒤 설정 → 비밀번호에서 원하는 비밀번호로 변경하세요.

프로덕션 환경에서는 한 사용자 이름에 대해 비밀번호를 5회 연속 잘못 입력하면 15분간 해당 계정이 잠깁니다(서버를 재시작하면 잠금이 해제되며, 개발 환경에서는 비활성화되어 있습니다). 생성되는 비밀번호 규칙 및 자녀 계정에 대한 세부 사항은 [development/docs/ACCOUNTS.md](development/docs/ACCOUNTS.md)를 참조하세요.

## 다국어 지원

영어, 힌디어, 스페인어, 포르투갈어(브라질), 인도네시아어, 아랍어, 프랑스어, 러시아어, 독일어, 튀르키예어, 일본어, 한국어, 이탈리아어, 베트남어, 태국어, 중국어(간체 및 번체), 폴란드어, 벵골어, 타밀어, 텔루구어, 마라티어, 구자라트어, 칸나다어, 말라얄람어, 펀자브어, 우르두어를 지원합니다. 아랍어와 우르두어는 오른쪽에서 왼쪽으로(RTL) 읽는 레이아웃이 적용됩니다.

모든 앱은 브라우저 또는 운영체제의 기본 언어 설정을 따르며, 번역이 없는 언어의 경우 영어로 기본 표시됩니다. 다른 언어로 변경하려면 설정 > 언어(웹 및 데스크톱의 경우 '화면 설정' 내) 메뉴를 이용하세요. *시스템 기본값*을 선택하면 다시 운영체제 언어를 따릅니다. Android 13 이상에서는 휴대폰의 설정 > 앱 > Domus > 언어 항목에서도 개별적으로 변경할 수 있습니다.

번역은 기계 번역을 통해 제작되었으며 원어민의 검수를 거치지 않았으므로 일부 표현이 어색할 수 있습니다. 해당 언어의 언어 카탈로그에서 한 줄 수정으로 간편하게 개선할 수 있습니다. 다국어 작동 방식, 새 언어 추가 방법 및 신규 텍스트 규칙은 [development/docs/LOCALIZATION.md](development/docs/LOCALIZATION.md)를 참조하세요.

## 기기 연결 및 연동

| 브랜드 / 프로토콜 | 연결 방법 |
|---|---|
| Tuya / Smart Life | 연동 → *QR 코드로 연결*. Smart Life 앱의 사용자 코드 (User Code)(나 → 설정 → 계정 및 보안 → 사용자 코드)를 입력한 뒤 화면에 나타난 QR 코드를 스캔합니다. |
| Tapo | 연동 → TP-Link ID로 *계정 연결*. 로컬 LAN 상의 기기가 자동으로 검색되어 로컬에서 직접 제어됩니다. H100 허브에 연결된 센서, 스위치, 온도조절기도 함께 연동됩니다. 카메라는 목록에 표시되지만 아직 세부 제어는 지원되지 않습니다. |
| Xiaomi | 연동 → Mi 계정 및 서버 지역을 선택하여 *계정 연결*. 2단계 인증이 요구되는 경우 수신된 SMS 또는 이메일 인증 코드를 동일한 패널에 입력합니다. 계정은 이메일, 국가 번호가 포함된 전화번호(`+82…`) 또는 Xiaomi ID를 사용할 수 있습니다. 토큰은 최초 1회만 조회되며 이후 제어는 100% 로컬로 이루어집니다. 토큰을 입력해 개별 추가할 수도 있습니다. |
| Philips Hue | Hue 브리지 상단의 둥근 버튼을 누른 뒤, 30초 이내에 연동 → Philips Hue → *연결*을 클릭합니다. IP 주소를 비워두면 로컬 네트워크의 브리지를 자동으로 검색합니다. 조명 및 Hue 스마트 플러그는 로컬에서 직접 제어됩니다. |
| MQTT | 연동 → MQTT → 브로커 주소, 포트, 로그인 정보를 입력하고 *연결*을 클릭합니다. Home Assistant MQTT 자동 검색(Zigbee2MQTT, ESPHome 등)을 통해 감지된 기기들이 '발견됨' 탭에 나타납니다(조명, 스위치, 플러그, 팬, 센서 지원). 번들 브로커(`--profile mqtt`)를 사용할 경우 주소는 `mqtt`, 포트는 `1883`입니다. |

각 연동이 지원하는 상세 기기 목록은 `development/docs/INTEGRATIONS.md`를 참조하세요.

## 전기 요금제 관리

에너지 → *전기 요금제*: 원하는 통화를 자유롭게 선택하고 kWh당 단일 단가를 적용하거나 사용량 구간별 **누진 요금제(Slabs)**(예: 0–100 kWh는 1단계 요율, 101–300 kWh는 2단계 요율 등)를 설정할 수 있습니다. 청구 주기별 총 사용 요금이 산출되며 고정 기본요금도 합산됩니다.

또한 **시간대별 요금제(Time-of-day)** 구간도 지원합니다. 홈의 현지 시각 기준으로 특정 시간대(자정을 넘기는 시간대 설정 가능)에 대해 기본 단가에 할인이나 가산금(예: 심야 할인 또는 피크 시간대 할증)을 설정할 수 있습니다.

새롭게 감지된 기기는 **기기 → 발견됨**에 나타납니다. 여기서 *새 기기 자동 추가*를 켜면 수신함 승인 과정을 거치지 않고 바로 추가할 수 있습니다.

## 일출과 일몰

설정 → **홈 위치**에서 집의 위치를 설정합니다. 스마트폰이나 브라우저의 현재 위치를 사용하거나 도시 이름을 검색(무료 Open-Meteo 지오코딩 서비스를 이용하며, 입력한 지명만 외부로 전송됨)하거나 위도와 경도를 직접 입력할 수 있습니다. 좌표는 약 1km 단위로 반올림되어 로컬 서버에만 보관됩니다. 위치가 설정되면 일출이나 일몰 시각(및 전후 지정된 분 단위 오프셋)을 기준으로 자동화를 실행할 수 있습니다. 위치가 설정되지 않은 경우 일출/일몰 트리거는 동작하지 않습니다.

## 전환 전 확인

연결된 모든 가전제품의 전원을 일괄 차단하는 메인 스위치는 실수로 끄기 쉽습니다. 기기 상세 화면을 열고 **전환 전 확인**을 활성화하세요. 이후 모든 앱에서 해당 기기를 켜거나 끌 때 확인 알림창이 나타나며, 방 단위의 *전체 켜기 / 전체 끄기*, 기기 그룹, 장면(다른 장면에 포함된 중첩 장면 포함), 그리고 해당 기기를 조작하는 자동화의 수동 *실행* 시에도 똑같이 확인을 요구합니다. 이 설정은 서버에 저장되므로 웹, 데스크톱, Android 앱 전반에 걸쳐 동일하게 적용됩니다. 시스템에 의해 자동으로 실행되는 자동화는 사용자 확인 없이 규칙대로 실행되며, Domus 외부에서의 조작(제조사 전용 앱, 벽면 물리 스위치 등)은 통제하지 않습니다.

## Matter 지원 (Google Home, Apple Home, Alexa)

설정 → **Matter** (관리자 전용): 기능을 활성화하고 공유할 기기를 체크한 뒤 Google Home, Apple Home, Alexa, Home Assistant에서 QR 코드를 스캔하거나 페어링 코드를 입력합니다. 조명 기기는 컬러 조명 또는 조광 조명으로, 전원 스위치가 있는 기타 모든 기기는 스마트 플러그로 연결됩니다. 켜기/끄기, 디밍, 색상 조절이 정상 작동하며 Domus 내에서 상태를 변경하면 외부 컨트롤러에도 실시간으로 반영됩니다. "15분 동안 페어링 허용"을 통해 두 번째 스마트 홈 생태계를 추가할 수 있으며, "모든 페어링 삭제"를 누르면 새로운 코드로 초기화됩니다.

본 브리지는 공식 인증을 취득한 상태가 아니므로(Matter 테스트 인증서 사용) 추가 시 타사 앱에서 신뢰 확인 메시지를 표시합니다. 또한 Google Home의 경우 Google Home Developer Console에 브리지를 테스트 기기로 미리 등록해야 연동이 가능합니다. 세부 사항: [`development/docs/MATTER.md`](development/docs/MATTER.md).

## 기기 히스토리, 자동화 실행 로그 및 알림

- 각 기기 상세 패널의 **히스토리**: 변경 내용, 발생 시각, 조작 주체(*Ayaan 님이 변경 · Android*, *자동화 "취침 모드"*, *Matter*, *기기 자체 조작*)를 확인 가능하며 에너지 통계 내역과 동일한 기간 동안 보관됩니다.
- 각 자동화의 **실행 로그**: *실행됨*, 오류 내용이 포함된 *실패*, 또는 실행을 막은 조건을 보여주는 *건너뜀* 상태가 명확히 기록되어 "왜 동작하지 않았는지" 즉시 파악할 수 있습니다.
- 기기 상세 패널의 **켜짐 지속 알림**(30분~12시간 설정 가능): 켜진 채로 지정된 시간이 지나면 관리자에게 알림을 발송합니다. 전력 측정 기기는 10W 초과 시 켜진 것으로 판단하므로 대기 상태의 TV로 인한 오작동을 방지합니다.
- **필터 교체 사전 알림**: 공기청정기의 필터 수명이 10% 이하로 떨어지면 알림을 보냅니다.

## 날씨, 대기 전력 및 태양광 발전

- 홈 위치를 설정하면 대시보드의 실내 공기질 옆에 **실외 날씨 및 실외 PM2.5 측정값**이 표시되며 자동화 조건으로 활용할 수 있습니다(*실외 PM2.5가 35 초과로 상승할 때*, *실외 기온이 20도 미만일 때만* 등).
- 에너지 → **대기 전력**: 아무도 기기를 사용하지 않는 시간(이번 주 최저 전력 1시간) 동안 소비되는 대기 전력량과 이에 따른 월간 대기 비용을 확인합니다.
- 에너지 → *전기 요금제* → **태양광**: 태양광 발전량을 계측하는 스마트 플러그를 지정하고 넷 미터링 또는 발전차액 지원요율을 선택합니다. 이후 전기요금 청구액은 한전 등 전력망에서 수전한 전력량만을 기준으로 계산되며, "태양광" 카드에 총 발전량, 자가소비량, 송전량, 수익금이 일목요연하게 표시됩니다. 전력 흐름은 전력 측정 기기를 토대로 15분마다 정산되므로 계측기가 없는 가전제품이 있으면 계산상 송전량이 실제보다 높게 나타날 수 있습니다.

향후 로드맵 및 다이어그램: [`development/docs/ROADMAP.md`](development/docs/ROADMAP.md).

## 라이선스

Domus는 [MIT License](LICENSE)에 따라 오픈 소스로 배포됩니다. 포함된 서드파티 라이브러리는 각자의 오픈 소스 라이선스를 따르며, 각 앱의 정보 → 오픈소스 라이선스 화면에 상세히 명시되어 있습니다.

## 테스트 실행

```bash
cargo test --workspace
pnpm --filter @domus/web exec tsc -b
```

`cargo test --workspace`에는 Matter 컨트롤러를 UDP를 통해 브리지와 페어링하고 기기의 스위치, 디밍, 색상을 테스트하는 `backend/tests/matter_bridge.rs` 통합 테스트가 포함되어 있습니다(IPv4 네트워크 인터페이스 필요).
