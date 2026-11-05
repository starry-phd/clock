from pathlib import Path
import json, gzip, base64, hashlib
base=Path(__file__).resolve().parents[1] / "web-preview"
assets={'/':(base/'index.html').read_text(),'/sw.js':(base/'sw.js').read_text(),'/manifest.webmanifest':(base/'manifest.webmanifest').read_text(),'/icon.svg':(base/'icon.svg').read_text()}
raw=json.dumps(assets,ensure_ascii=False,separators=(',',':')).encode('utf-8')
b64=base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode()
style=assets['/'].split('<style>',1)[1].split('</style>',1)[0]
script=assets['/'].split('<script>',1)[1].split('</script>',1)[0]
sha=lambda x:base64.b64encode(hashlib.sha256(x.encode()).digest()).decode()
csp="default-src 'none'; script-src 'sha256-"+sha(script)+"'; style-src 'sha256-"+sha(style)+"'; connect-src 'self'; worker-src 'self'; img-src 'self' data:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
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
export default { async fetch(request){
  const path=new URL(request.url).pathname;
  if (path==='/api/health') return Response.json({status:'ok',service:'clock',brand_id:'starry',app_id:'clock',version:'1.1.1'},{headers:{'Cache-Control':'no-store'}});
  if (path==='/api/starry/status') {
    try {
      const r=await fetch('https://id.starry.phd/v1/apps/clock/config',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});
      return Response.json({app:r.ok?'active':r.status===404?'pending':'unavailable',http_status:r.status},{headers:{'Cache-Control':'no-store'}});
    } catch {return Response.json({app:'unavailable'},{headers:{'Cache-Control':'no-store'}});}
  }
  const key=path==='/index.html'?'/':path;
  const assets=await getAssets();
  if (!Object.prototype.hasOwnProperty.call(assets,key)) return new Response('Not found',{status:404});
  const types={'/':'text/html; charset=utf-8','/sw.js':'text/javascript; charset=utf-8','/manifest.webmanifest':'application/manifest+json; charset=utf-8','/icon.svg':'image/svg+xml; charset=utf-8'};
  const headers={'Content-Type':types[key],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  if(key==='/') headers['Content-Security-Policy']=CSP;
  if(key==='/sw.js') headers['Service-Worker-Allowed']='/';
  return new Response(assets[key],{headers});
}};
'''.replace('__BUNDLE__',json.dumps(b64)).replace('__CSP__',json.dumps(csp))
(base/'cloudflare-worker.mjs').write_text(source)
print('source chars',len(source),'gzip b64 chars',len(b64),'CSP inline verified',bool(sha(style) in csp and sha(script) in csp))
