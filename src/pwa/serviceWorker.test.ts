import { describe, it, expect } from 'vitest';
import { serviceWorkerSource } from './serviceWorker';

describe('serviceWorkerSource', () => {
  const src = serviceWorkerSource({ assets: ['index.html', '/assets/index-abc.js', 'icons/icon-192.png'], version: 'v42' });

  it('precaches the page, the bundle and the icons under a versioned cache', () => {
    expect(src).toContain("const CACHE = 'kickboxing-v42'");
    for (const a of ['"./"', '"./index.html"', '"./assets/index-abc.js"', '"./icons/icon-192.png"']) expect(src).toContain(a);
  });

  it('ignores Vary when matching (module scripts carry an Origin header)', () => {
    expect(src).toContain('ignoreVary: true');
    expect(src).toContain("headers.delete('vary')");
  });

  it('is valid JavaScript', () => {
    expect(() => new Function(src)).not.toThrow();
  });
});
