// service-worker.js
// Cache básico só para permitir instalação do PWA e funcionamento offline
// da casca do app (não faz cache de dados do Firestore, esses são sempre ao vivo).

const CACHE_NAME = "rockdog-shell-v30";
const SHELL_FILES = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./painel.js",
  "./estoque.js",
  "./cardapio.js",
  "./pedidos.js",
  "./clientes.js",
  "./fornecedores.js",
  "./relatorios.js",
  "./perfil.js",
  "./configuracoes.js",
  "./ui-dialog.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Só intercepta pedidos de mesma origem (a casca do app).
  // Chamadas ao Firebase e a bibliotecas externas (fontes, xlsx) seguem direto pra rede.
  if (
    event.request.url.includes("firestore.googleapis.com") ||
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("gstatic.com") ||
    event.request.url.includes("cdnjs.cloudflare.com")
  ) {
    return;
  }

  // Network-first: sempre tenta buscar a versão mais nova da rede primeiro
  // (e atualiza o cache com ela). Só usa o que está guardado se estiver
  // sem internet. Isso evita ficar preso numa versão antiga em cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
