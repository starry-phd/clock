import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as nodeCrypto} from 'node:crypto';
import {handleClock} from '../services/clock-api/src/routes.mjs';
globalThis.crypto??=nodeCrypto;

// D1-free mock. It never calls Starry ID or writes a central member database.
function freeDb(){
 const users=new Map();
 const list=u=>users.get(u)??[];
 const db={
  users,list,
  prepare(sql){
   return {bind(...a){
    return {
     async all(){
      if(sql.includes('FROM clock_free_presets'))return {results:list(a[0]).sort((x,y)=>x.slot-y.slot).map(x=>({...x}))};
      if(sql.includes('FROM clock_presets'))return {results:[]};
      throw Error('Unexpected all SQL: '+sql);
     },
     async first(){return null},
     async run(){
      let changes=0;
      if(sql.startsWith('INSERT OR IGNORE INTO clock_free_presets')&&sql.includes('VALUES(')){
       const [u,slot,id,name,durationSeconds]=a;
       const current=list(u);
       if(!current.some(x=>x.slot===slot||x.id===id)){
        users.set(u,[...current,{slot,id,name,durationSeconds,version:1}]);changes=1;
       }
      }else if(sql.startsWith('INSERT OR IGNORE INTO clock_free_presets')&&sql.includes('SELECT')){
       const [u,id,name,durationSeconds]=a;
       const current=list(u);
       const slot=[0,1,2].find(n=>!current.some(x=>x.slot===n));
       if(slot!==undefined&&!current.some(x=>x.id===id)){
        users.set(u,[...current,{slot,id,name,durationSeconds,version:1}]);changes=1;
       }
      }else if(sql.startsWith('UPDATE clock_free_presets')){
       const [name,durationSeconds,,u,id,version]=a;
       const current=list(u),p=current.find(x=>x.id===id&&x.version===version);
       if(p){p.name=name;p.durationSeconds=durationSeconds;p.version++;changes=1;}
      }else if(sql.startsWith('DELETE FROM clock_free_presets')){
       const [u,id,version]=a;
       const current=list(u),next=current.filter(x=>x.id!==id||x.version!==version);
       if(next.length!==current.length){users.set(u,next);changes=1}
      }else throw Error('Unexpected run SQL: '+sql);
      return {meta:{changes}};
     }
    };
   }};
  }
 };
 return db;
}
const env=(db)=>({DB:db,BATTERY_CHARGES_ENABLED:'true',STARRY_BATTERY_KEY:'mock-only'});
const req=(url,method='GET',data)=>new Request('https://clock-api.example'+url,{
 method,headers:{Authorization:'Bearer fake-'+url,...(data?{'content-type':'application/json'}:{})},
 ...(data?{body:JSON.stringify(data)}:{})
});
const verify=user=>async()=>({sub:user,app_id:'clock'});
const body=async result=>{const payload=await result.json();return {...payload,status:result.status,actionStatus:payload.status};};
const seed=[
 {id:'break',name:'休息時間',durationSeconds:300},
 {id:'opening',name:'開場致詞',durationSeconds:180},
 {id:'speech',name:'主題分享',durationSeconds:1200}
];

test('free presets: first member bootstrap wins; another device reads canonical copy without charging',async()=>{
 const db=freeDb(),e=env(db),alice=verify('alice'),bob=verify('bob');
 let r=await body(await handleClock(req('/v1/presets/free/init','POST',{presets:seed}),e,alice));
 assert.equal(r.status,200);assert.deepEqual(r.presets.map(p=>p.id),seed.map(p=>p.id));
 r=await body(await handleClock(req('/v1/presets/free/init','POST',{presets:seed.map(x=>({...x,name:'裝置二覆寫'}))}),e,alice));
 assert.equal(r.status,200);assert.equal(r.presets[0].name,seed[0].name,'another device must not overwrite member slots');
 r=await body(await handleClock(req('/v1/presets/free'),e,bob));
 assert.equal(r.status,200);assert.deepEqual(r.presets,[],'different member must never see another member data');
 r=await body(await handleClock(req('/v1/presets/free/init','POST',{presets:[seed[0]]}),e,bob));
 assert.equal(r.presets.length,1);
 assert.equal(db.list('alice').length,3);
});
test('free presets: stale writes are rejected, delete and refill stay <=3, no Battery calls',async()=>{
 const db=freeDb(),e=env(db),verifyAlice=verify('alice');
 const run=(path,method,data)=>handleClock(req(path,method,data),e,verifyAlice);
 await run('/v1/presets/free/init','POST',{presets:seed});
 let r=await body(await run('/v1/presets/free/break','PATCH',{name:'新版休息',duration_seconds:420,version:1}));
 assert.equal(r.status,200);assert.equal(r.presets[0].version,2);
 r=await body(await run('/v1/presets/free/break','PATCH',{name:'舊裝置',duration_seconds:100,version:1}));
 assert.equal(r.status,409);assert.equal(r.error.code,'FREE_SLOT_CONFLICT');
 r=await body(await run('/v1/presets/free/break','DELETE',{version:1}));
 assert.equal(r.status,409);
 r=await body(await run('/v1/presets/free/break','DELETE',{version:2}));
 assert.equal(r.status,200);assert.equal(r.presets.length,2);
 r=await body(await run('/v1/presets/free','POST',{id:'newfree',name:'新用途',durationSeconds:600}));
 assert.equal(r.status,201);assert.equal(r.presets.length,3);
 r=await body(await run('/v1/presets/free','POST',{id:'overflow',name:'第四組免費?',durationSeconds:600}));
 assert.equal(r.status,409);assert.equal(r.error.code,'FREE_SLOTS_FULL');
 assert.equal(db.list('alice').length,3);
});
test('Battery charge fails closed until member has three free slots, even when pricing flag is on',async()=>{
 const db=freeDb(),e=env(db),alice=verify('alice');
 await handleClock(req('/v1/presets/free/init','POST',{presets:seed.slice(0,2)}),e,alice);
 const result=await body(await handleClock(req('/v1/presets','POST',{
  preset_id:'preset-00001',request_id:'request-00001',name:'第四組倒數',duration_seconds:300,accepted_units:2
 }),e,alice));
 assert.equal(result.status,409);
 assert.equal(result.error.code,'FREE_SLOTS_NOT_READY');
});
