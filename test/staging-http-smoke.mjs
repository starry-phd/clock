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
assert.match(body,/ownerPricing/);
assert.match(body,/CLOCK_BACKEND/);
const csp=root.headers.get('content-security-policy')||'';
assert.match(csp,/script-src 'sha256-/);
assert.match(csp,/connect-src 'self' https:\/\/id\.starry\.phd/);
assert.match(csp,/frame-ancestors 'none'/);
const done=await get('/auth/done');
assert.match((await done.text()),/loginGoogle/);
assert.equal(done.headers.get('cache-control'),'no-store');
assert.equal(done.headers.get('referrer-policy'),'no-referrer');
assert.match(await (await get('/sw.js')).text(),/clock-web-v1-3-battery/);
const registry=await (await get('/api/starry/status')).json();
assert.equal(registry.app,'active');
console.log('CLOCK_STAGING_SMOKE_PASS',JSON.stringify({sha:health.source_sha,relay:true,registry:registry.app,callback:'no-store',csp:true}));


const liveBase='https://clock.starry.phd';
const liveHealth=await fetch(liveBase+'/api/health',{signal:AbortSignal.timeout(18000)});
assert.equal(liveHealth.status,200,'production health failed');
const liveInfo=await liveHealth.json();
assert.equal(liveInfo.starry_relay,true);
assert.match(liveInfo.source_sha,/^[a-f0-9]{40}$/);
const liveRoot=await fetch(liveBase+'/',{signal:AbortSignal.timeout(18000)});
assert.equal(liveRoot.status,200,'production app unavailable');
const liveBody=await liveRoot.text();
if(process.env.GITHUB_REF==='refs/heads/main'){
 assert.equal(liveBody,body,'production HTML must match tested staging HTML');
}
if(process.env.GITHUB_REF==='refs/heads/main')assert.equal(liveRoot.headers.get('content-security-policy'),csp,'CSP parity');
const liveCallback=await fetch(liveBase+'/auth/done',{signal:AbortSignal.timeout(18000)});
assert.equal(liveCallback.status,200);
assert.equal(liveCallback.headers.get('cache-control'),'no-store');
assert.equal(liveCallback.headers.get('referrer-policy'),'no-referrer');
const liveSW=await fetch(liveBase+'/sw.js',{signal:AbortSignal.timeout(18000)});
assert.equal(liveSW.status,200);
const liveSWText=await liveSW.text();
const stageSWText=await (await get('/sw.js')).text();
if(process.env.GITHUB_REF==='refs/heads/main')assert.equal(liveSWText,stageSWText,'production SW must match staging');
const liveRegistration=await (await fetch(liveBase+'/api/starry/status',{signal:AbortSignal.timeout(18000)})).json();
assert.equal(liveRegistration.app,'active');
console.log('CLOCK_PRODUCTION_SMOKE_PASS',JSON.stringify({sha:liveInfo.source_sha,callback:'no-store',registry:'active',assetsMatchStaging:true}));
