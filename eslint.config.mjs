import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// eslint-config-next ships native flat config from v16, so it is spread in
// directly. The FlatCompat shim is for the old .eslintrc format and throws on
// these.
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/sw.js'],
  },
]

export default config
