import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    // Serve only the prototype's public assets, never source documents or Git files.
    if (!['index.html', 'styles.css', 'app.js'].includes(name)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const content = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`CampusCrew: http://127.0.0.1:${port}`));
