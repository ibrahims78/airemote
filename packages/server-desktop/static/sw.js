// AiRemote service worker — minimal app-shell cache (v3.4.0)
const CACHE = 'airemote-v1'

self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/screen') || url.pathname.startsWith('/pty') || url.pathname.startsWith('/ssh')) return
  const cacheable = /\/assets\//.test(url.pathname) || /\.(svg|png|ico|woff2?|css|js|webmanifest)$/.test(url.pathname)
  if (!cacheable) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    try {
      const res = await fetch(req)
      if (res && res.ok) cache.put(req, res.clone())
      return res
    } catch {
      return hit || Response.error()
    }
  })())
})
