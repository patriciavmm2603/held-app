const CACHE_NAME="held-v25";
const CORE_ASSETS=["./","./index.html","./manifest.webmanifest","./assets/held-app-icon.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET" || new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data?.url||new URL("./#together",self.location.href).href;
  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
      const existing=windows.find(client=>client.url.startsWith(self.location.origin));
      if(existing){existing.navigate(target);return existing.focus();}
      return clients.openWindow(target);
    })
  );
});


self.addEventListener("push",event=>{
  let message={};
  try{message=event.data?.json()||{};}catch{message={};}
  const destination=new URL(message.url||"./#together",self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(message.title||"New prayer request in Held",{
      body:message.body||"Your spouse sent you a prayer request.",
      icon:"assets/held-app-icon.png",
      badge:"assets/held-app-icon.png",
      tag:message.requestId?"held-prayer-"+message.requestId:"held-prayer",
      renotify:true,
      data:{url:destination}
    })
  );
});
