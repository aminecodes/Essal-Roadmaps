import type { InferEnv } from '@cloudflare/config'
import type { worker } from './cloudflare.config'

const hosts = new Set(['hub.project.essal.cloud', 'hub.talent.essal.cloud'])
async function sign(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

export default {
  async fetch(request: Request, env: InferEnv<typeof worker>): Promise<Response> {
    const url = new URL(request.url)
    const host = url.hostname
    if (!hosts.has(host)) return new Response('Not found', { status: 404 })
    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('x-quackback-customer-host', host)
    headers.set('x-quackback-customer-host-sig', await sign(env.EDGE_SECRET, `v1:${host}`))
    headers.delete('x-quackback-edge-client-ip')
    headers.delete('x-quackback-edge-client-ip-sig')
    const ip = request.headers.get('cf-connecting-ip')
    if (ip) {
      const timestamp = Math.floor(Date.now() / 1000)
      headers.set('x-quackback-edge-client-ip', ip)
      headers.set(
        'x-quackback-edge-client-ip-sig',
        `${timestamp}.${await sign(env.EDGE_SECRET, `ip-v1:${host}:${ip}:${timestamp}`)}`
      )
    }
    url.hostname = 'product.essal.cloud'
    url.protocol = 'https:'
    url.port = ''
    try {
      return await fetch(
        new Request(url, {
          method: request.method,
          headers,
          body: request.body,
          redirect: 'manual',
        })
      )
    } catch {
      console.error(JSON.stringify({ event: 'origin_unavailable', host }))
      return new Response('This product hub is temporarily unavailable.', {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      })
    }
  },
}
