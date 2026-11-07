// Network-first HTML ensures member login updates are not stuck in an old PWA cache.
const CACHE='clock-web-v20261108-shown-name';
self.addEventListener('install', event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(['/','/manifest.webmanifest','/starry-client.js'])).then(()=>self.skipWaiting())
));
self.addEventListener('activate', event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch', event=>{
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  // OAuth state/id_token never enter the offline cache; only network may serve the callback.
  if(url.pathname==='/auth/done')return;
  if(url.pathname==='/'||url.pathname==='/index.html'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/',copy)));
      }
      return response;
    }).catch(async()=>await caches.match('/')||new Response('Offline',{status:503})));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
