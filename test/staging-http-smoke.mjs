/**
 * End-to-end HTTP checks against actual Cloudflare staged + production Web.
 * Only public GETs and unauthorized negative checks. Never spends Battery.
 * The current Web Worker deliberately reports only app_id/version in /api/health;
 * the previous test relied on obsolete starry_relay/source_sha keys.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
const endpoints={
 staging:'https://clock-staging.starry-phd.workers.dev',
 production:'https://clock.starry.phd'
};
async function fetchSafe(url){
 const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 return r;
}
async function verify(name,base){
 const health=await fetchSafe(base+'/api/health');
 assert.equal(health.status,200,name+' health HTTP '+health.status);
 const details=await health.json();
 assert.equal(details.app_id,'clock',name+' app registration');
 assert.equal(details.brand_id,'starry');
 assert.equal(details.version,'1.1.1');
 const root=await fetchSafe(base+'/');
 assert.equal(root.status,200,name+' index HTTP '+root.status);
 const body=await root.text();
 for(const required of ['loginGoogle','loginApple','loginPasskey','ownerPricing',
   'id="freeReplacePanel"','id="freeReplaceSave"','shareWebSignIn',
   'syncWebSignIn','completeWebSsoCheck','signOutWebEverywhere',
   'src="/starry-client.js"']){
   assert.ok(body.includes(required),name+' missing '+required);
 }
 const csp=root.headers.get('content-security-policy')||'';
 assert.match(csp,/script-src 'self' 'sha256-/);
 assert.match(csp,/connect-src 'self' https:\/\/id\.starry\.phd/);
 assert.match(csp,/frame-ancestors 'none'/);
 assert.doesNotMatch(csp,/clock-api\.starry-phd\.workers\.dev/);
 const script=await fetchSafe(base+'/starry-client.js');
 assert.equal(script.status,200,name+' official SDK');
 const sdk=await script.text();
 for(const method of ['shareWebSignIn','syncWebSignIn','completeWebSsoCheck','signOutWebEverywhere']){
   assert.ok(sdk.includes(method),name+' missing SDK '+method);
 }
 const sw=await fetchSafe(base+'/sw.js');
 assert.equal(sw.status,200);
 const swText=await sw.text();
 assert.match(swText,/clock-web-v1-14-web-sso/);
 const done=await fetchSafe(base+'/auth/done');
 assert.equal(done.status,200);
 assert.equal(done.headers.get('cache-control'),'no-store');
 assert.equal(done.headers.get('referrer-policy'),'no-referrer');
 assert.match(await done.text(),/loginGoogle/);
 const pricingResp=await fetchSafe(base+'/api/clock/v1/pricing');
 assert.equal(pricingResp.status,200,name+' Clock API binding');
 const pricing=await pricingResp.json();
 assert.equal(pricing.free_presets,3);
 assert.equal(pricing.features.find(f=>f.feature==='clock.preset_create')?.available,false,
   'Battery must remain disabled during Web-only rollout');
 assert.equal(pricingResp.headers.get('cache-control'),'no-store');
 const anon=await fetchSafe(base+'/api/clock/v1/presets');
 assert.equal(anon.status,401,name+' must reject anonymous member data');
 const registration=await fetchSafe(base+'/api/starry/status');
 assert.equal(registration.status,200);
 assert.equal((await registration.json()).app,'active');
 return {body,csp,swText,sdk,freePresets:pricing.free_presets};
}
let stage;
test('actual Cloudflare staging Web v14: SSO assets, health, safe Battery, member isolation',async()=>{
 stage=await verify('staging',endpoints.staging);
 console.log('CLOCK_STAGING_V14_HTTP_PASS',JSON.stringify({sdk:true,charges:false,memberAuth:true}));
});
test('actual Cloudflare production Web v14 matches staging (read-only)',async()=>{
 const live=await verify('production',endpoints.production);
 const checked=stage??await verify('staging',endpoints.staging);
 assert.equal(live.body,checked.body,'production HTML differs from staging release');
 assert.equal(live.csp,checked.csp,'production CSP differs from staging');
 assert.equal(live.swText,checked.swText,'production service worker differs from staging');
 assert.equal(live.sdk,checked.sdk,'production SDK differs from staging');
 console.log('CLOCK_PRODUCTION_V14_HTTP_PASS',JSON.stringify({sdk:true,charges:false,sameBundle:true}));
});
