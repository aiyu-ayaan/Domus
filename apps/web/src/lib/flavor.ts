export type AppFlavor = 'dev' | 'prod'

interface DesktopBridgeLike {
  flavor?: AppFlavor
}

function detectFlavor(): AppFlavor {
  const envFlavor = import.meta.env.VITE_APP_FLAVOR
  if (envFlavor === 'dev' || envFlavor === 'prod') return envFlavor
  if (typeof window !== 'undefined') {
    const desktop = (window as unknown as { docus?: DesktopBridgeLike }).docus
    if (desktop?.flavor === 'dev' || desktop?.flavor === 'prod') return desktop.flavor
  }
  return import.meta.env.DEV ? 'dev' : 'prod'
}

export const flavor: AppFlavor = detectFlavor()
export const isDevFlavor: boolean = flavor === 'dev'
export const appName: string = isDevFlavor ? 'Docus (Dev)' : 'Docus'

/**
 * Prefix storage key with flavor when in dev, ensuring dev credentials
 * and local preferences never clobber production storage.
 */
export function getStorageKey(baseKey: string): string {
  if (isDevFlavor) {
    if (baseKey.startsWith('docus.')) {
      return baseKey.replace(/^docus\./, 'docus.dev.')
    }
    return `docus.dev.${baseKey}`
  }
  return baseKey
}

/**
 * Configure document head (title, favicon, webmanifest) according to current flavor.
 */
export function applyFlavorHead() {
  if (typeof document === 'undefined') return

  if (isDevFlavor) {
    if (!document.title.includes('(Dev)')) {
      document.title = `${document.title || 'Docus'} (Dev)`
    }

    const iconLink = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (iconLink) {
      iconLink.href = '/favicon-dev.svg'
    }

    const manifestLink = document.querySelector<HTMLLinkElement>("link[rel='manifest']")
    if (manifestLink) {
      manifestLink.href = '/manifest.dev.webmanifest'
    }
  }
}
