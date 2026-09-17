'use client'

import {
  ArrowLeft,
  ChevronDown,
  Clock,
  House,
  Library,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { docLabel } from '@/lib/blocks'
import { useFolds } from '@/lib/folds'
import type { Doc, Project } from '@/lib/types'
import { when } from '@/lib/when'
import AccountButton, { type Account } from './account'
import DocIcon from './doc-icon'
import DocSettings, { type DocSettingsProps } from './doc-settings'
import type { SyncState } from '@/lib/sync'

/**
 * The side menu: where you are, and everything about it.
 *
 * ## What this stopped being
 *
 * It was three lists of documents — this folder, favourites, recent — and it
 * was still, after two rounds of cutting, a column of other people's business
 * down the side of the page somebody opened to write on. Recent in particular
 * belongs on the way back in, not beside the thing you are already in: it
 * answers "what was I doing", which is a question you ask before you arrive,
 * and it is answered on the home screen where the whole collection is.
 *
 * So there are three ways out — home, the Library, search — one way onward,
 * and then the open document: what it is called, what folder it is in, what it
 * is for, and every setting it has. Nothing here is a list of things that are
 * not this document, except the handful sharing its folder.
 *
 * ## Why "Carry on" is in here
 *
 * On a phone this menu is the whole screen, so the document is behind it and
 * the way back has to be a real thing you can see rather than a cross in a
 * corner. It is the same card the home screen leads with, for the same reason:
 * the fastest route back to writing should be the largest thing on the page.
 */
export interface SideMenuProps {
  doc: Doc | null
  /** The folder it is in, or null when it is loose. */
  project: Project | null
  /** The other documents in that folder. Empty when there is no folder. */
  folderDocs: Doc[]
  projects: Project[]
  onHome: () => void
  onLibrary: () => void
  onSearch: () => void
  onNew: () => void
  onOpen: (id: string) => void
  /** Back to the document — closes this menu where it covers the page. */
  onCarryOn: () => void
  /** The cross, on a phone where this is the whole screen. */
  onClose: () => void
  /** The chevron, on a desktop where this is a column. */
  onCollapse: () => void
  theme: 'light' | 'dark' | null
  onTheme: () => void
  wide: boolean
  onWide: () => void
  /** Everything the open note's settings need. */
  settings: Omit<DocSettingsProps, 'doc' | 'projects' | 'project'>
  /*
    Signing in, and what sync is doing.

    It used to be a button in the application's header. There is no
    application header any more — a note has one bar and it belongs to the
    note — so the account lives here, with the other things that are about the
    app rather than about what is written in it.
  */
  account: Account | null
  syncState: SyncState
  onSignedIn: (account: Account) => void
  onSignedOut: () => void
  onSyncNow: () => void
}

export default function SideMenu({
  doc,
  project,
  folderDocs,
  projects,
  onHome,
  onLibrary,
  onSearch,
  onNew,
  onOpen,
  onCarryOn,
  onClose,
  onCollapse,
  theme,
  onTheme,
  wide,
  onWide,
  settings,
  account,
  syncState,
  onSignedIn,
  onSignedOut,
  onSyncNow,
}: SideMenuProps) {
  const { folded, toggle } = useFolds()
  const siblings = doc ? folderDocs.filter((item) => item.id !== doc.id) : []

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[12px] font-bold text-white">
          P
        </span>
        <span className="text-[15px] font-semibold">Pad</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:hidden"
        >
          <X size={20} />
        </button>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (Ctrl+\)"
          className="ml-auto hidden rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:block"
        >
          <PanelLeft size={16} />
        </button>
      </div>

      {/*
        The three ways out, as one row of equal things. They were a stack of
        full-width rows, which made three destinations look like three
        sections and pushed the document itself below the fold on a phone.
      */}
      <div className="flex shrink-0 items-stretch gap-1 px-2 pb-1.5">
        <Destination icon={<House size={17} />} label="Notes" onClick={onHome} />
        <Destination icon={<Library size={17} />} label="Library" onClick={onLibrary} />
        <Destination icon={<Search size={17} />} label="Search" onClick={onSearch} />
      </div>

      <div className="shrink-0 px-2 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-2 text-[14px] font-medium text-white hover:opacity-90"
        >
          <Plus size={15} /> New note
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {doc && (
          <div className="px-2 pb-1">
            <p className="px-1 pb-1 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
              Carry on
            </p>
            <button
              type="button"
              onClick={onCarryOn}
              className="group flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2.5 text-left hover:border-[var(--color-accent)]"
            >
              <DocIcon doc={doc} size={18} className="shrink-0 text-[var(--color-faint)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{docLabel(doc)}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--color-faint)]">
                  <Clock size={11} /> Edited {when(doc.updatedAt)}
                </span>
              </span>
              <ArrowLeft
                size={16}
                className="shrink-0 text-[var(--color-faint)] group-hover:text-[var(--color-accent)]"
              />
            </button>
          </div>
        )}

        {siblings.length > 0 && project && (
          <div className="mt-1 px-2">
            <button
              type="button"
              aria-expanded={!folded('side-folder')}
              onClick={() => toggle('side-folder')}
              className="flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left hover:bg-[var(--color-hover)]"
            >
              <ChevronDown
                size={13}
                className={`shrink-0 text-[var(--color-faint)] transition-transform ${
                  folded('side-folder') ? '-rotate-90' : ''
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
                {project.name || 'This folder'}
              </span>
              <span className="shrink-0 text-[12px] text-[var(--color-faint)]">
                {siblings.length}
              </span>
            </button>
            {!folded('side-folder') &&
              siblings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-doc-id={item.id}
                  onClick={() => onOpen(item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--color-hover)]"
                >
                  <DocIcon doc={item} size={14} className="shrink-0 text-[var(--color-faint)]" />
                  <span className="min-w-0 truncate text-[13px]">{docLabel(item)}</span>
                </button>
              ))}
          </div>
        )}

        {doc && <DocSettings doc={doc} projects={projects} project={project} {...settings} />}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--color-line)] px-3 py-2">
        <AccountButton
          account={account}
          syncState={syncState}
          onSignedIn={onSignedIn}
          onSignedOut={onSignedOut}
          onSyncNow={onSyncNow}
        />
        <span className="truncate text-[13px] text-[var(--color-muted)]">
          {account ? account.email : 'Not signed in'}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-[var(--color-line)] px-2 py-2">
        <button
          type="button"
          onClick={onTheme}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        {/*
          The page is a fixed measure by default, because a line that runs the
          whole width of a large monitor is genuinely hard to read. Wide is
          still one press away for anyone who wants it.
        */}
        <button
          type="button"
          onClick={onWide}
          title={wide ? 'Narrow the page for easier reading' : 'Use the full width'}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
        >
          {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {wide ? 'Narrow' : 'Wide'}
        </button>
      </div>
    </>
  )
}

/** One of the three ways out of this document. */
function Destination({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
    >
      {icon}
      <span className="text-[12px]">{label}</span>
    </button>
  )
}
