// Static server for development. POST /__snap with a PNG data URL saves it to
// $SNAP_DIR/snap-<n>.png (used to inspect frames at full resolution).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +(process.argv[2] || 8642);
const snapDir = process.env.SNAP_DIR || path.join(root, 'snaps');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.a26': 'application/octet-stream', '.css': 'text/css', '.md': 'text/plain; charset=utf-8' };
let n = 0;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__snap') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      fs.mkdirSync(snapDir, { recursive: true });
      const file = path.join(snapDir, `snap-${++n}.png`);
      fs.writeFileSync(file, Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      res.end(file);
    });
    return;
  }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
