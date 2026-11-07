/**
 * Build the unmodified official StarryClient TypeScript as a browser global.
 * No third-party runtime or network dependency; TypeScript is already a
 * development dependency of apps/clock. Called before the Cloudflare bundle.
 */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(root,'apps/clock/package.json'));
const ts=require('typescript');
const src=readFileSync(resolve(root,'apps/clock/src/auth/starry-client.ts'),'utf8');
if(!src.includes('export class StarryClient')||!src.includes('syncDeviceSignIn()'))
 throw new Error('Starry ID official SDK missing required Device SSO');
if(/^\s*import\s/m.test(src))throw new Error('Bundling external SDK imports is not permitted');
const built=ts.transpileModule(src,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,removeComments:false}
});
if(built.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))
 throw new Error('Official SDK transpilation failed');
const output='(function(global){\n"use strict";\nconst exports={};\n'+built.outputText+
 '\nglobal.StarrySDK=exports;\n})(globalThis);\n';
writeFileSync(resolve(root,'web-preview/starry-client.js'),output,'utf8');
console.log('Official StarryClient Web module built; sha256='+createHash('sha256').update(output).digest('hex'));
