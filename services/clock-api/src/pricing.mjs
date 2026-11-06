// Product policy: every cost is server-side, never trusted from the client.
// Starry ID currently describes Battery as AI allowance; non-AI charges
// require an explicit clock.preset.create task type / owner policy approval.
export const FREE_PRESET_LIMIT=3;
export const MAX_PRESETS=50;
export const BATTERY_MAX_UNITS=30;
export const PRICE_DEFAULTS=Object.freeze([
  {feature:'clock.preset.create',label:'超過 3 組後新增計時器',units:2,enabled:false,requiresAi:false},
  {feature:'clock.ai.schedule',label:'AI 智慧活動流程編排',units:5,enabled:false,requiresAi:true},
  {feature:'clock.ai.voice',label:'AI 語音計時提醒',units:3,enabled:false,requiresAi:true},
  {feature:'clock.ai.summary',label:'AI 計時紀錄分析',units:4,enabled:false,requiresAi:true},
  {feature:'clock.ai.template',label:'AI 自動生成計時範本',units:3,enabled:false,requiresAi:true},
  {feature:'clock.ai.coach',label:'AI 時間管理教練',units:8,enabled:false,requiresAi:true}
]);
export function validatePrice(entry) {
  if(!entry||typeof entry!=='object')throw new Error('invalid_price');
  const original=PRICE_DEFAULTS.find(f=>f.feature===entry.feature);
  if(!original)throw new Error('unsupported_feature');
  if(!Number.isInteger(entry.units)||entry.units<0||entry.units>BATTERY_MAX_UNITS)throw new Error('invalid_units');
  if(typeof entry.enabled!=='boolean')throw new Error('invalid_enabled');
  return {...original,units:entry.units,enabled:entry.enabled};
}
export function computePresetCharge(count,pricing) {
  if(!Number.isInteger(count)||count<0||count>MAX_PRESETS)throw new Error('invalid_preset_count');
  if(count>=MAX_PRESETS)throw new Error('preset_limit_reached');
  if(count<FREE_PRESET_LIMIT)return {requiresBattery:false,units:0,feature:null};
  const p=validatePrice({...PRICE_DEFAULTS[0],...pricing,feature:'clock.preset.create'});
  if(!p.enabled) return {requiresBattery:true,units:p.units,feature:p.feature,available:false};
  return {requiresBattery:p.units>0,units:p.units,feature:p.feature,available:true};
}
