import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Tests compile the pure, dependency-free core to temporary JS before importing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'clock-core-'));
// Resolve the project's installed TypeScript. GitHub Actions does not put tsc on PATH.
const localTsc = resolve(root, '../../apps/clock/node_modules/typescript/bin/tsc');
const args = ['--target','ES2022','--module','ES2022','--moduleResolution','node','--strict','--skipLibCheck', '--outDir',out, join(root,'src/index.ts')];
const ts = existsSync(localTsc)
  ? spawnSync(process.execPath, [localTsc, ...args], { encoding: 'utf8' })
  : spawnSync('tsc', args, { encoding: 'utf8' }); // fallback for local development
if (ts.error) throw new Error('TypeScript could not start: ' + ts.error.message + '. Run pnpm install first.');
if (ts.status !== 0) throw new Error('TypeScript compiler failed: ' + String(ts.stderr ?? '') + String(ts.stdout ?? ''));
const core = await import(pathToFileURL(join(out,'index.js')).href);
const { formatCountdown, newTimer, startTimer, pauseTimer, tickTimer, sanitizePresets } = core;
describe('clock timer engine', () => {
  it('formats 0, subminute and >hour', () => { assert.equal(formatCountdown(0),'00:00'); assert.equal(formatCountdown(59),'00:59'); assert.equal(formatCountdown(3661),'61:01'); });
  it('rings just once before the deadline and once at completion', () => {
    let t=startTimer(newTimer(60),100_000);
    let a=tickTimer(t,155_000,5); assert.equal(a.alert,true); t=a.timer;
    a=tickTimer(t,156_000,5); assert.equal(a.alert,false); t=a.timer;
    a=tickTimer(t,160_000,5); assert.equal(a.finished,true); t=a.timer;
    assert.equal(tickTimer(t,170_000,5).finished,false);
  });
  it('pauses without losing remaining time',()=>{let t=startTimer(newTimer(30),1000);t=pauseTimer(t,11_000);assert.equal(t.remainingMs,20_000);t=startTimer(t,50_000);assert.equal(tickTimer(t,60_000,3).timer.remainingMs,10_000);});
  it('clamps invalid presets and retains defaults',()=>{assert.equal(sanitizePresets([{id:'x',name:'',durationSeconds:-1}]).length,3);});
});
rmSync(out,{recursive:true,force:true});
