import { bindings, defineConfig, defineWorker } from '@cloudflare/config'

export const worker = defineWorker({
  name: 'essal-roadmaps-edge',
  compatibilityDate: '2026-11-08',
  entrypoint: './index.ts',
  domains: ['hub.project.essal.cloud', 'hub.talent.essal.cloud'],
  workersDev: false,
  observability: { enabled: true, redactQueryString: true, traces: { enabled: true } },
  env: { EDGE_SECRET: bindings.secret() },
})
export default defineConfig({ worker })
