import { useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Controls'
import { UpdateProgress, useDesktopUpdate } from '@/components/UpdatePrompt'
import { ReleaseNotes, useReleaseNotes } from '@/lib/releases'
import type { UpdateChannel } from '@/lib/api'
import { t } from '@/lib/i18n'
import { BackLink } from './AboutView'

const channels: { value: UpdateChannel; label: string }[] = [
  { value: 'stable', label: t('updates.channel.stable') },
  { value: 'beta', label: t('updates.channel.beta') },
  { value: 'alpha', label: t('updates.channel.alpha') },
]

const line = 'flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-2'

/**
 * Settings > Updates. In the desktop app: its version, channel, the update and the download. In a browser
 * the page comes from the server, so there is nothing to install and it shows the version's notes.
 * The notes are those of the update when there is one, otherwise those of the running version.
 */
export function UpdatesView() {
  const qc = useQueryClient()
  const { updates, info, check, install, progress, busy } = useDesktopUpdate()
  const found = check.data
  const running = info?.version ?? __APP_VERSION__
  const shown = found?.version ?? running
  const notes = useReleaseNotes(shown)
  const setChannel = async (channel: UpdateChannel) => {
    await updates!.setChannel(channel)
    qc.invalidateQueries({ queryKey: ['desktop-update-info'] })
  }
  return (
    <>
      <BackLink to="/settings" label={t('settings.title')} />
      <PageHeader title={t('settings.updates')} description={t('updates.description')} />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title={info ? t('settings.desktopApp') : t('updates.webApp')} />
          <div className="divide-y divide-border">
            <div className={line}>
              <span className="text-muted">{t('settings.version')}</span>
              <span>
                {running} {!info && <span className="text-subtle">{t('settings.build', { build: __APP_BUILD__ })}</span>}
              </span>
            </div>
            {info ? (
              <>
                <div className={line}>
                  <div>
                    <p>{t('updates.channel')}</p>
                    <p className="text-label text-muted">{t('updates.channelHint')}</p>
                  </div>
                  <Segmented size="sm" label={t('updates.channel')} value={info.channel} onChange={setChannel} options={channels} />
                </div>
                <div className={line}>
                  <p>{check.isFetching ? t('updates.checking') : check.isError ? t('updates.checkFailed') : found ? t('update.available', { version: found.version }) : t('updates.upToDate')}</p>
                  {found ? (
                    <Button size="sm" variant="primary" loading={busy} onClick={() => install.mutate()}>
                      {info.selfInstall ? t('update.restart') : t('update.download')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={check.isFetching} onClick={() => check.refetch()}>
                      {t('updates.checkNow')}
                    </Button>
                  )}
                  {progress !== null && (
                    <div className="w-full">
                      <UpdateProgress value={progress} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="px-4 py-3 text-label text-muted">{t('updates.webExplain')}</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={found ? t('updates.whatsNew', { version: found.version }) : t('updates.inVersion', { version: shown })} />
          <div className="p-4">
            {notes.data ? (
              <ReleaseNotes markdown={notes.data} />
            ) : (
              <p className="text-label text-muted">
                {notes.isPending ? t('releases.loading') : notes.isError ? t('releases.loadFailed') : t('releases.empty')}
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
