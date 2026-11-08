/** A database-free entry point for an operator-managed fleet. */
import { requestWorkspaceHost } from './saas-edge-host'

export function workspaceDirectory(request: Request): Response | null {
  const url = new URL(request.url)
  const host = requestWorkspaceHost(request)
  if (!process.env.QUACKBACK_DIRECTORY_HOST || host !== process.env.QUACKBACK_DIRECTORY_HOST)
    return null
  if (url.pathname.startsWith('/api/health')) return null
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  if (url.pathname !== '/') return new Response('Not found', { status: 404 })
  const apps = [
    ['Access', 'Identity and access', 'hub.access.essal.cloud'],
    ['Project', 'Projects and collaboration', 'hub.project.essal.cloud'],
    ['Talent', 'Hiring and talent', 'hub.talent.essal.cloud'],
  ]
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Essal Product Hub</title><style>body{margin:0;background:#f5f7fa;color:#172033;font:16px system-ui,sans-serif}main{max-width:960px;margin:12vh auto;padding:24px}.brand{font-weight:750;letter-spacing:.15em;color:#47645b}h1{font-size:clamp(36px,6vw,60px);letter-spacing:-.045em;margin-bottom:16px}p{color:#596579;line-height:1.7}.apps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:44px}a{display:block;background:white;border:1px solid #dde4e9;border-radius:16px;padding:28px;color:inherit;text-decoration:none}a:hover,a:focus-visible{border-color:#47645b;box-shadow:0 8px 24px #1720330c}h2{margin:0 0 10px}span{display:block;color:#47645b;margin-top:28px;font-weight:600}</style></head><body><main><div class="brand">ESSAL</div><h1>Help shape what comes next.</h1><p>Explore each product’s roadmap, share feedback, and follow the latest updates.</p><div class="apps">${apps.map(([name, description, hostname]) => `<a href="https://${hostname}/"><h2>${name}</h2><p>${description}</p><span>Open product hub &rarr;</span></a>`).join('')}</div></main></body></html>`
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    },
  })
}
