import Workspace from '@/components/workspace'

/**
 * The whole app is one route. There is no document-per-URL scheme because
 * switching documents must not be a navigation: a navigation means a render
 * pass and a flash of empty page between two things the user thinks of as
 * already open. Documents switch in memory, instantly.
 */
export default function Page() {
  return <Workspace />
}
