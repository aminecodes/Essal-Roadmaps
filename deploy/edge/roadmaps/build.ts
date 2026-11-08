import { resolveAndParseConfig } from '@cloudflare/config'
import {
  writeRootConfig,
  writeWorkerConfig,
  getWorkerBundleDir,
} from '@cloudflare/build-output-utils'
import { mkdir } from 'node:fs/promises'
import config from './cloudflare.config'

const context = { isPreview: false, mode: 'production' }
const parsed = await resolveAndParseConfig(config, context)
if (!parsed.success) throw new Error(parsed.error.message)
const root = import.meta.dir
const bundle = getWorkerBundleDir(root)
await mkdir(bundle, { recursive: true })
const result = await Bun.build({
  entrypoints: [`${root}/index.ts`],
  outdir: bundle,
  naming: 'index.js',
  target: 'browser',
})
if (!result.success) throw new AggregateError(result.logs, 'Worker build failed')
await writeRootConfig(root, parsed.data.settings, context)
await writeWorkerConfig({
  root,
  config: parsed.data.worker,
  manifest: { type: 'complete', mainModule: 'index.js', modules: { 'index.js': { type: 'esm' } } },
})
console.log('Cloudflare build output ready')
