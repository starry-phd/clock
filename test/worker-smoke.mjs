import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
const worker=(await import('../web-preview/cloudflare-worker.mjs')).default;
const base='https://clock.starry.phd';
const get=path=>worker.fetch(new Request(base+path));
test('worker serves PWA and offline assets with strict CSP',async()=>{
  const r=await get('/');assert.equal(r.status,200);
  const html=await r.text();assert.match(html,/超大字倒數計時器/);
  const csp=r.headers.get('Content-Security-Policy');assert.ok(csp?.includes('frame-ancestors'));assert.ok(csp?.includes("worker-src 'self'"),'offline PWA Service Worker must be CSP-allowed');
  const doc=await readFile(new URL('../web-preview/index.html',import.meta.url),'utf8');
  assert.equal(html,doc,'Worker bundle must match checked-in PWA exactly');
  for (const tag of ['style','script']) {
    const payload=html.split('<'+tag+'>')[1].split('</'+tag+'>')[0];
    assert.ok(csp.includes(createHash('sha256').update(payload).digest('base64')));
  }
  const callback=await get('/auth/done');
  assert.equal(callback.status,200,'registered web callback must route to PWA');
  assert.equal(callback.headers.get('Cache-Control'),'no-store','OAuth callback must not be cached');
  assert.ok(callback.headers.get('Content-Security-Policy')?.includes('https://id.starry.phd'),'CSP must allow Starry identity API');
  assert.match(await callback.text(),/loginGoogle/,'callback serves app auth handler');
  const sw=await (await get('/sw.js')).text();
  assert.match(sw, /clock-web-v1-6-safe-replace/);
  assert.match(sw, /url\.pathname==='\/auth\/done'/);
  assert.match(sw, /fetch\(request\)/);
  for (const path of ['/manifest.webmanifest','/sw.js','/icon.svg']){
    const x=await get(path);assert.equal(x.status,200);assert.ok((await x.text()).length>100);
  }
});
test('health is public and non-membership routes do not impersonate Starry ID',async()=>{
  const r=await get('/api/health');const data=await r.json();
  assert.equal(data.status,'ok');assert.equal(data.app_id,'clock');assert.equal(data.version,'1.1.1');
  const missing=await get('/this-does-not-exist');assert.equal(missing.status,404);
});

await import('./staging-http-smoke.mjs');
