import { CreateForm } from './create-form'

export const metadata = { title: 'Create a pursuit' }

export default async function NewPursuit(props: PageProps<'/pursuits/new'>) {
  const params = await props.searchParams
  const title = typeof params.title === 'string' ? params.title : ''

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
        Create a pursuit
      </h1>
      <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
        Name an outcome, then lay out the stages people pass through on the way to it. The stages
        are what let everyone see who is ahead of them and who they can help.
      </p>

      <div className="mt-7">
        <CreateForm initialTitle={title} />
      </div>
    </div>
  )
}
