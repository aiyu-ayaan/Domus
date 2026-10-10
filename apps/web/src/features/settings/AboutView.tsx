import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowSquareOut, CaretRight, GithubLogo, Globe } from '@phosphor-icons/react'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { DEVELOPER, REPO_URL, credits } from '@/lib/credits'
import { desktop } from '@/lib/api'
import { flavor } from '@/lib/flavor'

const row = 'flex min-h-12 items-center justify-between gap-3 px-4 py-2 transition-colors duration-fast hover:bg-raised'

function Ext({ href, icon, title, subtitle }: { href: string; icon?: JSX.Element; title: string; subtitle?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={row}>
      <span className="flex items-center gap-3">
        {icon}
        <span>
          <span className="block">{title}</span>
          {subtitle && <span className="block text-label text-muted">{subtitle}</span>}
        </span>
      </span>
      <ArrowSquareOut size={16} className="text-subtle" aria-hidden />
    </a>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-label text-muted hover:text-fg">
      <ArrowLeft size={14} aria-hidden /> {label}
    </Link>
  )
}

export function AboutView() {
  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader title="About Domus" description="Self-hosted home automation for Tuya, Tapo and Xiaomi devices." />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="App" />
          <div className="divide-y divide-border">
            {[
              ['Version', __APP_VERSION__],
              ['Build', String(__APP_BUILD__)],
              ['Environment', flavor === 'dev' ? 'Development' : 'Production'],
              ['Platform', desktop ? 'Desktop' : 'Web'],
              ['Privacy', 'Runs on your own server. Credentials stay encrypted there.'],
            ].map(([k, v]) => (
              <div key={k} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
                <span className="text-muted">{k}</span>
                <span className="text-right">{v}</span>
              </div>
            ))}
            <Ext href={REPO_URL} icon={<GithubLogo size={18} aria-hidden />} title="Source code" subtitle="github.com/aiyu-ayaan/Domus-Rust" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Developer" />
          <div className="flex flex-col items-center gap-1 px-4 py-6">
            <img src="/developer.jpg" alt={DEVELOPER.name} width={80} height={80} className="h-20 w-20 rounded-full border border-border object-cover" />
            <p className="mt-2 text-title font-medium">{DEVELOPER.name}</p>
            <p className="text-muted">Designed and built by one developer.</p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            <Ext href={DEVELOPER.github} icon={<GithubLogo size={18} aria-hidden />} title="GitHub" subtitle="github.com/aiyu-ayaan" />
            <Ext href={DEVELOPER.site} icon={<Globe size={18} aria-hidden />} title="Portfolio" subtitle="aiyu.co.in" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Open source" />
          <Link to="/about/acknowledgements" className={row}>
            <span>
              <span className="block">Acknowledgements</span>
              <span className="block text-label text-muted">Libraries and projects Domus is built on</span>
            </span>
            <CaretRight size={16} className="text-subtle" aria-hidden />
          </Link>
        </Card>
      </div>
    </>
  )
}

export function AcknowledgementsView() {
  return (
    <>
      <BackLink to="/about" label="About" />
      <PageHeader title="Acknowledgements" description="Domus stands on these open source projects." />
      <div className="grid max-w-2xl gap-6">
        {credits.map((g) => (
          <Card key={g.group}>
            <CardHeader title={g.group} />
            <div className="divide-y divide-border">
              {g.items.map((c) => (
                <Ext key={c.name} href={c.url} title={c.name} subtitle={c.license} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
