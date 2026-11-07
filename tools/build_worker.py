from pathlib import Path
import json, gzip, base64, hashlib, subprocess
root=Path(__file__).resolve().parents[1]
subprocess.run(['node',str(root/'tools/build_web_sdk.mjs')],cwd=root,check=True)
base=root/'web-preview'
assets={'/':(base/'index.html').read_text(),'/sw.js':(base/'sw.js').read_text(),'/starry-client.js':(base/'starry-client.js').read_text(),'/manifest.webmanifest':(base/'manifest.webmanifest').read_text(),'/icon.svg':(base/'icon.svg').read_text()}
raw=json.dumps(assets,ensure_ascii=False,separators=(',',':')).encode('utf-8')
b64=base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode()
style=assets['/'].split('<style>',1)[1].split('</style>',1)[0]
script=assets['/'].split('<script>',1)[1].split('</script>',1)[0]
sha=lambda x:base64.b64encode(hashlib.sha256(x.encode()).digest()).decode()
csp="default-src 'none'; script-src 'self' 'sha256-"+sha(script)+"'; style-src 'sha256-"+sha(style)+"'; connect-src 'self' https://id.starry.phd; worker-src 'self'; img-src 'self' data:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
source='''// CLOCK v1.1, standalone Starry Cloudflare Worker. Does not touch Starry ID code.
const BUNDLE = __BUNDLE__;
let assetsPromise;
async function getAssets(){
  if (!assetsPromise) assetsPromise=(async()=>{
    const bytes=Uint8Array.from(atob(BUNDLE), x=>x.charCodeAt(0));
    const body=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(body).text());
  })();
  return assetsPromise;
}
const CSP=__CSP__;
export default { async fetch(request, env){
  const path=new URL(request.url).pathname;
  // Same-origin internal Worker service binding avoids third-party workers.dev calls.
  // No API service secret or central Battery key ever reaches the browser.
  if (path.startsWith('/api/clock/')) {
    if (!env?.CLOCK_API || typeof env.CLOCK_API.fetch !== 'function')
      return Response.json({error:{code:'CLOCK_BACKEND_UNAVAILABLE',message:'Clock 電池服務尚未連線，請稍後再試。'}},{status:503,headers:{'Cache-Control':'no-store'}});
    const target=new URL(request.url);
    target.pathname=path.slice('/api/clock'.length);
    try {
      return await env.CLOCK_API.fetch(new Request(target.toString(),request));
    } catch {
      return Response.json({error:{code:'CLOCK_BACKEND_UNAVAILABLE',message:'Clock 電池服務暫時無法連線，請稍後再試。'}},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
  if (path==='/api/health') return Response.json({status:'ok',service:'clock',brand_id:'starry',app_id:'clock',version:'1.1.1'},{headers:{'Cache-Control':'no-store'}});
  if (path==='/api/starry/status') {
    try {
      const r=await fetch('https://id.starry.phd/v1/apps/clock/config',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});
      const data=r.ok?await r.json():null;
      return Response.json({app:data?.app_id==='clock'&&data.status==='active'?'active':r.status===404?'pending':'unavailable',http_status:r.status},{headers:{'Cache-Control':'no-store'}});
    } catch {return Response.json({app:'unavailable'},{headers:{'Cache-Control':'no-store'}});}
  }
  const key=(path==='/index.html'||path==='/auth/done')?'/':path;
  const assets=await getAssets();
  if (!Object.prototype.hasOwnProperty.call(assets,key)) return new Response('Not found',{status:404});
  const types={'/':'text/html; charset=utf-8','/sw.js':'text/javascript; charset=utf-8','/starry-client.js':'text/javascript; charset=utf-8','/manifest.webmanifest':'application/manifest+json; charset=utf-8','/icon.svg':'image/svg+xml; charset=utf-8'};
  const headers={'Content-Type':types[key],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  if(key==='/') headers['Content-Security-Policy']=CSP;
  if(path==='/auth/done') headers['Cache-Control']='no-store';
  if(key==='/sw.js') headers['Service-Worker-Allowed']='/';
  return new Response(assets[key],{headers});
}};
'''.replace('__BUNDLE__',json.dumps(b64)).replace('__CSP__',json.dumps(csp))
(base/'cloudflare-worker.mjs').write_text(source)
print('source chars',len(source),'gzip b64 chars',len(b64),'CSP inline verified',bool(sha(style) in csp and sha(script) in csp))
