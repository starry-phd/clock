import {test} from 'node:test';
import assert from 'node:assert/strict';
const base='https://clock-api-staging.starry-phd.workers.dev';
test('Cloudflare staging Clock API has D1 pricing and no active Battery charges',async()=>{
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(12000)});
 assert.equal(health.status,200);
 const h=await health.json();
 assert.equal(h.status,'ok');
 assert.equal(typeof h.charging_enabled,'boolean');
 const res=await fetch(base+'/v1/pricing',{signal:AbortSignal.timeout(12000)});
 assert.equal(res.status,200);
 const pricing=await res.json();
 assert.equal(pricing.free_presets,3);
 const presetPrice=pricing.features.find(x=>x.feature==='clock.preset_create');
 assert.ok(presetPrice,'staging must expose the approved non-AI task');
 assert.ok(Number.isInteger(presetPrice.units)&&presetPrice.units>=0&&presetPrice.units<=30);
 assert.equal(presetPrice.available,Boolean(presetPrice.enabled&&(presetPrice.units===0||h.charging_enabled)));
 const anon=await fetch(base+'/v1/presets',{signal:AbortSignal.timeout(12000)});
 assert.equal(anon.status,401);
 // The new API must expose member-owned free timers, but never anonymously.
 const free=await fetch(base+'/v1/presets/free',{signal:AbortSignal.timeout(12000)});
 assert.equal(free.status,401,'staging new free-preset route requires Starry login');
 const freeInit=await fetch(base+'/v1/presets/free/init',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({presets:[]}),signal:AbortSignal.timeout(12000)
 });
 assert.equal(freeInit.status,401,'staging must check member auth before input or DB mutations');
 const admin=await fetch(base+'/v1/admin/pricing',{signal:AbortSignal.timeout(12000)});
 assert.equal(admin.status,401,'staging Owner API must reject anonymous access');
 assert.equal(h.charging_enabled,false,'staging charging stays OFF until owner verification');
 assert.equal(presetPrice.available,false,'staging price not exposed until Owner activation');
 const crossed=await fetch(base+'/v1/pricing',{headers:{Origin:'https://unauthorized.invalid'},signal:AbortSignal.timeout(12000)});
 assert.equal(crossed.status,403);
 console.log('CLOCK_BATTERY_STAGING_PASS',JSON.stringify({db:true,ownerProtected:true,charging:h.charging_enabled,price:presetPrice.units}));
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
 assert.equal(config.features.find(f=>f.feature==='clock.preset_create').available,false);
 // The new production worker now supports free-slot APIs. Authenticate before
 // disclosing member slots, editing presets, or creating a Battery reservation.
 const free=await fetch(base+'/v1/presets/free',{signal:AbortSignal.timeout(12000)});
 assert.equal(free.status,401,'production must reject anonymous reads of free slots');
 const freeInit=await fetch(base+'/v1/presets/free/init',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({presets:[]}),signal:AbortSignal.timeout(12000)
 });
 assert.equal(freeInit.status,401,'production must require login before free-slot writes');
 const admin=await fetch(base+'/v1/admin/pricing',{signal:AbortSignal.timeout(12000)});
 assert.equal(admin.status,401,'production pricing must be Owner-protected');
 console.log('CLOCK_BATTERY_PROD_SAFE_PASS',JSON.stringify({backend:true,freeSync:true,charging:false}));
});
