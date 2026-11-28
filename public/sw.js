// PACHI-TRADE PWA用 Service Worker（アプリシェルの軽量キャッシュ・外部フィード非介入）
const CACHE_NAME = 'pachi-trade-shell-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// インストール時: 基本のアプリシェルを事前キャッシュし、待機せず有効化する
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL_ASSETS.map((assetUrl) => cache.add(assetUrl)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// 有効化時: 古いバージョンのキャッシュを破棄し、既存クライアントを即座に制御する
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// リクエスト制御: 同一オリジンの静的リソースのみ対象とし、外部API（Binance等）には介入しない
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTMLページ遷移: Network-First（オンライン時は最新版を取得し、オフライン時はキャッシュ返却）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedHtml =
            (await caches.match('./index.html')) || (await caches.match('./'));
          return (
            cachedHtml ||
            new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
          );
        }),
    );
    return;
  }

  // ハッシュ付きビルド成果物（/assets/配下）: Cache-First
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // その他の同一オリジン静的ファイル: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    }),
  );
});
