import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeDollarSign,
  ExternalLink,
  FileCode2,
  Info,
  Scale,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const SOURCE_URL = 'https://github.com/ZenovaZeni/pokedokiedex'

function LegalCard({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-border bg-bg-card/80 p-5 backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-bg-primary text-brand-red">
          <Icon size={20} />
        </span>
        <h2 className="text-lg font-black text-text-primary">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-6 text-text-secondary">
        {children}
      </div>
    </section>
  )
}

function SourceLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand-red transition-opacity hover:opacity-80"
    >
      {children}
      <ExternalLink size={14} />
    </a>
  )
}

export default function AboutLegal() {
  const { user, multiUser } = useAuth()
  const backTo = user || !multiUser ? '/dashboard' : '/login'
  const backLabel = user || !multiUser ? 'Back to dashboard' : 'Back to sign in'

  return (
    <main className="min-h-dvh bg-bg-primary px-4 py-5 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            to={backTo}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card/70 px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={18} />
            {backLabel}
          </Link>
          <SourceLink href={SOURCE_URL}>Source code</SourceLink>
        </header>

        <section className="rounded-[1.5rem] border border-border bg-bg-surface/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-red/30 bg-brand-red/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-red">
              <Scale size={14} />
              About / Legal
            </div>
            <h1 className="text-3xl font-black leading-tight sm:text-5xl">
              PokeDokieDex is an unofficial collector tool.
            </h1>
            <p className="text-base leading-7 text-text-secondary sm:text-lg">
              This page explains the source license, brand relationship, data sources, and pricing limits so collectors know what the app is and what it is not.
            </p>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <LegalCard icon={ShieldAlert} title="Unofficial Pokemon TCG tool">
            <p>
              PokeDokieDex is an independent collector app. It is not affiliated with, endorsed by, sponsored by, or approved by Nintendo, Creatures Inc., GAME FREAK inc., The Pokemon Company, or The Pokemon Company International.
            </p>
            <p>
              Pokemon, Pokemon character names, card art, logos, and related marks belong to their respective owners.
            </p>
          </LegalCard>

          <LegalCard icon={FileCode2} title="Open source license">
            <p>
              The application code is distributed under the GNU Affero General Public License v3.0 (AGPLv3). You can inspect the current source at{' '}
              <SourceLink href={SOURCE_URL}>github.com/ZenovaZeni/pokedokiedex</SourceLink>.
            </p>
            <p>
              AGPLv3 allows commercial use, modification, and network hosting, but modified versions made available to users over a network must also provide the corresponding source code under the same license terms.
            </p>
          </LegalCard>

          <LegalCard icon={BadgeDollarSign} title="Prices are estimates">
            <p>
              Collection values are market estimates for convenience. They are not financial advice, appraisals, guaranteed sale prices, or promises that a card can be bought or sold for a displayed value.
            </p>
            <p>
              Real value depends on condition, variant, grading, language, print run, seller fees, shipping, taxes, and current buyer demand. Confirm important prices with marketplace listings before buying or selling.
            </p>
          </LegalCard>

          <LegalCard icon={Info} title="Data sources">
            <p>
              Card data, images, and available market price fields are provided through{' '}
              <SourceLink href="https://tcgdex.dev">TCGdex</SourceLink>, which references marketplace data such as TCGPlayer and Cardmarket where available.
            </p>
            <p>
              Some cards may have missing, delayed, or imperfectly matched pricing data. The app should be treated as a collection tracker first and a pricing guide second.
            </p>
          </LegalCard>
        </div>

        <section className="rounded-2xl border border-border bg-bg-card/70 p-5 text-sm leading-6 text-text-muted">
          <p>
            This page is informational and is not legal, tax, financial, or investment advice. For commercial use, trademark questions, or marketplace data rights, talk with a qualified professional and review each provider's terms.
          </p>
        </section>
      </div>
    </main>
  )
}
