import { t } from '@/lib/i18n'
import { Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'

const Notes = lazy(() => import('@/components/ReleaseNotes'))

/** A release's notes rendered from Markdown. */
export function ReleaseNotes({ markdown }: { markdown: string }) {
  return (
    <Suspense fallback={<p className="text-label text-muted">{t('releases.loading')}</p>}>
      <Notes markdown={markdown} />
    </Suspense>
  )
}

/**
 * The Markdown notes of the GitHub release of `version`; null when that version was never released.
 * Asked of GitHub by the browser, so it also works in desktop builds that predate release notes.
 */
export const useReleaseNotes = (version: string | null | undefined) =>
  useQuery({
    queryKey: ['release-notes', version],
    enabled: !!version,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const res = await fetch(`https://api.github.com/repos/aiyu-ayaan/Domus-Rust/releases/tags/v${encodeURIComponent(version!)}`, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(t('releases.githubAnswered', { status: res.status }))
      return ((await res.json()).body as string | null)?.trim() || null
    },
  })
