// Serves dist/ at /Maestro-Sarrassoua/ like GitHub Pages does.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const TYPES = { '.json': 'application/json', '.mjs': 'text/javascript', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }
export function serve(root = 'dist', port = 4321) {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (!p.startsWith('/Maestro-Sarrassoua/')) { res.writeHead(404).end(); return }
    p = normalize(p.slice('/Maestro-Sarrassoua/'.length) || 'index.html')
    let file = join(root, p)
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html') } catch { file = join(root, 'index.html') }
    try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(b) } catch { res.writeHead(404).end() }
  })
  return new Promise((ok) => srv.listen(port, () => ok(srv)))
}
