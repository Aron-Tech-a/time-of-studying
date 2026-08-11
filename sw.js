// Service Worker for 番茄钟应用 PWA 支持

const CACHE_NAME = "time-of-studying-v3";
const STATIC_CACHE_URLS = [
  "/",
  "/index.html",
  // 添加应用可能需要的其他静态资源
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E⌚%3C/text%3E%3C/svg%3E",
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OWT",
];

// 安装事件 - 缓存静态资源
self.addEventListener("install", (event) => {
  console.log("Service Worker 安装中...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("缓存静态资源");
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log("静态资源缓存完成");
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener("activate", (event) => {
  console.log("Service Worker 激活中...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("删除旧缓存:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("Service Worker 激活完成");
        return self.clients.claim();
      })
  );
});

// 网络请求拦截 - 缓存优先策略
self.addEventListener("fetch", (event) => {
  // 只处理同源请求
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => {
          // 如果在缓存中找到，则返回缓存版本
          if (response) {
            return response;
          }

          // 否则，从网络获取资源
          return fetch(event.request).then((response) => {
            // 检查是否是有效响应
            if (
              !response ||
              response.status !== 200 ||
              response.type !== "basic"
            ) {
              return response;
            }

            // 克隆响应，因为响应流只能被使用一次
            const responseToCache = response.clone();

            // 将新资源添加到缓存
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return response;
          });
        })
        .catch(() => {
          // 网络请求失败，尝试返回缓存的主页
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        })
    );
  }
});

// 后台同步 - 用于在恢复网络连接时同步数据
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("执行后台同步");
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // 这里可以添加数据同步逻辑
  return Promise.resolve();
}
