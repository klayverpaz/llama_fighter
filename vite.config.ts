import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serviceWorkerSource } from './src/pwa/serviceWorker';

/** Every file under public/ (copied as-is into the build), relative to it. */
function publicFiles(dir = 'public'): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out;
}

/** Emits sw.js listing every built file, so the installed app works offline. */
function offlinePwa(): Plugin {
  return {
    name: 'offline-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      // index.html is emitted by Vite after this hook runs, so it's listed explicitly.
      const assets = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles()])].filter((f) => f !== 'sw.js').sort();
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource({ assets, version }) });
    },
  };
}

export default defineConfig({
  // Relative paths: the build works from any folder or host (and from the home-screen app).
  base: './',
  server: { open: false },
  // Allow the build to be served through a tunnel (Cloudflare quick tunnels have no interstitial page,
  // which Android needs to install the app; ngrok's free tier shows one).
  preview: { allowedHosts: ['.trycloudflare.com', '.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'] },
  plugins: [offlinePwa()],
});
