import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [native,web,guide,backend]=await Promise.all([
 read('apps/clock/src/auth/StarryAccountPanel.tsx'),
 read('web-preview/index.html'),
 read('AGENTS.md'),
 read('services/clock-api/src/index.mjs')
]);
const officialName='繁星電池艙 Starry Battery';
const officialDefinition='會員共用的消費用量月額度';
test('native and web use the latest owner-approved Battery name and monthly consumption definition',()=>{
 for(const [platform,code] of [['Expo',native],['Web',web]]){
  assert.ok(code.includes(officialName),platform+' is missing official name');
  assert.ok(code.includes(officialDefinition),platform+' is missing owner definition');
  assert.ok(code.includes('AI 與非 AI'),platform+' must recognize non-AI uses');
  assert.ok(code.includes('每月 1 日'),platform+' must show monthly reset');
 }
 assert.ok(guide.includes(officialName)&&guide.includes(officialDefinition));
});
test('both platforms show the same authorized member balance fields without client-side deduction',()=>{
 assert.ok(native.includes('readBattery(token)'), 'native missing Starry member Battery GET');
 assert.ok(web.includes("starryReq('/v1/me/battery'"), 'web missing member Battery GET');
 for(const key of ['allowance','used','reserved','remaining','period']){
  assert.ok(native.includes('bal.'+key),'native missing '+key);
  assert.ok(web.includes('bal.'+key),'web missing '+key);
 }
 assert.doesNotMatch(native,/x-starry-app-key|STARRY_BATTERY_KEY/);
 assert.doesNotMatch(web,/x-starry-app-key|STARRY_BATTERY_KEY/);
 assert.ok(backend.includes("taskType='clock.ai'"));
 assert.ok(backend.includes("clock.preset_create"),'non-AI task type must be handled distinctly');
});
