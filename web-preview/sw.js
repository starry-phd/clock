const CACHE='clock-web-v1-1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(res=>{if(res.ok&&url.pathname==='/')caches.open(CACHE).then(cache=>cache.put(event.request,res.clone()));return res})));
});
