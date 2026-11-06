/**
 * 繁星電池艙 Starry Battery
 * Formal owner decision 2026-11-07: "會員共用的消費用量月額度".
 * Not limited to AI tasks. Each Starry member has their own monthly allowance,
 * shared across authorized Starry Apps. No purchase, sale, conversion or transfer.
 * Never change Starry ID database from Clock; only Clock backend can reserve/commit.
 */
export const BATTERY_DISPLAY_NAME = '繁星電池艙 Starry Battery';
export const BATTERY_DEFINITION = '會員共用的消費用量月額度';
export const FREE_PRESET_LIMIT=3;
export const MAX_PRESETS=50;
export const BATTERY_MAX_UNITS=30;

/** Initial suggestions, disabled until approved feature and backend verification. */
export const PRICE_DEFAULTS=Object.freeze([
  {feature:'clock.preset.create',label:'新增第 4 組以上的計時器',units:2,enabled:false,service:'non-ai'},
  {feature:'clock.ai.schedule',label:'AI 智慧活動流程編排',units:5,enabled:false,service:'ai'},
  {feature:'clock.ai.voice',label:'AI 語音計時提醒',units:3,enabled:false,service:'ai'},
  {feature:'clock.ai.summary',label:'AI 計時紀錄分析',units:4,enabled:false,service:'ai'},
  {feature:'clock.ai.template',label:'AI 自動生成計時範本',units:3,enabled:false,service:'ai'},
  {feature:'clock.ai.coach',label:'AI 時間管理教練',units:8,enabled:false,service:'ai'}
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
  if(count<FREE_PRESET_LIMIT)return {requiresBattery:false,units:0,feature:null,available:true};
  const p=validatePrice({...PRICE_DEFAULTS[0],...pricing,feature:'clock.preset.create'});
  if(!p.enabled)return {requiresBattery:true,units:p.units,feature:p.feature,available:false};
  return {requiresBattery:p.units>0,units:p.units,feature:p.feature,available:true};
}

/** The central task cost-per-unit must be 1. Never silently charge an unexpected amount. */
export function assertExactBatteryCost(reservation,expectedUnits){
  if(!reservation||reservation.status!=='reserved'||reservation.units!==expectedUnits||reservation.amount!==expectedUnits){
    throw new Error('battery_price_mismatch');
  }
}
