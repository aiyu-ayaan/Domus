import { useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Controls'
import { UpdateProgress, useDesktopUpdate } from '@/components/UpdatePrompt'
import { ReleaseNotes, useReleaseNotes } from '@/lib/releases'
import type { UpdateChannel } from '@/lib/api'
import { BackLink } from './AboutView'

const channels: { value: UpdateChannel; label: string }[] = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
  { value: 'alpha', label: 'Alpha' },
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
      <BackLink to="/settings" label="Settings" />
      <PageHeader title="Updates" description="What you are running, what is new, and where new builds come from." />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title={info ? 'Desktop app' : 'Web app'} />
          <div className="divide-y divide-border">
            <div className={line}>
              <span className="text-muted">Version</span>
              <span>
                {running} {!info && <span className="text-subtle">(build {__APP_BUILD__})</span>}
              </span>
            </div>
            {info ? (
              <>
                <div className={line}>
                  <div>
                    <p>Update channel</p>
                    <p className="text-label text-muted">Beta and Alpha get new builds earlier, and every stable one.</p>
                  </div>
                  <Segmented size="sm" label="Update channel" value={info.channel} onChange={setChannel} options={channels} />
                </div>
                <div className={line}>
                  <p>{check.isFetching ? 'Checking for updates…' : check.isError ? "Couldn't check for updates" : found ? `Domus ${found.version} is available` : 'Up to date'}</p>
                  {found ? (
                    <Button size="sm" variant="primary" loading={busy} onClick={() => install.mutate()}>
                      {info.selfInstall ? 'Update and restart' : 'Download'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={check.isFetching} onClick={() => check.refetch()}>
                      Check now
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
              <p className="px-4 py-3 text-label text-muted">This page is served by your Domus server, so it is updated together with the server. Nothing is installed in the browser.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={found ? `What's new in ${found.version}` : `In this version · ${shown}`} />
          <div className="p-4">
            {notes.data ? (
              <ReleaseNotes markdown={notes.data} />
            ) : (
              <p className="text-label text-muted">
                {notes.isPending ? 'Loading the release notes…' : notes.isError ? "Couldn't load the release notes. They need an internet connection." : 'There are no release notes for this version.'}
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
