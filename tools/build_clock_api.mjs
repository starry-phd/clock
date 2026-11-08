/**
 * Reproducible source-only Clock API module build.
 * No network, secrets, credentials, or deploy side effects.
 *
 * node --experimental-transform-types tools/build_clock_api.mjs
 * Produces three plain JS modules for the Cloudflare Workers multipart API.
 */
import {stripTypeScriptTypes} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'services/clock-api');
const out=resolve(dir,'dist');
await mkdir(out,{recursive:true});
const sdk=await readFile(resolve(dir,'src/starry-sdk.ts'),'utf8');
const index=await readFile(resolve(dir,'src/index.mjs'),'utf8');
const routes=await readFile(resolve(dir,'src/routes.mjs'),'utf8');
const compiled=stripTypeScriptTypes(sdk,{mode:'transform'});
if(compiled.includes('private readonly')||compiled.includes('export interface')||compiled.includes(' as {'))throw Error('Starry SDK TS compilation incomplete');
const modules={
 'starry-sdk.mjs':compiled,
 'index.mjs':index.replaceAll('./starry-sdk.ts','./starry-sdk.mjs'),
 'routes.mjs':routes.replaceAll('./starry-sdk.ts','./starry-sdk.mjs')
};
for(const [name,source] of Object.entries(modules)){
 if(source.includes('./starry-sdk.ts'))throw Error('Unresolved TypeScript dependency in '+name);
 await writeFile(resolve(out,name),source);
}
console.log('Clock API source modules built: '+Object.keys(modules).join(', '));
