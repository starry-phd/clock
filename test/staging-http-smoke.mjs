import assert from 'node:assert/strict';
const base='https://clock-staging.starry-phd.workers.dev';
async function get(path){
  const res=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(18000)});
  assert.equal(res.status,200,base+path+' HTTP '+res.status);
  return res;
}
const health=await (await get('/api/health')).json();
assert.equal(health.status,'ok');
assert.equal(health.app_id,'clock');
assert.equal(health.starry_relay,true);
assert.match(health.source_sha,/^[a-f0-9]{40}$/);
const root=await get('/');
const body=await root.text();
assert.match(body,/loginGoogle/);
assert.match(body,/loginApple/);
const csp=root.headers.get('content-security-policy')||'';
assert.match(csp,/script-src 'sha256-/);
assert.match(csp,/connect-src 'self' https:\/\/id\.starry\.phd/);
assert.match(csp,/frame-ancestors 'none'/);
const done=await get('/auth/done');
assert.match((await done.text()),/loginGoogle/);
assert.equal(done.headers.get('cache-control'),'no-store');
assert.equal(done.headers.get('referrer-policy'),'no-referrer');
assert.match(await (await get('/sw.js')).text(),/clock-web-v1-2-starry-relay/);
const registry=await (await get('/api/starry/status')).json();
assert.equal(registry.app,'active');
console.log('CLOCK_STAGING_SMOKE_PASS',JSON.stringify({sha:health.source_sha,relay:true,registry:registry.app,callback:'no-store',csp:true}));
