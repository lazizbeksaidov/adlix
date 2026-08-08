// Minimal service worker — ilova qobig'ini keshlaydi (asosiy fayllar)
const C = 'navoiy-v67';
// DIQQAT: bu yerga ?v= bilan versiyalangan fayllarni QOʻYMANG — ular index.html'dagi joriy
// versiya bilan soʻraladi va fetch-handler (cache-first) tomonidan avtomatik keshlanadi.
// Bu yerda faqat versiyasiz (nomi oʻzgarmaydigan) qobiq fayllari.
const ASSETS = ['./', './index.html', './js/supabase.min.js', './js/qrcode.min.js',
  './js/motion.min.js', './img/logo.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache:'reload'})).filter(Boolean)).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)));
    await self.clients.claim();
    // Yangi versiya faollashdi — ochiq sahifalarni bir marta yangilab,
    // eski HTML/CSP keshidan butunlay qutqaramiz (avtomatik o'z-o'zini tuzatish)
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach(w => { try { w.navigate(w.url); } catch (e) {} });
  })());
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Supabase / Gemini so'rovlari — har doim tarmoqdan (keshlanmaydi)
  if (u.hostname.includes('supabase') || u.hostname.includes('google')) return;
  if (e.request.method !== 'GET') return;
  // HTML/navigatsiya — NETWORK-FIRST: index.html (va CSP) har doim yangi bo'lsin,
  // tarmoq bo'lmasa keshdan. Shu tufayli yangilanishlar darhol qo'llanadi.
  const isHTML = e.request.mode === 'navigate' || e.request.destination === 'document'
    || u.pathname === '/' || u.pathname.endsWith('/') || u.pathname.endsWith('.html');
  // MUHIM: faqat SOG'LOM javob keshlanadi. Aks holda bir marta tushgan 404/500 keshda
  // abadiy qolib, ilovani butunlay ishlamaydigan holatga keltiradi.
  const cacheable = resp => resp && resp.ok && resp.status === 200 && resp.type === 'basic';
  const save = (req, resp) => { if (cacheable(resp)) { const cp = resp.clone(); caches.open(C).then(c => c.put(req, cp)).catch(()=>{}); } return resp; };
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(resp => save(e.request, resp))
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // Boshqa fayllar (?v= bilan versiyalangan) — cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => save(e.request, resp))
      .catch(() => caches.match('./index.html')))
  );
});
