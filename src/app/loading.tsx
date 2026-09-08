import { PageLoading } from '@/components/page-loading'

/**
 * What every page shows while it is being fetched.
 *
 * At the root of the app, so it covers any route that does not name its own —
 * including ones added later. Next renders it the instant a navigation starts,
 * before the server has answered, which is the difference between a tap that
 * visibly did something and a tap that did nothing for a second and got tapped
 * again.
 */
export default function Loading() {
  return <PageLoading />
}
