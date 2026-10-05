const CACHE='stars-shell-1.1'
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/app-icon.svg']))))
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('stars-shell-')&&key!==CACHE).map(key=>caches.delete(key))))))
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')))
  else if(url.pathname==='/app-icon.svg')event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))
})
