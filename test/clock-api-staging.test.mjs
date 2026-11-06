import {test} from 'node:test';
import assert from 'node:assert/strict';
const base='https://clock-api-staging.starry-phd.workers.dev';
test('Cloudflare staging Clock API has D1 pricing and no active Battery charges',async()=>{
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(12000)});
 assert.equal(health.status,200);
 const h=await health.json();
 assert.equal(h.status,'ok');
 assert.equal(h.charging_enabled,false);
 const res=await fetch(base+'/v1/pricing',{signal:AbortSignal.timeout(12000)});
 assert.equal(res.status,200);
 const pricing=await res.json();
 assert.equal(pricing.free_presets,3);
 assert.equal(pricing.features.find(x=>x.feature==='clock.preset.create')?.units,2);
 assert.equal(pricing.features.find(x=>x.feature==='clock.preset.create')?.available,false);
 const anon=await fetch(base+'/v1/presets',{signal:AbortSignal.timeout(12000)});
 assert.equal(anon.status,401);
 const crossed=await fetch(base+'/v1/pricing',{headers:{Origin:'https://unauthorized.invalid'},signal:AbortSignal.timeout(12000)});
 assert.equal(crossed.status,403);
 console.log('CLOCK_BATTERY_STAGING_PASS',JSON.stringify({db:true,ownerProtected:true,charging:false}));
});

test('Production Clock API is live but charges remain blocked',async()=>{
 const base='https://clock-api.starry-phd.workers.dev';
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(12000)});
 assert.equal(health.status,200);
 const h=await health.json();
 assert.equal(h.status,'ok');
 assert.equal(h.charging_enabled,false);
 const price=await fetch(base+'/v1/pricing',{signal:AbortSignal.timeout(12000)});
 assert.equal(price.status,200);
 const config=await price.json();
 assert.equal(config.free_presets,3);
 assert.equal(config.features.find(f=>f.feature==='clock.preset.create').available,false);
 console.log('CLOCK_BATTERY_PROD_SAFE_PASS',JSON.stringify({backend:true,charging:false}));
});
