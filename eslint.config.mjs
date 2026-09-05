import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// eslint-config-next ships flat config directly in Next 16 — no FlatCompat.
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
]

export default config
