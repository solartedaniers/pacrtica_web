import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('dist/seismic-console/browser');
const port = Number(process.env.PORT ?? 4300);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

async function resolveFile(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(root, safePath);
  if (!candidate.startsWith(root)) {
    return join(root, 'index.html');
  }
  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : join(root, 'index.html');
  } catch {
    return join(root, 'index.html');
  }
}

createServer(async (request, response) => {
  try {
    const file = await resolveFile(request.url ?? '/');
    const body = await readFile(file);
    response.writeHead(200, {
      ...isolationHeaders,
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(500, isolationHeaders);
    response.end();
  }
}).listen(port, () => {
  process.stdout.write(`Vista previa con COOP/COEP en http://localhost:${port}\n`);
});
