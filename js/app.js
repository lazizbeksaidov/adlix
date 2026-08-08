/* ============ Navoiy viloyati yuridik xizmat markazlari — SPA ============ */
(function () {
  'use strict';

  /* ============================================================
     AUTH BOOTSTRAP — Supabase sozlangan bo'lsa, avval kirish darvozasi
     ============================================================ */
  const CFG = window.AUTH_CONFIG || {};

  /* Splash kirish ekrani — darhol boshqariladi (gate'dan mustaqil) */
  const splash = document.getElementById('splash');
  if (sessionStorage.getItem('splashed')) {
    splash.style.display = 'none';
  } else {
    setTimeout(() => {
      splash.classList.add('done');
      try { sessionStorage.setItem('splashed', '1'); } catch (e) {}
      setTimeout(() => splash.remove(), 800);
    }, 1450);
  }

  const gate = document.getElementById('authGate');
  const gateForm = document.getElementById('authForm');
  const gateErr = document.getElementById('authErr');
  const gateBtn = document.getElementById('authBtn');
  const gateCard = document.querySelector('.ag-card');

  document.getElementById('authEye').addEventListener('click', () => {
    const p = document.getElementById('authPass');
    p.type = p.type === 'password' ? 'text' : 'password';
  });

  function gateShow() { gate.hidden = false; }
  function gateHide() {
    gate.classList.add('done');
    setTimeout(() => gate.remove(), 800);
  }
  function gateError(msg) {
    gateErr.textContent = msg;
    gateErr.hidden = false;
    gateCard.classList.remove('shake');
    void gateCard.offsetWidth;
    gateCard.classList.add('shake');
  }
  function gateBusy(b) {
    gateBtn.disabled = b;
    gateBtn.querySelector('.ag-btn-txt').hidden = b;
    gateBtn.querySelector('.ag-spin').hidden = !b;
  }

  function bootstrap() {
    const demo = new URLSearchParams(location.search).has('demoAuth');

    if (!CFG.url || !CFG.anonKey) {
      // Supabase hali ulanmagan — ochiq rejim (demo bayrog'i bilan darvozani ko'rish mumkin)
      if (demo) {
        gateShow();
        gateForm.addEventListener('submit', e => {
          e.preventDefault();
          gateBusy(true);
          setTimeout(() => { gateHide(); initApp(null); }, 900);
        });
      } else {
        initApp(null);
      }
      return;
    }

    const client = window.supabase.createClient(CFG.url, CFG.anonKey);

    async function loadAndStart() {
      const { data: row, error } = await client.from('site_data').select('data').eq('id', 1).single();
      if (error || !row) { gateShow(); gateError('Maʼlumotni yuklashda xatolik. Qayta urinib koʻring.'); gateBusy(false); return; }
      let profile = null;
      try {
        const { data: u } = await client.auth.getUser();
        const { data: p } = await client.from('profiles').select('*').eq('user_id', u.user.id).single();
        profile = p;
      } catch (e) {}
      window.SITE_DATA = row.data;
      gateHide();
      initApp({ client, profile });
    }

    client.auth.getSession().then(({ data }) => {
      if (data.session) loadAndStart();
      else gateShow();
    });

    gateForm.addEventListener('submit', async e => {
      e.preventDefault();
      gateErr.hidden = true;
      gateBusy(true);
      const login = document.getElementById('authLogin').value.trim().toLowerCase();
      const pass = document.getElementById('authPass').value;
      const { error } = await client.auth.signInWithPassword({
        email: login.includes('@') ? login : login + '@navoiy-adliya.uz',
        password: pass
      });
      if (error) {
        gateBusy(false);
        gateError('Login yoki parol notoʻgʻri');
        return;
      }
      loadAndStart();
    });
  }

  /* ============================================================
     ASOSIY ILOVA
     ============================================================ */
  function initApp(authCtx) {

  const DATA = window.SITE_DATA;
  const app = document.getElementById('app');
  const navEl = document.getElementById('districtNav');
  const searchInput = document.getElementById('globalSearch');

  // Server rejimida tahrirlarni umumiy bazaga yozish (e'lon ham saqlanadi)
  /* ---------- (6) Audit jurnali — superadmin tahrirlarini snapshotga nisbatan qayd etish ---------- */
  let editSnap = null;
  function telStrC(p) { return ((p && p.tel) || []).filter(Boolean).join(', '); }
  // Tashkilot/xodimlarni INDEKS emas, NOM boʻyicha juftlaydi (server staff-edit bilan bir xil mantiq).
  // Aks holda oʻrtadan bittasi oʻchirilsa keyingi hammasi "oʻzgargan" boʻlib koʻrinib, jurnal soxta yozuvlarga toʻlardi.
  // Takroriy nom (masalan 2 ta "1-DMTT") uchun kalitga tartib raqami qoʻshiladi — toʻqnashuv boʻlmaydi.
  function pairByKey(arr, keyOf) {
    const m = new Map(), seen = new Map();
    (arr || []).forEach(it => {
      if (!it) return;
      const base = String(keyOf(it) ?? '');
      const n = (seen.get(base) || 0) + 1; seen.set(base, n);
      m.set(base + '#' + n, it);
    });
    return m;
  }
  function diffDistrictsClient(oldArr, newArr, login) {
    const rows = []; const ROLES = [['r', 'Rahbar'], ['k', 'Kadrlar'], ['b', 'Buxgalter']];
    (newArr || []).forEach(nd => {
      const od = (oldArr || []).find(x => x.id === nd.id); if (!od) return;
      const dn = nd.name;
      // --- Tashkilotlar (nom boʻyicha) ---
      const oMap = pairByKey(od.orgs, o => o.org), nMap = pairByKey(nd.orgs, o => o.org);
      nMap.forEach((nw, k) => {
        const o = oMap.get(k);
        if (!o) { rows.push({ login, district: dn, kind: 'org-add', ref: nw.org, field: 'tashkilot', old_val: '', new_val: nw.org }); return; }
        ROLES.forEach(([role, lbl]) => {
          const op = o[role] || {}, np = nw[role] || {};
          if ((op.fio || '') !== (np.fio || '')) rows.push({ login, district: dn, kind: 'org', ref: nw.org, field: lbl + ' F.I.O.', old_val: op.fio || '', new_val: np.fio || '' });
          if (telStrC(op) !== telStrC(np)) rows.push({ login, district: dn, kind: 'org', ref: nw.org, field: lbl + ' telefon', old_val: telStrC(op), new_val: telStrC(np) });
        });
      });
      oMap.forEach((o, k) => { if (!nMap.has(k)) rows.push({ login, district: dn, kind: 'org-del', ref: o.org, field: 'tashkilot', old_val: o.org, new_val: '' }); });
      // --- Markaz xodimlari (F.I.O. boʻyicha) ---
      const oS = pairByKey(od.markaz, s => s.fio), nS = pairByKey(nd.markaz, s => s.fio);
      nS.forEach((nw, k) => {
        const o = oS.get(k);
        if (!o) { rows.push({ login, district: dn, kind: 'staff-add', ref: nw.fio, field: 'markaz xodimi', old_val: '', new_val: nw.fio }); return; }
        if (telStrC(o) !== telStrC(nw)) rows.push({ login, district: dn, kind: 'staff', ref: nw.fio, field: 'markaz telefon', old_val: telStrC(o), new_val: telStrC(nw) });
        if ((o.tug || '') !== (nw.tug || '')) rows.push({ login, district: dn, kind: 'staff', ref: nw.fio, field: 'tugʻilgan sana', old_val: o.tug || '', new_val: nw.tug || '' });
      });
      oS.forEach((o, k) => { if (!nS.has(k)) rows.push({ login, district: dn, kind: 'staff-del', ref: o.fio, field: 'markaz xodimi', old_val: o.fio, new_val: '' }); });
    });
    if (rows.length > 300) { // kesilganini yashirmaymiz — jurnalda belgi qoladi
      const extra = rows.length - 299;
      return rows.slice(0, 299).concat([{ login, district: '—', kind: 'org', ref: '—', field: 'DIQQAT', old_val: '', new_val: `yana ${extra} ta oʻzgarish jurnalga sigʻmadi` }]);
    }
    return rows;
  }
  async function logEdits() {
    if (!(authCtx && authCtx.profile && authCtx.profile.is_admin)) return; // staff tahrirlari serverda (staff-edit) qayd etiladi
    if (!editSnap) { editSnap = JSON.parse(JSON.stringify(DATA.districts)); return; }
    const rows = diffDistrictsClient(editSnap, DATA.districts, authCtx.profile.login || 'admin');
    editSnap = JSON.parse(JSON.stringify(DATA.districts));
    if (rows.length) { try { await authCtx.client.from('edit_log').insert(rows); } catch (_) {} }
  }

  // _bilan boshlanuvchi xizmat maydonlarini olib tashlab chuqur nusxa
  const stripD = o => JSON.parse(JSON.stringify(o ?? null, (k, v) => k.startsWith('_') ? undefined : v));

  // Server rejimida tahrirlarni umumiy bazaga yozish (e'lon ham saqlanadi).
  // MUHIM (lost-update himoyasi): butun bazani koʻr-koʻrona yozmaymiz — avval serverdagi
  // yangi nusxani oʻqib, faqat admin OʻZGARTIRGAN qismlarni ustiga qoʻyamiz.
  // Aks holda admin tabi ochiq turgan paytdagi xodim tahrirlari oʻchib ketardi.
  async function pushData() {
    if (!authCtx) return;
    busyOps++; // saqlash davomida refreshData DATA'ni almashtirmasin
    try {
      const mine = stripD({ districts: DATA.districts, announcement: DATA.announcement || null, buyruqlar: DATA.buyruqlar || null, templates: DATA.templates || null });
      // OPTIMISTIK QULF + RETRY. MUHIM: serverdagi joriy holatni oʻqib boʻlmasa HECH QACHON yozmaymiz —
      // aks holda adminning eskirgan nusxasi butun baza ustiga qulfsiz yozilib, xodim tahrirlari yoʻqoladi.
      let readFail = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: row, error: readErr } = await authCtx.client.from('site_data').select('data,updated_at').eq('id', 1).single();
        if (readErr || !row || !row.data || !Array.isArray(row.data.districts)) {
          readFail = true; // oʻqish muvaffaqiyatsiz — kutib qayta urinamiz, USTIGA YOZMAYMIZ
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
          continue;
        }
        readFail = false;
        const merged = row.data, oldTs = row.updated_at;
        // Hududlar: faqat boshlangʻich nusxaga nisbatan oʻzgarganlari yoziladi, qolganlari serverdagicha qoladi
        mine.districts.forEach(md => {
          const base = (baseSnap.districts || []).find(x => x.id === md.id);
          const fi = merged.districts.findIndex(x => x.id === md.id);
          const changed = !base || JSON.stringify(base) !== JSON.stringify(md);
          if (fi < 0) merged.districts.push(md);
          else if (changed) merged.districts[fi] = md;
        });
        ['announcement', 'buyruqlar', 'templates'].forEach(k => {
          if (JSON.stringify(mine[k]) !== JSON.stringify(baseSnap[k] ?? null)) merged[k] = mine[k];
        });
        const newTs = new Date().toISOString();
        const { data: upd, error } = await authCtx.client.from('site_data')
          .update({ data: merged, updated_by: authCtx.profile ? authCtx.profile.login : 'admin', updated_at: newTs })
          .eq('id', 1).eq('updated_at', oldTs) // qulf HAR DOIM qoʻllanadi
          .select('id');
        if (error) { alert('Saqlashda xatolik: ' + error.message); throw new Error(error.message); }
        if (upd && upd.length) { // muvaffaqiyat (aynan 1 qator yangilandi)
          try { await logEdits(); } catch (_) {}
          lastSeenTs = newTs;
          applyServerData(merged);
          toast('Saqlandi ✓');
          return;
        }
        // 0 qator = konflikt (boshqa yozuv oraga tushdi) — qayta oʻqib birlashtiramiz
      }
      const msg = readFail
        ? 'Serverga ulanib boʻlmadi — maʼlumot SAQLANMADI. Internetni tekshirib qayta urining.'
        : 'Saqlab boʻlmadi — ayni damda boshqa tahrir ketmoqda. Qayta urining.';
      alert(msg);
      throw new Error(msg);
    } finally { busyOps--; }
  }

  // Serverdan kelgan holatni DATA + snapshotlarga tadbiq etish
  function applyServerData(sd) {
    DATA.districts = sd.districts || [];
    DATA.announcement = sd.announcement || null;
    DATA.buyruqlar = sd.buyruqlar || null;
    DATA.templates = sd.templates || null;
    indexData();
    baseSnap = { districts: stripD(DATA.districts), announcement: stripD(DATA.announcement), buyruqlar: stripD(DATA.buyruqlar), templates: stripD(DATA.templates) };
    if (SUPER) editSnap = JSON.parse(JSON.stringify(DATA.districts));
  }

  /* ---------- Jonli yangilanish: boshqa foydalanuvchilar tahrirlari koʻrinib turadi ---------- */
  let refreshBusy = false;
  let busyOps = 0; // fayl yuklash / CRUD davomida > 0 — refreshData DATA'ni almashtirib yubormasin
  let lastSeenTs = null; // oxirgi koʻrilgan updated_at — egressni tejash uchun
  async function refreshData() {
    if (!authCtx || refreshBusy || document.hidden || busyOps > 0) return;
    // Modal ochiq yoki foydalanuvchi yozayotgan boʻlsa — keyingi safar
    if (document.querySelector('.qr-modal.open')) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable) && ae.id !== 'globalSearch') return;
    refreshBusy = true;
    try {
      // 1) AVVAL yengil soʻrov — faqat updated_at (bir necha bayt). Oʻzgarmagan boʻlsa butun bazani tortmaymiz (egress tejaladi).
      const { data: meta } = await authCtx.client.from('site_data').select('updated_at').eq('id', 1).single();
      const ts = meta && meta.updated_at;
      if (ts && lastSeenTs && ts === lastSeenTs) return; // hech kim oʻzgartirmagan — toʻxtaymiz
      // 2) Oʻzgargan (yoki birinchi marta) — endi butun bazani tortamiz
      const { data: row } = await authCtx.client.from('site_data').select('data,updated_at').eq('id', 1).single();
      if (row && row.data && Array.isArray(row.data.districts)) {
        lastSeenTs = row.updated_at;
        const freshS = JSON.stringify({ d: row.data.districts, a: row.data.announcement || null, b: row.data.buyruqlar || null, t: row.data.templates || null });
        const curS = JSON.stringify({ d: stripD(DATA.districts), a: stripD(DATA.announcement || null), b: stripD(DATA.buyruqlar || null), t: stripD(DATA.templates || null) });
        if (freshS !== curS) {
          applyServerData(row.data);
          const y = window.scrollY; route(); window.scrollTo(0, y);
        }
      }
    } catch (_) {} finally { refreshBusy = false; }
  }

  // Bildirishnoma (toast)
  function toast(msg) {
    let t = document.getElementById('appToast');
    if (!t) { t = document.createElement('div'); t.id = 'appToast'; t.className = 'app-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Rol va huquq: superadmin (Viloyat) hammasini, tuman xodimi faqat o'z hududini ---------- */
  const SUPER = !!(authCtx && authCtx.profile && authCtx.profile.is_admin);
  let MYDID = null;
  if (authCtx && authCtx.profile && !SUPER && authCtx.profile.district) {
    const md = DATA.districts.find(x => x.name === authCtx.profile.district);
    MYDID = md ? md.id : null;
  }
  const CANEDIT = (did) => !!authCtx && (SUPER || (!!MYDID && did === MYDID));

  // Saqlash: superadmin — butun baza (to'g'ridan-to'g'ri); tuman xodimi — faqat o'z hududi (edge funksiya orqali, server tekshiradi)
  async function saveData(districtId) {
    if (!authCtx) return;
    if (SUPER) { await pushData(); return; }
    const d = DATA.districts.find(x => x.id === (districtId || MYDID));
    if (!d) return;
    const clean = JSON.parse(JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v));
    try {
      const AUTH = await authHeaders();
      const res = await fetch(CFG.url + '/functions/v1/staff-edit', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', payload: { district: clean } })
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.ok) throw new Error(r.error || ('HTTP ' + res.status));
      toast('Saqlandi ✓');
      refreshData(); // serverdagi yakuniy holat bilan sinxronlash (kutmasdan)
    } catch (e) { alert('Saqlashda xatolik: ' + e.message); throw e; } // xato yuqoriga uzatiladi — soxta 'Saqlandi' boʻlmasin
  }

  // Fayl yuklash. Hujjat/shablon (R2) uchun avval TO'G'RIDAN-TO'G'RI yuklashga urinadi
  // (server imzolangan URL beradi, fayl serverni chetlab R2'ga boradi — 30MB chegarasi yo'q).
  // Ishlamasa (eski server yoki CORS sozlanmagan) — kichik fayllar proksi orqali yuklanadi.
  // Sessiya sarlavhalari. Muddat tugagan boʻlsa tushunarsiz "null" xatosi oʻrniga aniq xabar beramiz.
  async function authHeaders() {
    const { data: { session } } = await authCtx.client.auth.getSession();
    if (!session || !session.access_token) throw new Error('Sessiya muddati tugadi. Sahifani yangilab, qaytadan kiring.');
    return { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey };
  }

  async function uploadFile(kind, key, blob, contentType) {
    const AUTH = await authHeaders();
    if (kind === 'doc' || kind === 'tpl') {
      let signedUrl = null;
      try {
        const pres = await fetch(CFG.url + '/functions/v1/staff-edit?up=' + kind + '&presign=1', {
          method: 'POST', headers: { ...AUTH, 'x-key': key, 'x-size': String(blob.size) }
        });
        if (pres.ok) { const pj = await pres.json().catch(() => ({})); if (pj && pj.url) signedUrl = pj.url; }
      } catch (_) { /* presign topilmadi — pastda proksiga tushamiz */ }
      if (signedUrl) {
        try {
          const put = await fetch(signedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
          if (put.ok) return { ok: true, key };
        } catch (_) { /* CORS yoki tarmoq — kichik fayl pastda proksiga tushadi */ }
      }
      if (blob.size > 30 * 1024 * 1024)
        throw new Error('Katta faylni yuklab boʻlmadi — tizim yangilanishini kuting yoki faylni siqib (30MB gacha) yuklang.');
      // kichik fayl — proksiga fallback (pastda)
    }
    const res = await fetch(CFG.url + '/functions/v1/staff-edit?up=' + kind, {
      method: 'POST',
      headers: { ...AUTH, 'x-key': key, 'Content-Type': contentType },
      body: blob
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.ok) throw new Error(r.error || ('HTTP ' + res.status));
    return r;
  }

  // R2 hujjat/shablonni oʻchirish (yetim fayl toʻplanmasin). Xato boʻlsa jim (yozuv baribir olib tashlanadi).
  async function deleteFile(kind, key) {
    if (!key) return;
    try {
      const AUTH = await authHeaders();
      await fetch(CFG.url + '/functions/v1/staff-edit?up=' + kind + '&del=1', {
        method: 'POST', headers: { ...AUTH, 'x-key': key }
      });
    } catch (_) {}
  }

  /* ---------- Admin tahrirlari: indekslash + saqlangan o'zgarishlarni qo'llash ---------- */
  function getOverrides() {
    try { return JSON.parse(localStorage.getItem('overrides') || '{}'); } catch (e) { return {}; }
  }
  // Xizmat indekslari (_di/_oi/_si) — yangilangan maʼlumotga qayta qoʻllash uchun alohida funksiya
  function indexData() {
    DATA.districts.forEach(d => {
      (d.orgs || []).forEach((o, i) => { o._di = d.id; o._oi = i; });
      (d.markaz || []).forEach((s, i) => { s._di = d.id; s._si = i; });
    });
  }
  (function initData() {
    indexData();
    if (!authCtx) { // server rejimida lokal tahrirlar ishlatilmaydi
      const ov = getOverrides();
      DATA.districts.forEach(d => {
        d.orgs.forEach((o, i) => {
          ['r', 'k', 'b'].forEach(role => {
            const key = `org|${d.id}|${i}|${role}`;
            if (ov[key]) { o[role].fio = ov[key].fio; o[role].tel = ov[key].tel; }
          });
        });
        d.markaz.forEach((s, i) => {
          const key = `staff|${d.id}|${i}`;
          if (ov[key]) { s.fio = ov[key].fio; s.tel = ov[key].tel; }
        });
      });
    }
  })();
  // Boshlangʻich snapshot: pushData merge + jonli yangilanish taqqoslashlari shu nusxaga nisbatan
  let baseSnap = { districts: stripD(DATA.districts), announcement: stripD(DATA.announcement || null), buyruqlar: stripD(DATA.buyruqlar || null), templates: stripD(DATA.templates || null) };
  // Audit jurnali uchun boshlangʻich holat (superadmin tahrirlari shu nusxaga nisbatan taqqoslanadi)
  if (authCtx && authCtx.profile && authCtx.profile.is_admin) editSnap = JSON.parse(JSON.stringify(DATA.districts));
  // Jonli yangilanish: har 4 daqiqada + tab qaytib ochilganda
  if (authCtx) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });
    setInterval(refreshData, 4 * 60 * 1000);
  }

  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // XAVFSIZ tel: havola — faqat raqam/+ qoldiradi (href atributiga inyeksiyani butunlay yopadi)
  const telHref = t => 'tel:' + String(t ?? '').replace(/[^0-9+]/g, '');

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    award: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="m9 14-1.5 7L12 18.5 16.5 21 15 14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    chief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></svg>',
    cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16"/><path d="M5 21v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8"/><path d="M4 15.5c1.2 0 1.2 1 2.4 1s1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1"/><path d="M9 8V6M12 8V5M15 8V6"/></svg>'
  };

  /* ---------- E'lon banneri ---------- */
  function showAnnouncement() {
    const ann = DATA.announcement;
    const banner = document.getElementById('annBanner');
    if (!banner) return;
    if (!ann || !ann.text) { banner.hidden = true; return; }
    let dismissed = '';
    try { dismissed = localStorage.getItem('annDismissed') || ''; } catch (e) {}
    if (dismissed === String(ann.ts)) { banner.hidden = true; return; }
    document.getElementById('annText').textContent = ann.text;
    banner.hidden = false;
  }
  (function initAnnBanner() {
    const c = document.getElementById('annClose');
    if (c) c.addEventListener('click', () => {
      document.getElementById('annBanner').hidden = true;
      try { localStorage.setItem('annDismissed', String(DATA.announcement?.ts || '')); } catch (e) {}
    });
  })();

  /* ---------- helpers ---------- */
  const catOfOrg = o => /dmtt/i.test(o.org) ? 'dmtt' : /^\d+\s*-?\s*maktab/i.test(o.org) ? 'maktab' : 'other';
  const isCity = d => /shahri/i.test(d.name);
  const CITY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';

  // qidiruv so'rovini normallashtirish: kirill kiritilsa lotinga o'girish
  const C2L = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'sh','ъ':'ʼ','ь':'','э':'e','ю':'yu','я':'ya','ў':'oʻ','қ':'q','ғ':'gʻ','ҳ':'h','ы':'i' };
  function normQuery(q) {
    q = q.trim().toLowerCase();
    if (/[а-яёўқғҳ]/.test(q)) q = q.split('').map(c => C2L[c] !== undefined ? C2L[c] : c).join('');
    return q;
  }

  // topilgan so'zni natijalarda <mark> bilan belgilash
  function highlight(container, q) {
    if (!q || q.length < 2) return;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement.closest('mark, script, style, .edit-btn')) continue;
      if (re.test(n.nodeValue)) nodes.push(n);
      re.lastIndex = 0;
    }
    nodes.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(re).forEach((part, i) => {
        if (i % 2) {
          const m = document.createElement('mark');
          m.textContent = part;
          frag.appendChild(m);
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  const TEL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>';

  function telLinks(tels) {
    if (!tels || !tels.length) return '';
    return tels.map(t =>
      `<a href="${telHref(t)}">${TEL_ICON}${esc(t)}</a>`
    ).join('');
  }

  const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

  function personHtml(label, cls, icon, p, di, oi, detail) {
    const hasData = (p.fio && p.fio.length) || (p.tel && p.tel.length);
    const actions = detail && p.fio && p.tel && p.tel.length
      ? `<div class="card-actions">
           <button class="mini-btn" data-vcf data-fio="${esc(p.fio)}" data-pos="${esc(label)}" data-tel="${esc(p.tel[0])}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
             Kontaktga
           </button>
           <button class="mini-btn" data-qr data-fio="${esc(p.fio)}" data-tel="${esc(p.tel[0])}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M14 21h3M21 21h.01"/></svg>
             QR-kod
           </button>
         </div>`
      : '';
    return `<div class="person ${cls}${detail ? ' detail' : ''}">
      ${CANEDIT(di) ? `<button class="edit-btn" data-edit="org" data-d="${di}" data-i="${oi}" data-role="${cls}" title="Tahrirlash">${EDIT_ICON}</button>` : ''}
      <div class="label">${icon}${label}</div>
      ${hasData
        ? `${p.fio ? `<div class="fio">${esc(p.fio)}</div>` : ''}
           <div class="tels">${telLinks(p.tel)}</div>${actions}`
        : '<div class="empty">Maʼlumot kiritilmagan</div>'}
    </div>`;
  }

  /* Ixcham tashkilot kartasi — bosganda ichiga kiriladi */
  const CAT_META = {
    maktab: { name: 'Maktab', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>' },
    dmtt:   { name: 'DMTT', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>' },
    other:  { name: 'Tashkilot', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"/></svg>' }
  };

  function orgCard(o, idx) {
    const cat = catOfOrg(o);
    return `<a class="orgc tilt rv c-${cat}" href="#/hudud/${o._di}/t/${o._oi}">
      <span class="orgc-icon">${CAT_META[cat].icon}</span>
      <span class="orgc-body">
        <span class="orgc-name">${esc(o.org)}</span>
        <span class="orgc-sub">${o.r.fio ? esc(o.r.fio) : 'Rahbar koʻrsatilmagan'}</span>
      </span>
      ${CANEDIT(o._di) ? `<button class="orgc-del edit-btn" data-orgdel data-d="${o._di}" data-i="${o._oi}" title="Tashkilotni oʻchirish" aria-label="Oʻchirish">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>` : ''}
      <span class="orgc-go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </a>`;
  }

  function orgRow(o, idx) {
    return `<div class="org-row rv">
      <div class="org-head"><span class="num">${idx}</span><h4>${esc(o.org)}</h4></div>
      <div class="org-people">
        ${personHtml('Rahbar', 'r', ICONS.chief, o.r, o._di, o._oi)}
        ${personHtml('Kadrlar boʻlimi', 'k', ICONS.team, o.k, o._di, o._oi)}
        ${personHtml('Buxgalter', 'b', ICONS.calc, o.b, o._di, o._oi)}
      </div>
    </div>`;
  }

  function staffCard(s) {
    const isChief = /boshli/i.test(s.lavozim);
    const vacant = /^vakant$/i.test(s.fio);
    const photo = s.photo
      ? `<img src="${esc(s.photo)}" alt="${esc(s.fio)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="ph-fallback" style="display:none">${ICONS.user}<span>Rasm mavjud emas</span></div>`
      : `<div class="ph-fallback">${ICONS.user}<span>${vacant ? 'Boʻsh lavozim' : 'Rasm mavjud emas'}</span></div>`;
    return `<div class="staff-card tilt rv${vacant ? ' vacant' : ''}">
      <div class="staff-photo">
        ${photo}
        <span class="staff-role${isChief ? ' chief' : ''}">${isChief ? 'MARKAZ BOSHLIGʻI' : 'BOSH YURISKONSULT'}</span>
        ${CANEDIT(s._di) ? `<button class="edit-btn" data-edit="staff" data-d="${s._di}" data-i="${s._si}" title="Tahrirlash">${EDIT_ICON}</button>` : ''}
      </div>
      <div class="staff-body">
        <h4>${esc(s.fio)}</h4>
        <div class="pos">${esc(s.lavozim)}</div>
        ${s.tel && s.tel.length
          ? `<a class="tel-link" href="${telHref(s.tel[0])}">${ICONS.phone}${esc(s.tel[0])}</a>
             <div class="card-actions">
               <button class="mini-btn" data-vcf data-fio="${esc(s.fio)}" data-pos="${esc(s.lavozim)}" data-tel="${esc(s.tel[0])}">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
                 Kontaktga
               </button>
               <button class="mini-btn" data-qr data-fio="${esc(s.fio)}" data-tel="${esc(s.tel[0])}">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M14 21h3M21 21h.01"/></svg>
                 QR-kod
               </button>
             </div>`
          : '<span class="tel-link" style="color:#aab4c4">—</span>'}
        ${s.yutuq
          ? `<button class="yutuq-toggle" data-toggle>${ICONS.award} Yutuqlari</button>
             <div class="yutuq-text">${esc(s.yutuq)}</div>`
          : ''}
      </div>
    </div>`;
  }

  /* ---------- Tug'ilgan kunlar ---------- */
  const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  // (A) Bugungi tug'ilgan kun banneri — login qilingan kuni bosh sahifada chiqadi (sessiyada bir marta)
  function birthdayBannerHTML() {
    const now = new Date();
    const td = now.getDate(), tm = now.getMonth() + 1, key = td + '.' + tm;
    let seen = '';
    try { seen = sessionStorage.getItem('bdaySeen') || ''; } catch (e) {}
    if (seen === key) return '';
    const list = [];
    DATA.districts.forEach(d => d.markaz.forEach(s => {
      if (!s.tug) return;
      const m = s.tug.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m && +m[1] === td && +m[2] === tm) list.push({ s, d, age: now.getFullYear() - +m[3] });
    }));
    if (!list.length) return '';
    const DECOR = `<svg class="bd-decor" viewBox="0 0 600 220" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5">
          <path d="M48 40l4 12 4-12"/><path d="M40 48l12 4 12-4"/>
          <path d="M552 60l5 14 5-14"/><path d="M543 70l14 5 14-5"/>
          <path d="M90 170l3 9 3-9"/><path d="M505 160l3 9 3-9"/>
        </g>
        <g stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".35">
          <path d="M0 30 Q40 10 80 30 T160 30"/><path d="M600 190 Q560 170 520 190 T440 190"/>
        </g>
        <g fill="currentColor" opacity=".55">
          <circle cx="150" cy="36" r="2"/><circle cx="470" cy="44" r="2.4"/><circle cx="60" cy="120" r="1.8"/><circle cx="540" cy="130" r="2"/>
        </g>
      </svg>`;
    const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.3L21 9l-5 4.4L17.5 21 12 17.3 6.5 21 8 13.4 3 9l6.4-.7L12 2Z"/></svg>';
    const cards = list.map(({ s, d, age }) => `
      <div class="bd-person">
        <span class="bd-photo">
          <span class="bd-photo-ring" aria-hidden="true"></span>
          ${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : ICONS.user}
        </span>
        <div class="bd-text">
          <span class="bd-eyebrow">${star} Bugungi tugʻilgan kun</span>
          <b class="bd-name">${esc(s.fio)}</b>
          ${s.lavozim ? `<span class="bd-role">${esc(s.lavozim)}</span>` : ''}
          <span class="bd-place">${ICONS.pin}${esc(d.name)}</span>
          <span class="bd-age"><i>${age}</i> yoshga toʻldi</span>
        </div>
        <button class="bd-greet" type="button" data-greet data-name="${esc(s.fio)}" data-role="${esc(s.lavozim || '')}" data-dist="${esc(d.name)}" title="AI yordamida tabrik matni yaratish">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>
          AI tabrik
        </button>
      </div>`).join('');
    const heading = list.length === 1 ? 'Tugʻilgan kun muborak boʻlsin!' : `Bugun ${list.length} hamkasbimizning tugʻilgan kuni`;
    return `
      <div class="bd-banner" id="bdayBanner" data-key="${key}" role="region" aria-label="Bugungi tugʻilgan kunlar">
        ${DECOR}
        <button class="bd-close" id="bdayClose" aria-label="Yopish" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="bd-head"><span class="bd-bar" aria-hidden="true"></span><h3>${esc(heading)}</h3></div>
        <div class="bd-people${list.length > 1 ? ' multi' : ''}">${cards}</div>
        <a class="bd-link" href="#/tugilgan-kunlar">Barcha tugʻilgan kunlar
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
      </div>`;
  }

  // bugungi banner — yopish tugmasi (delegatsiya, bir marta o'rnatiladi)
  (function initBirthdayBanner() {
    app.addEventListener('click', (e) => {
      if (!e.target.closest('#bdayClose')) return;
      const b = document.getElementById('bdayBanner');
      if (!b) return;
      b.classList.add('bd-out');
      try { sessionStorage.setItem('bdaySeen', b.dataset.key); } catch (e2) {}
      setTimeout(() => b.remove(), 380);
    });
  })();

  // (B) Alohida "Tug'ilgan kunlar" sahifasi — oyma-oy kalendar
  function renderBirthdays() {
    const now = new Date();
    const curMon = now.getMonth() + 1, curDay = now.getDate(), curYear = now.getFullYear();
    const today0 = new Date(curYear, curMon - 1, curDay);
    const all = [];
    DATA.districts.forEach(d => d.markaz.forEach(s => {
      if (!s.tug) return;
      const m = s.tug.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!m) return;
      const day = +m[1], mon = +m[2], year = +m[3];
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return; // noto'g'ri sana — o'tkazib yuboriladi
      const isToday = day === curDay && mon === curMon;
      const turnsAge = curYear - year;
      let next = new Date(curYear, mon - 1, day);
      if (next < today0) next = new Date(curYear + 1, mon - 1, day);
      const inDays = Math.round((next - today0) / 86400000);
      all.push({ s, d, day, mon, year, isToday, turnsAge, inDays });
    }));
    const byMonth = MONTHS.map((_, i) => all.filter(x => x.mon === i + 1).sort((a, b) => a.day - b.day));
    const upcoming = all.filter(x => x.inDays >= 0 && x.inDays <= 30).sort((a, b) => a.inDays - b.inDays);

    const personRow = (x) => `
      <a class="bd-row${x.isToday ? ' is-today' : ''}" href="#/hudud/${x.d.id}">
        <span class="bd-row-photo">${x.s.photo ? `<img src="${esc(x.s.photo)}" alt="" loading="lazy">` : ICONS.user}</span>
        <span class="bd-row-info">
          <b>${esc(x.s.fio)}</b>
          <span class="bd-row-place">${esc(x.d.name)}</span>
        </span>
        <span class="bd-row-meta">
          ${x.isToday ? '<span class="bd-today-badge">Bugun</span>' : ''}
          <span class="bd-row-day"><b>${x.day}</b><i>${MONTHS[x.mon-1].slice(0,3)}</i></span>
          <span class="bd-row-age" title="shu yili toʻladigan yoshi">${x.turnsAge}</span>
        </span>
      </a>`;

    const monthPanels = MONTHS.map((name, i) => {
      const people = byMonth[i];
      const isCur = (i + 1) === curMon;
      const isPast = (i + 1) < curMon;
      return `
      <section class="bd-month rv${isCur ? ' cur' : ''}${isPast ? ' past' : ''}" style="--mi:${i}">
        <header class="bd-month-head">
          <span class="bd-month-no">${String(i + 1).padStart(2, '0')}</span>
          <h3>${name}</h3>
          ${isCur ? '<span class="bd-month-tag">Joriy oy</span>' : ''}
          <span class="bd-month-count">${people.length}</span>
        </header>
        <div class="bd-month-body">
          ${people.length
            ? people.map(personRow).join('')
            : `<div class="bd-empty">${ICONS.user}<span>maʼlumot yoʻq</span></div>`}
        </div>
      </section>`;
    }).join('');

    const upcomingStrip = upcoming.length ? `
      <h2 class="section-title rv"><span class="bar"></span>Yaqin kunlarda
        <span class="count">${upcoming.length}</span></h2>
      <div class="bd-upcoming rv">
        ${upcoming.map(x => `
          <a class="bd-up-card${x.isToday ? ' is-today' : ''} tilt" href="#/hudud/${x.d.id}">
            <span class="bd-up-photo">${x.s.photo ? `<img src="${esc(x.s.photo)}" alt="" loading="lazy">` : ICONS.user}</span>
            <b>${esc(x.s.fio)}</b>
            <span class="bd-up-place">${esc(x.d.name)}</span>
            <span class="bd-up-when">${x.isToday ? 'Bugun' : x.inDays === 1 ? 'Ertaga' : x.inDays + ' kundan soʻng'}</span>
            <span class="bd-up-date">${x.day} ${MONTHS[x.mon-1]}</span>
          </a>`).join('')}
      </div>` : '';

    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Tugʻilgan kunlar</div>
      <section class="bd-page-hero rv">
        <div class="bd-hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 14l2 2 4-4"/></svg>
        </div>
        <div>
          <h1>Tugʻilgan kunlar</h1>
          <p>Markaz xodimlarining tugʻilgan kunlari oyma-oy tartibida. Joriy oy ajratib koʻrsatilgan, bugungi tugʻilgan kun egasi alohida belgilangan.</p>
        </div>
        <div class="bd-hero-stat"><b data-counter="${all.length}">0</b><span>jami</span></div>
      </section>
      ${upcomingStrip}
      <h2 class="section-title rv"><span class="bar"></span>Oylar boʻyicha
        <span class="count">12</span></h2>
      <div class="bd-calendar">
        ${monthPanels}
      </div>`;
    enhance();
  }

  /* ---------- views ---------- */
  function renderHome() {
    const totalOrgs = DATA.districts.reduce((a, d) => a + d.orgs.length, 0);
    const totalStaff = DATA.districts.reduce((a, d) => a + d.markaz.length, 0);
    app.innerHTML = `
      <section class="hero hero-split rv">
        <div class="hero-left">
          <span class="hero-badge"><span class="dot"></span>Rasmiy maʼlumotnoma</span><span class="update-badge"><span class="pulse"></span>Maʼlumotlar 2026-yil iyun holatiga</span>
          <h1>Yuridik xizmat koʻrsatish markazlari maʼlumotnomasi</h1>
          <p>Navoiy viloyati tuman va shaharlaridagi yuridik xizmat koʻrsatish markazlari xodimlari hamda
             tashkilotlarning masʼul xodimlari (rahbar, kadrlar boʻlimi, buxgalter) toʻgʻrisidagi maʼlumotlar.
             Kerakli hududni tanlang yoki qidiruvdan foydalaning.</p>
          <div class="hero-stats">
            <div class="stat tilt"><b data-counter="${DATA.districts.length}">0</b><span>tuman va shahar</span></div>
            <div class="stat tilt"><b data-counter="${totalStaff}">0</b><span>markaz xodimi</span></div>
            <div class="stat tilt"><b data-counter="${totalOrgs}">0</b><span>tashkilot</span></div>
          </div>
          <div class="hero-cta">
            <a class="btn-main" href="#hududlar" data-scroll>Hududni tanlash
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
            <a class="btn-ghost" href="#/statistika"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>Statistika</a>
          </div>
        </div>
        <div class="hero-right" aria-hidden="true">
          <span class="emblem-ring"></span>
          <div class="emblem-tile">
            <img src="img/logo.png" alt="Adliya vazirligi gerbi">
          </div>
          <span class="float-chip c1"><b>${DATA.districts.length}</b> tuman va shahar</span>
          <span class="float-chip c2"><b>${totalOrgs}</b> tashkilot</span>
          <span class="float-chip c3"><b>${totalStaff}</b> markaz xodimi</span>
        </div>
      </section>
      ${birthdayBannerHTML()}
      ${[
        { title: 'Shaharlar', items: DATA.districts.filter(isCity), anchor: 'hududlar' },
        { title: 'Tumanlar', items: DATA.districts.filter(d => !isCity(d)), anchor: '' }
      ].map(g => `
      <h2 class="section-title rv" ${g.anchor ? `id="${g.anchor}"` : ''}><span class="bar"></span>${g.title}
        <span class="count">${g.items.length}</span></h2>
      <div class="district-grid">
        ${g.items.map(d => `
          <a class="district-card tilt rv${isCity(d) ? ' city' : ''}" href="#/hudud/${d.id}">
            <span class="dc-type">${isCity(d) ? 'Shahar' : 'Tuman'}</span>
            <div class="dc-top">
              <span class="dc-icon">${isCity(d) ? CITY_ICON : ICONS.pin}</span>
              <h3>${esc(d.name.replace(/ (shahri|tumani)$/i, ''))}</h3>
            </div>
            <div class="district-meta">
              <span>${d.markaz.length} markaz xodimi</span>
              <span>${d.orgs.length} tashkilot</span>
            </div>
            <span class="go">Batafsil <span aria-hidden="true">→</span></span>
          </a>`).join('')}
      </div>`).join('')}
      <h2 class="section-title rv"><span class="bar"></span>Tashkilotlar soni — hududlar kesimida</h2>
      <section class="hero rv chart-wrap" style="padding:26px 30px">
        ${[...DATA.districts].sort((a, b) => b.orgs.length - a.orgs.length).map(d => {
          const max = Math.max(...DATA.districts.map(x => x.orgs.length));
          return `<a class="chart-row" href="#/hudud/${d.id}">
            <span class="cname">${esc(d.name)}</span>
            <span class="cbar"><i data-w="${Math.round(d.orgs.length / max * 100)}"></i></span>
            <span class="cval">${d.orgs.length}</span>
          </a>`;
        }).join('')}
      </section>`;
    enhance();
  }

  function renderDistrict(id) {
    const d = DATA.districts.find(x => x.id === id);
    if (!d) { renderHome(); return; }
    const dc = { maktab: 0, dmtt: 0, other: 0 };
    d.orgs.forEach(o => dc[catOfOrg(o)]++);
    const dTot = d.orgs.length || 1;
    const dw = n => Math.round(n / dTot * 100);
    app.innerHTML = `
      <section class="dist-head rv">
        <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / ${esc(d.name)}</div>
        <h1>${esc(d.name)}</h1>
        <div class="sub">${esc(d.center)}</div>
      </section>

      <div class="dist-stats rv">
        <div class="ds-tiles">
          <div class="ds-tile"><span class="ds-ic k-navy">${ICONS.team}</span><b data-counter="${d.markaz.length}">0</b><span>markaz xodimi</span></div>
          <div class="ds-tile"><span class="ds-ic k-blue">${CHART_ICON}</span><b data-counter="${d.orgs.length}">0</b><span>tashkilot</span></div>
          <div class="ds-tile"><span class="ds-ic k-blue">${ICONS.award}</span><b data-counter="${dc.maktab}">0</b><span>maktab</span></div>
          <div class="ds-tile"><span class="ds-ic k-gold">${CITY_ICON}</span><b data-counter="${dc.dmtt}">0</b><span>DMTT</span></div>
          <div class="ds-tile"><span class="ds-ic k-green">${ICONS.pin}</span><b data-counter="${dc.other}">0</b><span>boshqa</span></div>
        </div>
        <div class="ds-prop" title="Maktab ${dc.maktab} · DMTT ${dc.dmtt} · Boshqa ${dc.other}">
          <i class="pm" data-w="${dw(dc.maktab)}"></i>
          <i class="pd" data-w="${dw(dc.dmtt)}"></i>
          <i class="po" data-w="${dw(dc.other)}"></i>
        </div>
        <div class="ds-keys">
          <span><span class="sw c-m"></span>Maktab</span>
          <span><span class="sw c-d"></span>DMTT</span>
          <span><span class="sw c-o"></span>Boshqa</span>
        </div>
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Yuridik xizmat markazi xodimlari
        <span class="count">${d.markaz.length}</span></h2>
      <div class="staff-grid">${d.markaz.map(staffCard).join('')}</div>

      <h2 class="section-title rv"><span class="bar"></span>Tashkilotlar masʼul xodimlari
        <span class="count">${d.orgs.length}</span></h2>
      <div class="org-tools">
        <div class="org-search">${ICONS.search}
          <input type="search" id="orgFilter" placeholder="Tashkilot, F.I.O. yoki telefon boʻyicha izlash..." autocomplete="off">
        </div>
        <div class="filter-chips" id="orgChips">
          <button class="fchip active" data-f="all">Barchasi</button>
          <button class="fchip" data-f="maktab">Maktablar</button>
          <button class="fchip" data-f="dmtt">DMTT</button>
          <button class="fchip" data-f="other">Boshqa tashkilotlar</button>
        </div>
        <span class="org-count" id="orgCount">${d.orgs.length} ta tashkilot</span>
        <span class="dist-export">
          <button class="dx-btn" data-exp="vcf" data-d="${d.id}" title="Hududning barcha kontaktlarini telefon uchun yuklab olish (.vcf)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
            Kontaktlar (VCF)</button>
          <button class="dx-btn" data-exp="csv" data-d="${d.id}" title="Excel (CSV) jadval koʻrinishida yuklab olish">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 13 6 5M15 13l-6 5"/></svg>
            Excel</button>
        </span>
        ${CANEDIT(d.id) ? `<button class="org-add edit-btn" id="orgAddBtn" data-d="${d.id}" title="Yangi tashkilot qoʻshish">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> Tashkilot qoʻshish
        </button>` : ''}
      </div>
      <div class="orgc-grid" id="orgList">
        ${d.orgs.map((o, i) => orgCard(o, i + 1)).join('')}
      </div>`;

    const filter = document.getElementById('orgFilter');
    const list = document.getElementById('orgList');
    const count = document.getElementById('orgCount');
    const chips = document.getElementById('orgChips');
    let activeCat = 'all';

    const catOf = catOfOrg;

    function applyOrgFilter() {
      const q = normQuery(filter.value);
      const qd = q.replace(/\D/g, '');
      const hits = d.orgs.filter(o => {
        if (activeCat !== 'all' && catOf(o) !== activeCat) return false;
        if (!q) return true;
        const hay = [o.org, o.r.fio, o.k.fio, o.b.fio].join(' ').toLowerCase();
        const tels = [...o.r.tel, ...o.k.tel, ...o.b.tel].join(' ').replace(/\D/g, '');
        return hay.includes(q) || (qd.length >= 3 && tels.includes(qd));
      });
      list.innerHTML = hits.length
        ? hits.map((o, i) => orgCard(o, i + 1)).join('')
        : '<div class="no-results">Hech narsa topilmadi</div>';
      count.textContent = `${hits.length} ta tashkilot`;
      if (q) highlight(list, q);
      enhance();
    }

    filter.addEventListener('input', applyOrgFilter);
    chips.addEventListener('click', e => {
      const c = e.target.closest('.fchip');
      if (!c) return;
      chips.querySelectorAll('.fchip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeCat = c.dataset.f;
      applyOrgFilter();
    });
    enhance();
  }

  function renderSearch(q) {
    const ql = normQuery(q);
    const qd = ql.replace(/\D/g, '');
    if (ql.length < 2) { route(); return; }

    let staffHits = [], orgHits = [];
    DATA.districts.forEach(d => {
      d.markaz.forEach(s => {
        const tels = (s.tel || []).join(' ').replace(/\D/g, '');
        if (s.fio.toLowerCase().includes(ql) || (qd.length >= 3 && tels.includes(qd)))
          staffHits.push({ d, s });
      });
      d.orgs.forEach(o => {
        const hay = [o.org, o.r.fio, o.k.fio, o.b.fio].join(' ').toLowerCase();
        const tels = [...o.r.tel, ...o.k.tel, ...o.b.tel].join(' ').replace(/\D/g, '');
        if (hay.includes(ql) || (qd.length >= 3 && tels.includes(qd)))
          orgHits.push({ d, o });
      });
    });

    // Buyruqlar boʻyicha qidiruv (boʻlim nomi, havola nomi, hujjat nomi)
    let buyHits = [];
    (DATA.buyruqlar || []).forEach((c, ci) => {
      const catMatch = (c.name || '').toLowerCase().includes(ql);
      const links = (c.links || []).filter(lk => (lk.n || '').toLowerCase().includes(ql));
      const docs = (c.docs || []).filter(dc => (dc.n || '').toLowerCase().includes(ql));
      if (catMatch || links.length || docs.length)
        buyHits.push({ ci, c, links: catMatch ? (c.links || []) : links, docs: catMatch ? (c.docs || []) : docs });
    });

    // Shablonlar boʻyicha qidiruv (nom boʻyicha)
    const tplHits = (DATA.templates || []).map((t, i) => ({ t, i })).filter((x) => (x.t.n || '').toLowerCase().includes(ql)).slice(0, 30);

    let html = `<section class="dist-head rv">
      <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Qidiruv</div>
      <h1>Qidiruv natijalari: «${esc(q)}»</h1>
      <div class="sub">${staffHits.length} markaz xodimi, ${orgHits.length} tashkilot${buyHits.length ? `, ${buyHits.length} hujjat boʻlimi` : ''}${tplHits.length ? `, ${tplHits.length} shablon` : ''} topildi</div>
    </section>`;

    if (!staffHits.length && !orgHits.length && !buyHits.length && !tplHits.length) {
      html += '<div class="no-results">Hech narsa topilmadi. Qidiruv soʻzini oʻzgartirib koʻring.</div>';
    }

    if (tplHits.length) {
      html += `<h2 class="section-title"><span class="bar"></span>Shablonlar <span class="count">${tplHits.length}</span></h2>
        <div class="ord-links" style="margin-bottom:14px">
          ${tplHits.map((x) => x.t.u
            ? `<div class="ord-link"><a href="${esc(x.t.u)}" target="_blank" rel="noopener noreferrer">${ORD_ICONS.link}<span>${esc(x.t.n)}</span>${ORD_ICONS.ext}</a></div>`
            : `<div class="ord-link"><a href="#/shablonlar">${ORD_ICONS.link}<span>${esc(x.t.n)}</span></a></div>`
          ).join('')}
        </div>`;
    }

    if (buyHits.length) {
      html += `<h2 class="section-title"><span class="bar"></span>Hujjatlar <span class="count">${buyHits.length}</span></h2>
        <div class="sr-buy-wrap">`;
      buyHits.forEach(h => {
        const items = [
          ...h.links.map(l => ({ t: 'link', n: l.n, u: l.u })),
          ...h.docs.map(d => ({ t: 'doc', n: (d.n || '').replace(/\.pdf$/i, '') }))
        ].slice(0, 8);
        html += `<div class="sr-buy">
          <a class="sr-buy-head" href="#/buyruqlar/${h.ci}">
            <span class="ord-ic">${ordCatIcon(h.ci)}<span class="ord-n">${h.ci + 1}</span></span>
            <b>${esc(h.c.name)}</b>
            <svg class="sr-buy-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </a>
          <div class="sr-buy-items">
            ${items.map(it => it.t === 'link'
              ? `<a class="sr-buy-item" href="${esc(it.u)}" target="_blank" rel="noopener noreferrer">${ORD_ICONS.miniLink}<span>${esc(it.n)}</span></a>`
              : `<a class="sr-buy-item doc" href="#/buyruqlar/${h.ci}">${ORD_ICONS.miniFile}<span>${esc(it.n)}</span></a>`
            ).join('')}
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    if (staffHits.length) {
      html += `<h2 class="section-title"><span class="bar"></span>Markaz xodimlari
        <span class="count">${staffHits.length}</span></h2>`;
      const byD = {};
      staffHits.forEach(h => (byD[h.d.id] = byD[h.d.id] || { d: h.d, items: [] }).items.push(h.s));
      Object.values(byD).forEach(g => {
        html += `<div class="sr-district">${esc(g.d.name)}</div>
          <div class="staff-grid" style="margin-bottom:10px">${g.items.map(staffCard).join('')}</div>`;
      });
    }

    if (orgHits.length) {
      html += `<h2 class="section-title"><span class="bar"></span>Tashkilotlar
        <span class="count">${orgHits.length}</span></h2>`;
      const byD = {};
      orgHits.forEach(h => (byD[h.d.id] = byD[h.d.id] || { d: h.d, items: [] }).items.push(h.o));
      Object.values(byD).forEach(g => {
        html += `<div class="sr-district">${esc(g.d.name)} — ${g.items.length} ta</div>
          <div class="org-list" style="margin-bottom:14px">
            ${g.items.slice(0, 80).map((o, i) => orgRow(o, i + 1)).join('')}
          </div>`;
      });
    }
    app.innerHTML = html;
    highlight(app, ql);
    enhance();
  }

  /* ---------- visual enhancements: reveal, tilt, counters ---------- */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealObserver.unobserve(en.target);
      }
    });
  }, { threshold: .06, rootMargin: '0px 0px -30px 0px' });

  // motion.dev — spring fizikasi
  const M = (window.Motion && window.Motion.animate && window.Motion.animateValue)
    ? window.Motion : null;

  function animateCounter(el) {
    const target = +el.dataset.counter;
    if (M && M.animate) {
      M.animate(0, target, {
        type: 'spring', stiffness: 60, damping: 18,
        onUpdate: v => { el.textContent = Math.round(v); }
      });
      return;
    }
    const dur = 900, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(ease(p) * target);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function enhance() {
    const vh = window.innerHeight || 800;
    app.querySelectorAll('.rv:not(.in)').forEach((el, i) => {
      el.style.transitionDelay = Math.min(i % 12 * 45, 400) + 'ms';
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > -10) {
        // Ko'rinishdagi kontent darhol ochiladi (observer kechiksa ham ko'rinmas qolmaydi)
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
      } else {
        revealObserver.observe(el);
      }
    });
    // Xavfsizlik: 700ms ichida har qanday ochilmagan ko'rinishdagi element majburan ochiladi
    setTimeout(() => {
      app.querySelectorAll('.rv:not(.in)').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) && r.bottom > -10) el.classList.add('in');
      });
    }, 700);
    app.querySelectorAll('[data-counter]:not(.done)').forEach(el => {
      el.classList.add('done');
      animateCounter(el);
    });
    app.querySelectorAll('.cbar i[data-w], .sbar i[data-w], .st-prop-bar i[data-w], .st-rank-bar i[data-w], .ds-prop i[data-w], .comp-bar i[data-w]').forEach((el, i) => {
      if (M && M.animate) {
        // transform asosida (performant): width darhol, scaleX spring bilan
        el.style.width = el.dataset.w + '%';
        el.style.transition = 'none';
        M.animate(el, { scaleX: [0, 1] }, {
          type: 'spring', stiffness: 80, damping: 20,
          delay: .2 + i * .045
        });
      } else {
        setTimeout(() => { el.style.width = el.dataset.w + '%'; }, 250 + i * 40);
      }
    });
    applyLang();
  }

  /* 3D tilt — pointer-follow, delegated */
  const fine = matchMedia('(pointer: fine)').matches &&
               !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fine) {
    let raf = null;
    app.addEventListener('pointermove', e => {
      const card = e.target.closest('.tilt');
      if (!card) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        card.style.setProperty('--mx', ((px + .5) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((py + .5) * 100).toFixed(1) + '%');
        card.style.transition = 'box-shadow .4s';
        card.style.transform =
          `translateY(-8px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) scale(1.018)`;
      });
    });
    app.addEventListener('pointerout', e => {
      const card = e.target.closest('.tilt');
      if (card && !card.contains(e.relatedTarget)) {
        card.style.transition = '';
        card.style.transform = '';
      }
    }, true);
  }

  /* ---------- Tashkilot ichki sahifasi ---------- */
  function renderOrgDetail(di, oi) {
    const d = DATA.districts.find(x => x.id === di);
    const o = d && d.orgs[oi];
    if (!o) { renderDistrict(di); return; }
    const cat = catOfOrg(o);
    const phones = [...o.r.tel, ...o.k.tel, ...o.b.tel].length;
    app.innerHTML = `
      <section class="dist-head rv">
        <div class="breadcrumb">
          <a href="#/">Bosh sahifa</a> / <a href="#/hudud/${d.id}">${esc(d.name)}</a> / ${esc(o.org)}
        </div>
        <div class="orgd-head">
          <span class="orgd-icon c-${cat}">${CAT_META[cat].icon}</span>
          <div>
            <h1>${esc(o.org)}</h1>
            <div class="sub">${esc(d.name)} · ${CAT_META[cat].name} · ${phones} ta telefon raqami</div>
          </div>
        </div>
      </section>

      <h2 class="section-title rv"><span class="bar"></span>Masʼul xodimlar</h2>
      <div class="detail-people">
        ${personHtml('Rahbar', 'r', ICONS.chief, o.r, o._di, o._oi, true)}
        ${personHtml('Kadrlar boʻlimi', 'k', ICONS.team, o.k, o._di, o._oi, true)}
        ${personHtml('Buxgalter', 'b', ICONS.calc, o.b, o._di, o._oi, true)}
      </div>

      ${((o.docs && o.docs.length) || CANEDIT(d.id)) ? `
      <h2 class="section-title rv"><span class="bar"></span>Hujjatlar <span class="count">${(o.docs || []).length}</span></h2>
      <div class="doc-list rv">
        ${(o.docs || []).map((dc, dci) => {
          const meta = DOC_META[dc.t] || { label: dc.t, icon: ICONS.file };
          const dname = dc.n || meta.label;
          return `<div class="doc-row" data-doc-path="${esc(dc.p)}" data-doc-name="${esc(dname)}.pdf">
            <span class="doc-ic">${meta.icon}</span>
            <span class="doc-info"><b>${esc(dname)}</b><span class="doc-sub">PDF hujjat</span></span>
            <span class="doc-act">
              <span class="doc-spin" aria-hidden="true"></span>
              <a class="doc-view" target="_blank" rel="noopener" aria-disabled="true" aria-label="Koʻrish" title="Koʻrish">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></a>
              <a class="doc-dl-btn" aria-disabled="true" aria-label="Yuklab olish" title="Yuklab olish" download>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></a>
              ${CANEDIT(d.id) ? `<span class="doc-edit">
                <button class="doc-eb" data-docreplace data-key="${esc(dc.p)}" title="PDFni almashtirish" aria-label="Almashtirish">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
                <button class="doc-eb del" data-docremove data-di="${d.id}" data-oi="${oi}" data-dci="${dci}" title="Hujjatni oʻchirish" aria-label="Oʻchirish">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
              </span>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
      ${CANEDIT(d.id) ? `<button class="doc-add" data-docadd data-di="${d.id}" data-oi="${oi}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> Hujjat qoʻshish</button>` : ''}` : ''}

      <div class="detail-nav rv">
        <a class="btn-ghost" href="#/hudud/${d.id}">
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          ${esc(d.name)}ga qaytish
        </a>
        ${oi > 0 ? `<a class="btn-ghost" href="#/hudud/${d.id}/t/${oi - 1}">← ${esc(d.orgs[oi - 1].org)}</a>` : ''}
        ${oi < d.orgs.length - 1 ? `<a class="btn-ghost" href="#/hudud/${d.id}/t/${oi + 1}">${esc(d.orgs[oi + 1].org)} →</a>` : ''}
      </div>`;
    enhance();
    loadDocLinks();
  }

  // Hujjat turlari — yorliq + SVG ikonka (emoji yo'q)
  const DOC_META = {
    jamoa: { label: 'Jamoa shartnomasi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>' },
    ichki: { label: 'Ichki tartib qoidalari', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2 2 4-4"/><path d="M4 4h16v16H4z"/><path d="M9 17h6"/></svg>' },
    tatil: { label: 'Taʼtillar jadvali', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>' }
  };

  // Maxfiy bucket — har bir hujjat uchun signed URL (1 soat) yaratib, havolaga qo'yamiz
  async function loadDocLinks() {
    const rows = [...app.querySelectorAll('.doc-row[data-doc-path]')];
    if (!rows.length) return;
    if (!authCtx || !authCtx.client) { rows.forEach(r => r.classList.add('doc-err')); return; }
    const items = rows.map(r => ({ p: r.dataset.docPath, fn: r.dataset.docName }));
    try {
      const { data: { session } } = await authCtx.client.auth.getSession();
      // docurl funksiyasi 1 so'rovda 30 hujjat bilan cheklangan — ko'p bo'lsa bo'laklab yuboramiz
      const CHUNK = 25;
      const urls = {};
      for (let i = 0; i < items.length; i += CHUNK) {
        const res = await fetch(CFG.url + '/functions/v1/docurl', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items.slice(i, i + CHUNK) })
        });
        const data = await res.json();
        if (!res.ok || !data.urls) throw new Error(data.error || 'no urls');
        Object.assign(urls, data.urls);
      }
      rows.forEach(r => {
        const u = urls[r.dataset.docPath];
        const vw = r.querySelector('.doc-view'), dl = r.querySelector('.doc-dl-btn');
        if (u && u.view) {
          if (vw) { vw.href = u.view; vw.removeAttribute('aria-disabled'); }
          if (dl) { dl.href = u.dl; dl.removeAttribute('aria-disabled'); }
          r.classList.add('doc-ready');
        } else { r.classList.add('doc-err'); }
      });
    } catch (e) {
      rows.forEach(r => r.classList.add('doc-err'));
    }
  }

  /* ---------- Statistika sahifasi ---------- */
  // Animatsiyali SVG doira diagramma (segmentlar chizilib chiqadi)
  function donutSVG(segs, total, label) {
    const R = 80, C = 2 * Math.PI * R, sum = segs.reduce((a, s) => a + s.v, 0) || 1;
    let offset = 0;
    const defs = segs.map((s, i) => `<linearGradient id="dg${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${s.c2}"/><stop offset="1" stop-color="${s.c}"/></linearGradient>`).join('');
    const arcs = segs.map((s, i) => {
      const len = s.v / sum * C;
      const dash = `${len} ${C - len}`;
      const rot = offset / sum * 360 - 90;
      offset += s.v;
      return `<circle class="donut-arc" cx="100" cy="100" r="${R}" fill="none"
        stroke="url(#dg${i})" stroke-width="26" stroke-linecap="round"
        stroke-dasharray="0 ${C}" data-dash="${dash}"
        transform="rotate(${rot} 100 100)" style="--d:${i * 0.18}s"/>`;
    }).join('');
    return `<div class="donut3d">
      <svg viewBox="0 0 200 200" class="donut-svg"><defs>${defs}</defs>
        <circle cx="100" cy="100" r="${R}" fill="none" stroke="rgba(140,160,200,.14)" stroke-width="26"/>
        ${arcs}
      </svg>
      <div class="donut-center"><b data-counter="${total}">0</b><span>${label}</span></div>
    </div>`;
  }
  function animateDonuts() {
    app.querySelectorAll('.donut-arc, .g-arc[data-dash]').forEach(a => {
      requestAnimationFrame(() => requestAnimationFrame(() => { a.style.strokeDasharray = a.dataset.dash; }));
    });
  }

  // Radial gauge — kutubxonasiz SVG (donut uslubida). value/max ulush bo'yicha to'ladi.
  function radialGauge(value, max, big, sub, accent) {
    const R = 70, C = 2 * Math.PI * R;
    const frac = Math.max(0, Math.min(1, value / (max || 1)));
    const dash = (frac * C).toFixed(1) + ' ' + C.toFixed(1);
    const grad = accent === 'gold' ? ['#e3c668', '#b89221'] : ['#6b8bd4', '#2f54a8'];
    const gid = 'gg-' + accent;
    return `<div class="st-gauge">
      <svg viewBox="0 0 160 160">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
        <circle class="g-track" cx="80" cy="80" r="${R}"/>
        <circle class="g-arc" cx="80" cy="80" r="${R}" stroke="url(#${gid})"
          data-dash="${dash}" stroke-dasharray="0 ${C.toFixed(1)}"/>
      </svg>
      <div class="st-gauge-center"><b data-counter="${value}">0</b><i>${esc(sub)}</i><small>${esc(big)} ulush</small></div>
    </div>`;
  }

  // Top hududlar leaderboard — SVG medal nishoni bilan (raqam emoji o'rnida SVG)
  function rankList(list, maxOrg) {
    const palette = ['#c9a227', '#9db0c8', '#cd7f4e'];
    return list.map((d, i) => {
      const t = d.orgs.length;
      const col = palette[i] || '#3f5fae';
      const col2 = i === 0 ? '#e9d28a' : i === 1 ? '#cdd6e4' : i === 2 ? '#e0a878' : '#6b8bd4';
      const w = Math.round(t / maxOrg * 100);
      const badge = `<svg viewBox="0 0 24 24" fill="none">
        <defs><linearGradient id="rb${i}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${col2}"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>
        <circle cx="12" cy="9.5" r="6.5" fill="url(#rb${i})" stroke="rgba(255,255,255,.6)" stroke-width="1"/>
        <path d="M8.5 14.5 7 22l5-2.6L17 22l-1.5-7.5" fill="url(#rb${i})" stroke="rgba(255,255,255,.5)" stroke-width=".8" stroke-linejoin="round"/></svg>`;
      return `<a class="st-rank" href="#/hudud/${d.id}">
        <span class="st-rank-badge">${badge}<span>${i + 1}</span></span>
        <span class="st-rank-name">${esc(d.name)}<small>${isCity(d) ? 'shahar' : 'tuman'}</small></span>
        <span class="st-rank-bar"><i data-w="${w}"></i></span>
        <span class="st-rank-val"><b data-counter="${t}">0</b><small>tashkilot</small></span>
      </a>`;
    }).join('');
  }

  // Haqiqiy geografik xarita (KMZ→tuman chegaralari, GEO_MAP). Tuman bosilsa o'tadi, rang=zichlik.
  function geoMapSVG() {
    if (!window.GEO_MAP) return '';
    const byId = {}; DATA.districts.forEach(d => byId[d.id] = d);
    const maxOrg = Math.max(...DATA.districts.map(d => d.orgs.length)) || 1;
    let regions = '';
    const bs = [];
    for (const id in GEO_MAP.dist) {
      const g = GEO_MAP.dist[id], d = byId[id];
      if (!d) continue;
      const t = d.orgs.length, lvl = Math.max(1, Math.ceil(t / maxOrg * 5)), nm = esc(d.name);
      regions += `<a href="#/hudud/${id}" aria-label="${nm}"><path class="gm-region h${lvl}" d="${g.d}"><title>${nm}: ${t} tashkilot</title></path></a>`;
      bs.push({ id, t, nm, x: g.cx, y: g.cy, ox: g.cx, oy: g.cy });
    }
    // declutter: yaqin badge'larni bir-biridan suramiz (janubiy zich klaster uchun)
    const R = 28, MIN = 2 * R + 8;
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        let dx = bs[j].x - bs[i].x, dy = bs[j].y - bs[i].y, dd = Math.hypot(dx, dy) || 0.1;
        if (dd < MIN) { const p = (MIN - dd) / 2, ux = dx / dd, uy = dy / dd; bs[i].x -= ux * p; bs[i].y -= uy * p; bs[j].x += ux * p; bs[j].y += uy * p; }
      }
    }
    let leads = '', badges = '';
    for (const b of bs) {
      if (Math.hypot(b.x - b.ox, b.y - b.oy) > R)
        leads += `<line class="gm-lead" x1="${b.ox.toFixed(0)}" y1="${b.oy.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}"/>`;
      badges += `<a href="#/hudud/${b.id}" class="gm-badge" aria-label="${b.nm}: ${b.t} tashkilot"><circle cx="${b.x.toFixed(0)}" cy="${b.y.toFixed(0)}" r="${R}"/><text class="gm-num" x="${b.x.toFixed(0)}" y="${b.y.toFixed(0)}">${b.t}</text><title>${b.nm}: ${b.t} tashkilot</title></a>`;
    }
    return `<div class="geo-wrap"><svg class="geo-svg" viewBox="0 0 ${GEO_MAP.w} ${GEO_MAP.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Navoiy viloyati hududlari xaritasi">
      <g class="gm-regions">${regions}</g><g class="gm-leads">${leads}</g><g class="gm-badges">${badges}</g></svg></div>`;
  }

  /* ---------- (1) Toʻldirilmagan maʼlumotlar ish roʻyxati + (8) Hujjat monitoringi ---------- */
  const ROLE_LABELS = { r: 'Rahbar', k: 'Kadrlar boʻlimi', b: 'Buxgalter' };
  const DQ_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5L16 9"/></svg>';
  const DQ_CHEV = '<svg class="dq-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function scopedDistricts() { return SUPER ? DATA.districts : DATA.districts.filter(d => d.id === MYDID); }
  function orgDataGaps(o) {
    const miss = [];
    ['r', 'k', 'b'].forEach(role => {
      const p = o[role] || {};
      const fio = (p.fio || '').trim();
      if (/vakant/i.test(fio)) return;                 // lavozim boʻsh — kamchilik emas
      if (!fio) { miss.push({ t: ROLE_LABELS[role] + ' kiritilmagan', k: 'fio' }); return; }
      const hasTel = (p.tel || []).some(x => String(x || '').replace(/\D/g, '').length >= 5);
      if (!hasTel) miss.push({ t: ROLE_LABELS[role] + ' — telefon yoʻq', k: 'tel' });
    });
    return miss;
  }
  function dqDone(title, msg) {
    return `<h2 class="section-title rv"><span class="bar"></span>${title.h} <span class="count">${title.c}</span></h2>
      <div class="stat-panel rv dq-done"><span class="dq-done-ic">${DQ_CHECK}</span>
        <div><b>${title.ok}</b><span>${msg}</span></div></div>`;
  }
  function dqCat(d, rows, metaText, openFirst, tagFn) {
    return `
      <details class="dq-cat rv"${openFirst ? ' open' : ''}>
        <summary class="dq-sum">
          <span class="dq-sum-name">${ICONS.pin}${esc(d.name)}</span>
          <span class="dq-sum-meta">${metaText}</span>
          ${DQ_CHEV}
        </summary>
        <div class="dq-body">
          ${rows.map(({ o, oi, miss }) => `
            <a class="dq-org" href="#/hudud/${d.id}/t/${oi}">
              <span class="dq-org-name">${esc(o.org)}</span>
              <span class="dq-tags">${tagFn(miss)}</span>
              <span class="dq-go" aria-hidden="true">›</span>
            </a>`).join('')}
        </div>
      </details>`;
  }

  function gapWorklistHTML() {
    if (!authCtx || !(SUPER || MYDID)) return '';
    const scoped = scopedDistricts();
    const per = scoped.map(d => {
      const orgs = [];
      d.orgs.forEach((o, oi) => { const miss = orgDataGaps(o); if (miss.length) orgs.push({ o, oi, miss }); });
      return { d, orgs };
    });
    const withGaps = per.filter(x => x.orgs.length).sort((a, b) => b.orgs.length - a.orgs.length);
    const TITLE = { h: 'Toʻldirilmagan maʼlumotlar', c: 'ish roʻyxati', ok: 'Barcha maʼlumotlar toʻldirilgan' };
    if (!withGaps.length) return dqDone(TITLE, (SUPER ? 'Viloyat boʻyicha' : 'Sizning hududingizda') + ' masʼul xodim va telefon maydonlari toʻliq.');
    const totalRoles = scoped.reduce((a, d) => a + d.orgs.length * 3, 0) || 1;
    const totalGapFields = withGaps.reduce((a, x) => a + x.orgs.reduce((b, r) => b + r.miss.length, 0), 0);
    const gapOrgs = withGaps.reduce((a, x) => a + x.orgs.length, 0);
    const fillPct = Math.round((1 - totalGapFields / totalRoles) * 100);
    const tagFn = miss => miss.map(m => `<span class="dq-tag k-${m.k}">${esc(m.t)}</span>`).join('');
    const cats = withGaps.map((x, idx) => dqCat(x.d, x.orgs, `<b>${x.orgs.length}</b> ta tashkilotda kamchilik`, (!SUPER || idx === 0), tagFn)).join('');
    return `
      <h2 class="section-title rv"><span class="bar"></span>Toʻldirilmagan maʼlumotlar <span class="count">ish roʻyxati</span></h2>
      <div class="stat-panel rv">
        <div class="dq-head">
          <div class="dq-head-txt">
            <h3><span class="dot9"></span>${SUPER ? 'Viloyat boʻyicha kamchiliklar' : 'Sizning hududingizdagi kamchiliklar'}</h3>
            <p class="dq-note">Quyidagi tashkilotlarda masʼul xodim yoki telefon raqami koʻrsatilmagan. Bosing — tashkilot sahifasiga oʻtib, tahrirlash rejimida toʻldiring.</p>
          </div>
          <div class="dq-ring" style="--p:${fillPct}"><span class="dq-ring-num">${fillPct}<i>%</i></span><span class="dq-ring-lbl">toʻldirilgan</span></div>
        </div>
        <div class="dq-summary-pills"><span class="dq-pill"><b>${gapOrgs}</b> tashkilot</span><span class="dq-pill"><b>${totalGapFields}</b> maydon</span></div>
        <div class="dq-cats">${cats}</div>
      </div>`;
  }

  function docMonitorHTML() {
    if (!authCtx || !(SUPER || MYDID)) return '';
    const TYPES = [['jamoa', 'Jamoa shartnomasi'], ['ichki', 'Ichki tartib'], ['tatil', 'Taʼtillar jadvali']];
    const per = scopedDistricts().map(d => {
      let total = 0;
      const rows = [];
      d.orgs.forEach((o, oi) => {
        if (!['maktab', 'dmtt'].includes(catOfOrg(o))) return;
        total++;
        const have = new Set((o.docs || []).map(dc => dc.t));
        const miss = TYPES.filter(([t]) => !have.has(t)).map(([, l]) => l);
        if (miss.length) rows.push({ o, oi, miss });
      });
      return { d, rows, total };
    }).filter(x => x.total > 0);
    if (!per.length) return '';
    const TITLE = { h: 'Hujjat monitoringi', c: 'maktab / DMTT', ok: 'Barcha majburiy hujjatlar mavjud' };
    const totalTargets = per.reduce((a, x) => a + x.total, 0);
    const gapCount = per.reduce((a, x) => a + x.rows.length, 0);
    if (!gapCount) return dqDone(TITLE, 'Maktab va DMTTlarda jamoa shartnomasi, ichki tartib va taʼtillar jadvali toʻliq yuklangan.');
    const withGaps = per.filter(x => x.rows.length).sort((a, b) => b.rows.length - a.rows.length);
    const docPct = Math.round((1 - gapCount / totalTargets) * 100);
    const tagFn = miss => miss.map(m => `<span class="dq-tag k-doc">${esc(m)} yoʻq</span>`).join('');
    const cats = withGaps.map((x, idx) => dqCat(x.d, x.rows, `<b>${x.rows.length}</b> / ${x.total} maktab·DMTT hujjatsiz`, (!SUPER || idx === 0), tagFn)).join('');
    return `
      <h2 class="section-title rv"><span class="bar"></span>Hujjat monitoringi <span class="count">maktab / DMTT</span></h2>
      <div class="stat-panel rv">
        <div class="dq-head">
          <div class="dq-head-txt">
            <h3><span class="dot9"></span>Yetishmayotgan majburiy hujjatlar</h3>
            <p class="dq-note">Maktab va DMTTlarda boʻlishi shart: jamoa shartnomasi, ichki tartib qoidalari, taʼtillar jadvali. Bosing — tashkilot sahifasida yuklang.</p>
          </div>
          <div class="dq-ring gold" style="--p:${docPct}"><span class="dq-ring-num">${docPct}<i>%</i></span><span class="dq-ring-lbl">hujjatli</span></div>
        </div>
        <div class="dq-summary-pills"><span class="dq-pill"><b>${gapCount}</b> tashkilot hujjatsiz</span><span class="dq-pill"><b>${totalTargets}</b> jami maktab·DMTT</span></div>
        <div class="dq-cats">${cats}</div>
      </div>`;
  }

  /* ---------- (3) Maʼlumot tekshiruvi — notoʻgʻri telefon raqamlari ---------- */
  let DV_ISSUES = [];
  function phoneValid(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 9 || (d.length === 12 && d.startsWith('998')); }
  function phoneIssues() {
    const out = [];
    scopedDistricts().forEach(d => {
      d.markaz.forEach((s, si) => (s.tel || []).forEach((t, ti) => { if (t && !phoneValid(t)) out.push({ did: d.id, t: 'staff', si, ti, value: t, ctx: `${d.name} · markaz · ${s.fio || ''}` }); }));
      d.orgs.forEach((o, oi) => [['r', 'Rahbar'], ['k', 'Kadrlar'], ['b', 'Buxgalter']].forEach(([role, lbl]) => {
        const p = o[role] || {}; (p.tel || []).forEach((t, ti) => { if (t && !phoneValid(t)) out.push({ did: d.id, t: 'org', oi, role, ti, value: t, ctx: `${d.name} · ${o.org} · ${lbl}` }); });
      }));
    });
    return out;
  }
  function dataValidatorHTML() {
    if (!authCtx || !(SUPER || MYDID)) return '';
    DV_ISSUES = phoneIssues();
    if (!DV_ISSUES.length) return dqDone({ h: 'Maʼlumot tekshiruvi', c: 'telefon', ok: 'Barcha telefon raqamlari toʻgʻri formatda' }, 'Notoʻgʻri uzunlikdagi yoki buzuq raqam topilmadi.');
    const rows = DV_ISSUES.map((x, i) => `
      <div class="dv-row" data-dvi="${i}">
        <span class="dv-ctx">${esc(x.ctx)}</span>
        <span class="dv-cur" title="Hozirgi (notoʻgʻri) qiymat">${esc(x.value)}</span>
        <input class="dv-in" type="text" value="${esc(x.value)}" inputmode="tel" aria-label="Toʻgʻri raqam">
        <span class="dv-sug" data-dvsug="${i}"></span>
        <button class="dv-save" type="button" data-dvsave="${i}">Saqlash</button>
      </div>`).join('');
    return `
      <h2 class="section-title rv"><span class="bar"></span>Maʼlumot tekshiruvi <span class="count">${DV_ISSUES.length} ta shubhali</span></h2>
      <div class="stat-panel rv">
        <div class="dq-head">
          <div class="dq-head-txt">
            <h3><span class="dot9"></span>Notoʻgʻri telefon raqamlari</h3>
            <p class="dq-note">Quyidagi raqamlar Oʻzbekiston formatiga (9 yoki 998+9 xona) mos emas. Toʻgʻri raqamni kiriting va saqlang. «AI tekshiruv» faqat format/imlo maslahatini beradi — raqamni hech qachon oʻzi oʻylab topmaydi.</p>
          </div>
          <button class="dx-btn" id="dvAi" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>
            AI tekshiruv</button>
        </div>
        <div class="dv-list">${rows}</div>
      </div>`;
  }

  /* ---------- (6) Tahrirlar jurnali (faqat admin) ---------- */
  function alFmtDate(iso) { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  function alRow(r) {
    const k = r.kind || ''; const add = /add$/.test(k), del = /del$/.test(k);
    const what = del ? `<b>${esc(r.field || '')}</b> oʻchirildi` : add ? `<b>${esc(r.field || '')}</b> qoʻshildi: <ins>${esc(r.new_val || '')}</ins>` : `<b>${esc(r.field || '')}</b>: <del>${esc(r.old_val || '—')}</del> <span class="al-arr">→</span> <ins>${esc(r.new_val || '—')}</ins>`;
    return `<div class="al-row ${add ? 'add' : del ? 'del' : 'mod'}">
      <span class="al-when">${alFmtDate(r.created_at)}</span>
      <span class="al-who">${esc(r.login || '—')}</span>
      <span class="al-where">${esc(r.district || '')}${r.ref ? ' · ' + esc(r.ref) : ''}</span>
      <span class="al-what">${what}</span>
    </div>`;
  }
  async function renderAuditLog() {
    if (!(authCtx && authCtx.profile && authCtx.profile.is_admin)) { renderHome(); return; }
    app.innerHTML = `
      <section class="dist-head rv">
        <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Tahrirlar jurnali</div>
        <h1>Tahrirlar jurnali</h1>
        <div class="sub">Maʼlumotnomaga kiritilgan oʻzgarishlar tarixi — kim, qachon, nimani oʻzgartirgani</div>
      </section>
      <div class="stat-panel rv" id="alPanel"><div class="al-empty">Yuklanmoqda...</div></div>`;
    enhance();
    try {
      const { data, error } = await authCtx.client.from('edit_log').select('*').order('created_at', { ascending: false }).limit(500);
      const panel = document.getElementById('alPanel');
      if (!panel) return;
      if (error) { panel.innerHTML = `<div class="al-empty">Jurnalni oʻqib boʻlmadi: ${esc(error.message)}</div>`; return; }
      if (!data || !data.length) { panel.innerHTML = '<div class="al-empty">Hozircha oʻzgarishlar qayd etilmagan. Birinchi tahrirdan soʻng shu yerda koʻrinadi.</div>'; return; }
      const dists = [...new Set(data.map(r => r.district).filter(Boolean))].sort();
      const logins = [...new Set(data.map(r => r.login).filter(Boolean))].sort();
      panel.innerHTML = `
        <div class="al-filters">
          <select id="alDist" class="al-sel"><option value="">Barcha hududlar</option>${dists.map(d => `<option>${esc(d)}</option>`).join('')}</select>
          <select id="alUser" class="al-sel"><option value="">Barcha foydalanuvchilar</option>${logins.map(l => `<option>${esc(l)}</option>`).join('')}</select>
          <span class="al-count" id="alCount"></span>
        </div>
        <div class="al-list" id="alList"></div>`;
      const draw = () => {
        const fd = document.getElementById('alDist').value, fu = document.getElementById('alUser').value;
        const rows = data.filter(r => (!fd || r.district === fd) && (!fu || r.login === fu));
        document.getElementById('alCount').textContent = `${rows.length} ta yozuv`;
        document.getElementById('alList').innerHTML = rows.length ? rows.map(alRow).join('') : '<div class="al-empty">Mos yozuv topilmadi.</div>';
      };
      document.getElementById('alDist').addEventListener('change', draw);
      document.getElementById('alUser').addEventListener('change', draw);
      draw();
    } catch (e) { const panel = document.getElementById('alPanel'); if (panel) panel.innerHTML = `<div class="al-empty">Xatolik: ${esc(e.message)}</div>`; }
  }

  function renderStats() {
    const totals = { maktab: 0, dmtt: 0, other: 0 };
    DATA.districts.forEach(d => d.orgs.forEach(o => totals[catOfOrg(o)]++));
    const totalOrgs = totals.maktab + totals.dmtt + totals.other;
    const totalStaff = DATA.districts.reduce((a, d) => a + d.markaz.length, 0);
    const pM = totals.maktab / totalOrgs * 100;
    const pD = totals.dmtt / totalOrgs * 100;
    const maxOrg = Math.max(...DATA.districts.map(d => d.orgs.length));
    const cityCount = DATA.districts.filter(isCity).length;
    const distCount = DATA.districts.length - cityCount;
    const avgOrg = Math.round(totalOrgs / DATA.districts.length);
    const aggOf = pred => {
      const ds = DATA.districts.filter(pred);
      const o = ds.reduce((a, d) => a + d.orgs.length, 0);
      const s = ds.reduce((a, d) => a + d.markaz.length, 0);
      return { count: ds.length, orgs: o, staff: s, avg: ds.length ? Math.round(o / ds.length) : 0, share: Math.round(o / totalOrgs * 100) };
    };
    const cityAgg = aggOf(isCity);
    const distAgg = aggOf(d => !isCity(d));
    const topDistricts = [...DATA.districts].sort((a, b) => b.orgs.length - a.orgs.length).slice(0, 5);

    // Ma'lumot to'liqligi hisob-kitobi
    const filledP = p => !!(p && p.fio && !/vakant/i.test(p.fio));
    let rF = 0, kF = 0, bF = 0, posF = 0, telF = 0;
    DATA.districts.forEach(d => d.orgs.forEach(o => {
      if (filledP(o.r)) rF++;
      if (filledP(o.k)) kF++;
      if (filledP(o.b)) bF++;
      ['r', 'k', 'b'].forEach(role => { const p = o[role]; if (filledP(p)) { posF++; if (p.tel && p.tel.length) telF++; } });
    }));
    let stPhoto = 0, stTug = 0, stN = 0;
    DATA.districts.forEach(d => d.markaz.forEach(s => { if (filledP(s)) { stN++; if (s.photo) stPhoto++; if (s.tug) stTug++; } }));
    const compRow = (label, val, total) => {
      const pct = total ? Math.round(val / total * 100) : 0;
      const lvl = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low';
      return `<div class="comp-row">
        <span class="comp-label">${label}</span>
        <span class="comp-bar"><i class="${lvl}" data-w="${pct}"></i></span>
        <span class="comp-val"><b>${val}</b><small>/ ${total}</small></span>
        <span class="comp-pct ${lvl}">${pct}%</span>
      </div>`;
    };


    app.innerHTML = `
      <section class="dist-head rv">
        <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Statistika</div>
        <h1>Statistika</h1>
        <div class="sub">Navoiy viloyati yuridik xizmat markazlari boʻyicha umumiy hisobot</div>
      </section>

      <h2 class="section-title rv"><span class="bar"></span>Hududlar xaritasi <span class="count">joylashuv</span></h2>
      <div class="stat-panel rv">
        <h3><span class="dot9"></span>Viloyat hududlari — ustiga bosib oʻtish mumkin · rang = tashkilotlar zichligi</h3>
        ${geoMapSVG()}
        <div class="st-heat-scale">
          <span>kam</span><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><i class="h5"></i><span>koʻp</span>
        </div>
      </div>

      ${(authCtx && authCtx.profile && authCtx.profile.is_admin) ? '<div id="aiStatsPanel" class="rv"></div>' : ''}

      <section class="st-lead rv">
        <div class="st-lead-item">
          <span class="st-lead-kicker">${CHART_ICON}Jami tashkilotlar</span>
          <b class="st-lead-num" data-counter="${totalOrgs}">0</b>
          <span class="st-lead-ctx">${DATA.districts.length} hudud boʻylab roʻyxatga olingan</span>
        </div>
        <span class="st-lead-div" aria-hidden="true"></span>
        <div class="st-lead-item">
          <span class="st-lead-kicker">${ICONS.team}Markaz xodimlari</span>
          <b class="st-lead-num gold" data-counter="${totalStaff}">0</b>
          <span class="st-lead-ctx">rahbar, kadrlar va buxgalteriya boʻyicha</span>
        </div>
        <span class="st-lead-div" aria-hidden="true"></span>
        <div class="st-lead-item st-lead-mini">
          <div class="st-mini-row"><b data-counter="${cityCount}">0</b><span>shahar</span></div>
          <div class="st-mini-row"><b data-counter="${distCount}">0</b><span>tuman</span></div>
          <div class="st-mini-row"><b data-counter="${avgOrg}">0</b><span>oʻrtacha / hudud</span></div>
        </div>
      </section>

      <div class="st-kpi-grid">
        ${[
          { ic: ICONS.pin,   n: DATA.districts.length, l: 'tuman va shahar',  cls: 'k-navy' },
          { ic: ICONS.team,  n: totalStaff,            l: 'markaz xodimi',    cls: 'k-navy' },
          { ic: ICONS.award, n: totals.maktab,         l: 'maktab',           cls: 'k-blue' },
          { ic: CITY_ICON,   n: totals.dmtt,           l: 'DMTT',             cls: 'k-gold' },
          { ic: ICONS.pin,   n: totals.other,          l: 'boshqa tashkilot', cls: 'k-green' }
        ].map((k, i) => `
          <div class="st-kpi tilt rv" style="--si:${i}">
            <span class="st-kpi-ic ${k.cls}">${k.ic}</span>
            <b data-counter="${k.n}">0</b>
            <span class="st-kpi-l">${k.l}</span>
          </div>`).join('')}
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Viloyat tarkibi <span class="count">${totalOrgs} tashkilot</span></h2>
      <div class="st-compose">
        <div class="stat-panel rv donut-panel">
          <h3><span class="dot9"></span>Tashkilot turlari ulushi</h3>
          <div class="donut-wrap">
            ${donutSVG([
              { v: totals.maktab, c: '#2f54a8', c2: '#5c7ec9' },
              { v: totals.dmtt,   c: '#c9a227', c2: '#e3c668' },
              { v: totals.other,  c: '#157347', c2: '#3da57a' }
            ], totalOrgs, 'tashkilot')}
            <div class="legend">
              <div class="li"><span class="sw c-m"></span>Maktablar <b>${totals.maktab}</b><i>${Math.round(pM)}%</i></div>
              <div class="li"><span class="sw c-d"></span>DMTT <b>${totals.dmtt}</b><i>${Math.round(pD)}%</i></div>
              <div class="li"><span class="sw c-o"></span>Boshqa <b>${totals.other}</b><i>${Math.round(100 - pM - pD)}%</i></div>
            </div>
          </div>
        </div>

        <div class="stat-panel rv">
          <h3><span class="dot9"></span>Umumiy proporsiya</h3>
          <div class="st-prop">
            <div class="st-prop-bar">
              <i class="pm" data-w="${Math.round(pM)}" title="Maktablar ${Math.round(pM)}%"><em>${Math.round(pM)}%</em></i>
              <i class="pd" data-w="${Math.round(pD)}" title="DMTT ${Math.round(pD)}%"><em>${Math.round(pD)}%</em></i>
              <i class="po" data-w="${Math.round(100 - pM - pD)}" title="Boshqa ${Math.round(100 - pM - pD)}%"><em>${Math.round(100 - pM - pD)}%</em></i>
            </div>
            <div class="st-prop-keys">
              <span><span class="sw c-m"></span>Maktab</span>
              <span><span class="sw c-d"></span>DMTT</span>
              <span><span class="sw c-o"></span>Boshqa</span>
            </div>
            <p class="st-prop-note">Har 10 ta tashkilotdan taxminan ${Math.round(pM / 10)} tasi — umumtaʼlim maktabi.</p>
          </div>
        </div>
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Maʼlumot toʻliqligi <span class="count">to‘ldirilganlik</span></h2>
      <div class="stat-panel rv">
        <h3><span class="dot9"></span>Tashkilotlar masʼul xodimlari va markaz maʼlumotlari</h3>
        <div class="comp-list">
          ${compRow('Rahbarlar belgilangan', rF, totalOrgs)}
          ${compRow('Kadrlar boʻlimi belgilangan', kF, totalOrgs)}
          ${compRow('Buxgalterlar belgilangan', bF, totalOrgs)}
          ${compRow('Telefon raqami koʻrsatilgan', telF, posF)}
          ${compRow('Markaz xodimi rasmlari', stPhoto, stN)}
          ${compRow('Tugʻilgan sanalar kiritilgan', stTug, stN)}
        </div>
      </div>

      ${gapWorklistHTML()}
      ${docMonitorHTML()}
      ${dataValidatorHTML()}

      <h2 class="section-title rv"><span class="bar"></span>Shaharlar va tumanlar <span class="count">taqqoslash</span></h2>
      <div class="st-vs">
        ${[
          { label: 'Shaharlar', icon: CITY_ICON, set: cityAgg, accent: 'navy' },
          { label: 'Tumanlar',  icon: ICONS.pin,  set: distAgg, accent: 'gold' }
        ].map(g => `
          <div class="st-vs-card stat-panel tilt rv st-vs-${g.accent}">
            <div class="st-vs-head"><span class="st-vs-ic">${g.icon}</span><h3>${g.label}</h3><span class="st-vs-count">${g.set.count} hudud</span></div>
            ${radialGauge(g.set.orgs, totalOrgs, g.set.share + '%', 'tashkilot', g.accent)}
            <div class="st-vs-rows">
              <div class="st-vs-row"><span>Tashkilot</span><b data-counter="${g.set.orgs}">0</b></div>
              <div class="st-vs-row"><span>Markaz xodimi</span><b data-counter="${g.set.staff}">0</b></div>
              <div class="st-vs-row"><span>Oʻrtacha / hudud</span><b data-counter="${g.set.avg}">0</b></div>
            </div>
          </div>`).join('')}
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Eng yirik hududlar <span class="count">top 5</span></h2>
      <div class="stat-panel rv">
        <div class="st-lead-board">${rankList(topDistricts, maxOrg)}</div>
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Hududlar matritsasi <span class="count">intensivlik</span></h2>
      <div class="stat-panel rv">
        <h3><span class="dot9"></span>Tashkilotlar zichligi boʻyicha — kuchli rang = koʻp tashkilot</h3>
        <div class="st-heat">
          ${[...DATA.districts].sort((a, b) => b.orgs.length - a.orgs.length).map((d, i) => {
            const t = d.orgs.length;
            const lvl = Math.max(1, Math.ceil(t / maxOrg * 5));
            return `<a class="st-heat-cell h${lvl}" href="#/hudud/${d.id}" style="--si:${i}" title="${esc(d.name)}: ${t} tashkilot">
              <span class="st-heat-ic">${isCity(d) ? CITY_ICON : ICONS.pin}</span>
              <span class="st-heat-name">${esc(d.name)}</span>
              <b data-counter="${t}">0</b>
              <span class="st-heat-sub">${d.markaz.length} xodim</span>
            </a>`;
          }).join('')}
        </div>
        <div class="st-heat-scale">
          <span>kam</span>
          <i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><i class="h5"></i>
          <span>koʻp</span>
        </div>
      </div>

      <h2 class="section-title rv"><span class="bar"></span>Hududlar kesimida tarkib <span class="count">maktab / DMTT / boshqa</span></h2>
      <div class="stat-panel rv wide">
        <div class="stack-rows two-col st-bars">
          ${[...DATA.districts].sort((a, b) => b.orgs.length - a.orgs.length).map((d, i) => {
            const c = { maktab: 0, dmtt: 0, other: 0 };
            d.orgs.forEach(o => c[catOfOrg(o)]++);
            const w = n => Math.round(n / maxOrg * 100);
            return `<a class="stack-row" href="#/hudud/${d.id}" style="--si:${i}">
              <span class="sname">${esc(d.name)}</span>
              <span class="sbar">
                <i class="sm" data-w="${w(c.maktab)}" title="Maktablar: ${c.maktab}"></i>
                <i class="sd" data-w="${w(c.dmtt)}"   title="DMTT: ${c.dmtt}"></i>
                <i class="so" data-w="${w(c.other)}"  title="Boshqa: ${c.other}"></i>
              </span>
              <span class="stotal">${d.orgs.length}</span>
            </a>`;
          }).join('')}
        </div>
        <div class="legend st-bars-legend">
          <div class="li"><span class="sw c-m"></span>Maktablar</div>
          <div class="li"><span class="sw c-d"></span>DMTT</div>
          <div class="li"><span class="sw c-o"></span>Boshqa tashkilotlar</div>
        </div>
      </div>`;
    enhance();
    animateDonuts();
    loadAiStats();
  }

  /* ---------- Admin: AI faollik statistikasi ---------- */
  async function loadAiStats() {
    const panel = document.getElementById('aiStatsPanel');
    if (!panel || !authCtx) return;
    panel.innerHTML = '<div class="stat-panel" style="text-align:center;color:var(--muted);padding:26px">AI statistikasi yuklanmoqda...</div>';
    try {
      const { data: { session } } = await authCtx.client.auth.getSession();
      const res = await fetch(CFG.url + '/functions/v1/admin', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'aiStats' })
      });
      const s = await res.json();
      if (s.error) { panel.innerHTML = ''; return; }
      const maxDay = Math.max(1, ...s.days.map(d => d.v));
      const dayLabel = k => { const p = k.split('-'); return p[2] + '.' + p[1]; };
      panel.innerHTML = `
        <details class="ai-activity">
          <summary>
            <h2 class="section-title"><span class="bar"></span>AI yordamchi faolligi <span class="count">admin</span></h2>
            <span class="ai-recent-chev" aria-hidden="true"><svg class="cv cv-d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg><svg class="cv cv-u" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></span>
          </summary>
          <div class="ai-activity-body">
        <div class="hero-stats" style="margin-bottom:8px">
          <div class="stat tilt"><b>${s.today}</b><span>bugun savol</span></div>
          <div class="stat tilt"><b>${s.total}</b><span>7 kunda</span></div>
          <div class="stat tilt"><b>${s.topUsers.length}</b><span>faol xodim</span></div>
        </div>
        <div class="stats-grid">
          <div class="stat-panel">
            <h3><span class="dot9"></span>So‘nggi 7 kun</h3>
            <div class="stack-rows">
              ${s.days.length ? s.days.map(d => `<div class="stack-row" style="cursor:default">
                <span class="sname">${dayLabel(d.k)}</span>
                <span class="sbar"><i class="sm" style="width:${Math.round(d.v/maxDay*100)}%"></i></span>
                <span class="stotal">${d.v}</span></div>`).join('') : '<div style="color:var(--muted);font-size:13px">Hozircha maʼlumot yoʻq</div>'}
            </div>
          </div>
          <div class="stat-panel">
            <h3><span class="dot9"></span>Eng koʻp soʻralgan</h3>
            <div class="ai-top">
              ${s.topQuestions.length ? s.topQuestions.map(q => `<div class="ai-top-row"><span>${esc(q.k)}</span><b>${q.v}</b></div>`).join('') : '<div style="color:var(--muted);font-size:13px">—</div>'}
            </div>
          </div>
          <details class="stat-panel ai-recent" style="grid-column:1/-1">
            <summary>
              <h3><span class="dot9"></span>Soʻnggi soʻrovlar</h3>
              <span class="ai-recent-meta">${s.recent.length} ta<span class="ai-recent-chev" aria-hidden="true"><svg class="cv cv-d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg><svg class="cv cv-u" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></span></span>
            </summary>
            <div class="ai-top">
              ${s.recent.length ? s.recent.map(r => `<div class="ai-top-row"><span>${esc(r.q)}</span><b style="color:var(--muted);font-weight:600">${esc(r.login||'?')}</b></div>`).join('') : '<div style="color:var(--muted);font-size:13px">—</div>'}
            </div>
          </details>
        </div>
          </div>
        </details>`;
    } catch (e) { panel.innerHTML = ''; }
  }

  /* ---------- Yuqori tashkilot buyruqlari ---------- */
  const ORD_ICONS = {
    chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    chevU: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    ext: '<svg class="ord-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    link: '<svg class="ord-lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    repl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
    miniLink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    miniFile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
  };
  // 17 sektor ikonkasi (kategoriya tartibida); ortiqcha boʻlsa hujjat ikonkasi
  const _i = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ORD_CAT_ICONS = [
    _i('<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v5h5"/><path d="M8 13h7M8 17h5"/>'),                                  /* 1 Umumiy */
    _i('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.3 3 3 6 3s6-1.7 6-3v-5"/>'),                                                                       /* 2 Maktablar */
    _i('<rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><rect x="8" y="3" width="8" height="8" rx="1.5"/>'),     /* 3 Bogʻchalar */
    _i('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),                                    /* 4 Bandlik */
    _i('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),                     /* 5 Iqtisodiyot */
    _i('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),                                                                   /* 6 Madaniyat */
    _i('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 13l2 2 4-4"/>'),                                                          /* 7 MMT */
    _i('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'), /* 8 Oila */
    _i('<path d="M7 20h10"/><path d="M12 20v-8"/><path d="M12 12c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 11c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z"/>'),                   /* 9 Qishloq */
    _i('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v6M9 11h6"/>'),                                                                          /* 10 SEO */
    _i('<path d="M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5z"/>'),                                                                                            /* 11 Suv */
    _i('<path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z"/>'),                                                                     /* 12 Yoshlar */
    _i('<path d="M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 12 6 4.5 4.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z"/><path d="M3.5 12h3l1.5-3 2 5 1.5-2h3"/>'),                /* 13 Tibbiyot */
    _i('<path d="M12 2 7 9h3l-4 6h12l-4-6h3z"/><path d="M12 15v6"/>'),                                                                                                 /* 14 Oʻrmon */
    _i('<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>'),             /* 15 Obodonlashtirish */
    _i('<circle cx="6" cy="11" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="11" r="2"/><path d="M8.5 15.5c0-2 1.7-3 3.5-3s3.5 1 3.5 3-1.3 4-3.5 4-3.5-2-3.5-4z"/>'), /* 16 Veterinariya */
    _i('<path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),                                                        /* 17 Soliq */
  ];
  const ordCatIcon = (ci) => ORD_CAT_ICONS[ci] || ORD_ICONS.file;

  function ordDocRow(dc, ci, di) {
    const dn = (dc.n || 'Hujjat').replace(/\.pdf$/i, '');
    return `<div class="doc-row" data-doc-path="${esc(dc.p)}" data-doc-name="${esc(dn)}.pdf">
      <span class="doc-ic">${ORD_ICONS.file}</span>
      <span class="doc-info"><b>${esc(dn)}</b><span class="doc-sub">PDF hujjat</span></span>
      <span class="doc-act">
        <span class="doc-spin" aria-hidden="true"></span>
        <a class="doc-view" target="_blank" rel="noopener" aria-disabled="true" aria-label="Koʻrish" title="Koʻrish">${ORD_ICONS.view}</a>
        <a class="doc-dl-btn" aria-disabled="true" aria-label="Yuklab olish" title="Yuklab olish" download>${ORD_ICONS.dl}</a>
        ${SUPER ? `<span class="doc-edit">
          <button class="doc-eb" data-ord="repdoc" data-ci="${ci}" data-di="${di}" title="PDFni almashtirish" aria-label="Almashtirish">${ORD_ICONS.repl}</button>
          <button class="doc-eb del" data-ord="deldoc" data-ci="${ci}" data-di="${di}" title="Oʻchirish" aria-label="Oʻchirish">${ORD_ICONS.trash}</button>
        </span>` : ''}
      </span>
    </div>`;
  }

  function ordCatHTML(c, ci) {
    const links = c.links || [], docs = c.docs || [];
    return `<details class="ord-cat" data-ci="${ci}">
      <summary>
        <span class="ord-cat-t">
          <span class="ord-ic">${ordCatIcon(ci)}<span class="ord-n">${ci + 1}</span></span>
          <b>${esc(c.name)}</b>
        </span>
        <span class="ord-meta">
          ${links.length ? `<span class="ord-pill">${ORD_ICONS.miniLink}${links.length}</span>` : ''}
          ${docs.length ? `<span class="ord-pill doc">${ORD_ICONS.miniFile}${docs.length}</span>` : ''}
          <span class="ord-chev"><span class="cv cv-d">${ORD_ICONS.chevD}</span><span class="cv cv-u">${ORD_ICONS.chevU}</span></span>
        </span>
      </summary>
      <div class="ord-body">
        ${(links.length || SUPER) ? `<div class="ord-sub">Onlayn havolalar</div>
        <div class="ord-links">
          ${links.length ? links.map((lk, li) => `<div class="ord-link">
            <a href="${esc(lk.u)}" target="_blank" rel="noopener noreferrer">${ORD_ICONS.link}<span>${esc(lk.n)}</span>${ORD_ICONS.ext}</a>
            ${SUPER ? `<button class="ord-x" data-ord="dellink" data-ci="${ci}" data-li="${li}" title="Oʻchirish">${ORD_ICONS.x}</button>` : ''}
          </div>`).join('') : (SUPER ? '<div class="ord-none">Havola yoʻq</div>' : '')}
        </div>
        ${SUPER ? `<button class="ord-addbtn" data-ord="addlink" data-ci="${ci}">${ORD_ICONS.plus} Havola qoʻshish</button>` : ''}` : ''}

        ${(docs.length || SUPER) ? `<div class="ord-sub">Hujjatlar <span>(PDF)</span></div>
        <div class="doc-list ord-docs">
          ${docs.length ? docs.map((dc, di) => ordDocRow(dc, ci, di)).join('') : (SUPER ? '<div class="ord-none">Hujjat yoʻq</div>' : '')}
        </div>
        ${SUPER ? `<button class="ord-addbtn" data-ord="adddoc" data-ci="${ci}">${ORD_ICONS.plus} Hujjat qoʻshish</button>` : ''}` : ''}

        ${SUPER ? `<div class="ord-cattools"><button data-ord="rencat" data-ci="${ci}">Nomini oʻzgartirish</button><button class="del" data-ord="delcat" data-ci="${ci}">Boʻlimni oʻchirish</button></div>` : ''}
      </div>
    </details>`;
  }

  function renderOrders(openIndex = -1) {
    const cats = DATA.buyruqlar || [];
    const totLinks = cats.reduce((a, c) => a + ((c.links && c.links.length) || 0), 0);
    const totDocs = cats.reduce((a, c) => a + ((c.docs && c.docs.length) || 0), 0);
    app.innerHTML = `
      <section class="dist-head rv ord-hero">
        <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Hujjatlar</div>
        <div class="ord-hero-main">
          <span class="ord-hero-ic">${ORDERS_ICON}</span>
          <div class="ord-hero-txt">
            <h1>Yuqori turuvchi tashkilot hujjatlari</h1>
            <div class="sub">Yuqori turuvchi organlarning normativ-huquqiy hujjatlari hamda onlayn havolalari</div>
          </div>
        </div>
        <div class="ord-stats">
          <div class="ord-stat"><b>${cats.length}</b><span>boʻlim</span></div>
          <span class="ord-stat-div" aria-hidden="true"></span>
          <div class="ord-stat"><b>${totLinks}</b><span>onlayn havola</span></div>
          <span class="ord-stat-div" aria-hidden="true"></span>
          <div class="ord-stat"><b>${totDocs}</b><span>PDF hujjat</span></div>
        </div>
      </section>
      <section class="ord-wrap rv">
        ${cats.length ? cats.map((c, ci) => ordCatHTML(c, ci)).join('') : '<div class="ord-empty">Hozircha boʻlimlar yoʻq.</div>'}
        ${SUPER ? `<button class="ord-newcat" data-ord="newcat">${ORD_ICONS.plus} Yangi boʻlim qoʻshish</button>` : ''}
      </section>`;
    enhance();
    loadDocLinks();
    if (openIndex >= 0) {
      const el = app.querySelectorAll('details.ord-cat')[openIndex];
      if (el) { el.open = true; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90); }
    }
  }

  async function handleOrderClick(e) {
    const btn = e.target.closest('[data-ord]');
    if (!btn || !SUPER) return;
    e.preventDefault();
    const act = btn.dataset.ord;
    const cats = DATA.buyruqlar = DATA.buyruqlar || [];
    if (act === 'newcat') {
      const name = prompt('Yangi boʻlim nomi:');
      if (!name || !name.trim()) return;
      cats.push({ name: name.trim(), links: [], docs: [] });
      await pushData(); renderOrders(); return;
    }
    const ci = +btn.dataset.ci;
    const c = cats[ci]; if (!c) return;
    if (act === 'rencat') {
      const name = prompt('Boʻlim nomi:', c.name);
      if (name === null || !name.trim()) return;
      c.name = name.trim(); await pushData(); renderOrders(); return;
    }
    if (act === 'delcat') {
      if (!confirm(`"${c.name}" boʻlimini (barcha havola va hujjatlari bilan) oʻchirasizmi?`)) return;
      cats.splice(ci, 1); await pushData(); renderOrders(); return;
    }
    if (act === 'addlink') {
      const n = prompt('Hujjat nomi:'); if (!n || !n.trim()) return;
      const u = prompt('Havola (https://...):'); if (u === null) return;
      if (!/^https?:\/\//i.test(u.trim())) { alert('Havola http(s):// bilan boshlanishi kerak'); return; }
      (c.links = c.links || []).push({ n: n.trim(), u: u.trim() });
      await pushData(); renderOrders(); return;
    }
    if (act === 'dellink') {
      const li = +btn.dataset.li; (c.links || []).splice(li, 1);
      await pushData(); renderOrders(); return;
    }
    if (act === 'deldoc') {
      if (!confirm('Hujjatni oʻchirasizmi?')) return;
      const di = +btn.dataset.di; const rk = (c.docs || [])[di] && c.docs[di].p; (c.docs || []).splice(di, 1);
      try { await pushData(); } catch (_) { renderOrders(); return; }
      if (rk) deleteFile('doc', rk); // yetim R2 fayl qolmasin
      renderOrders(); return;
    }
    if (act === 'adddoc' || act === 'repdoc') {
      const di = act === 'repdoc' ? +btn.dataset.di : -1;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/pdf';
      inp.onchange = async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { alert('Faqat PDF fayl'); return; }
        if (file.size > 200 * 1024 * 1024) { alert('Fayl 200MB dan katta'); return; }
        btn.classList.add('busy');
        busyOps++; // yuklash+saqlash davomida refreshData 'c' ni eskirtirmasin
        try {
          const key = di >= 0 ? c.docs[di].p : `buyruqlar/${ci}/${Date.now()}.pdf`;
          await uploadFile('doc', key, file, 'application/pdf');
          if (di >= 0) { c.docs[di].n = file.name.replace(/\.pdf$/i, ''); }
          else { (c.docs = c.docs || []).push({ n: file.name.replace(/\.pdf$/i, ''), p: key }); }
          await pushData(); renderOrders();
        } catch (err) { alert('Yuklashda xatolik: ' + err.message); btn.classList.remove('busy'); }
        finally { busyOps--; }
      };
      inp.click(); return;
    }
  }
  app.addEventListener('click', handleOrderClick);

  /* ---------- Namunaviy hujjat shablonlari ---------- */
  function tplRow(t, ti) {
    const ext = (String(t.p).split('.').pop() || 'pdf').toLowerCase();
    const nm = t.n || 'Shablon';
    const isPdf = ext === 'pdf';
    return `<div class="doc-row" data-doc-path="${esc(t.p)}" data-doc-name="${esc(nm)}.${esc(ext)}">
      <span class="doc-ic tpl-ext tpl-${esc(ext)}">${ORD_ICONS.file}<span class="tpl-badge">${esc(ext.toUpperCase())}</span></span>
      <span class="doc-info"><b>${esc(nm)}</b><span class="doc-sub">${esc(ext.toUpperCase())} · shablon</span></span>
      <span class="doc-act">
        <span class="doc-spin" aria-hidden="true"></span>
        ${isPdf ? `<a class="doc-view" target="_blank" rel="noopener" aria-disabled="true" aria-label="Koʻrish" title="Koʻrish">${ORD_ICONS.view}</a>` : ''}
        <a class="doc-dl-btn" aria-disabled="true" aria-label="Yuklab olish" title="Yuklab olish" download>${ORD_ICONS.dl}</a>
        ${SUPER ? `<button class="doc-eb del" data-tpl="del" data-ti="${ti}" title="Oʻchirish" aria-label="Oʻchirish">${ORD_ICONS.trash}</button>` : ''}
      </span>
    </div>`;
  }

  function tplLinkHTML(t, i) {
    return `<div class="ord-link">
      <a href="${esc(t.u)}" target="_blank" rel="noopener noreferrer">${ORD_ICONS.link}<span>${esc(t.n)}</span>${ORD_ICONS.ext}</a>
      ${SUPER ? `<button class="ord-x" data-tpl="del" data-ti="${i}" title="Oʻchirish">${ORD_ICONS.x}</button>` : ''}
    </div>`;
  }
  function tplCatHTML(catName, items) {
    const links = items.filter((x) => x.t.u), files = items.filter((x) => !x.t.u);
    return `<details class="ord-cat">
      <summary>
        <span class="ord-cat-t"><span class="ord-ic">${TPL_ICON}</span><b>${esc(catName)}</b></span>
        <span class="ord-meta"><span class="ord-pill">${ORD_ICONS.miniFile}${items.length}</span><span class="ord-chev"><span class="cv cv-d">${ORD_ICONS.chevD}</span><span class="cv cv-u">${ORD_ICONS.chevU}</span></span></span>
      </summary>
      <div class="ord-body">
        ${links.length ? `<div class="ord-links">${links.map((x) => tplLinkHTML(x.t, x.i)).join('')}</div>` : ''}
        ${files.length ? `<div class="doc-list" style="margin-top:8px">${files.map((x) => tplRow(x.t, x.i)).join('')}</div>` : ''}
      </div>
    </details>`;
  }
  const TPL_ORDER = ['Shartnomalar', 'Arizalar', 'Notarial hujjatlar', 'Sud hujjatlari', 'Korporativ hujjatlar', 'Boshqa hujjatlar'];
  function renderTemplates() {
    const tpls = DATA.templates || [];
    const groups = {};
    tpls.forEach((t, i) => { const c = (t.cat || 'Boshqa hujjatlar').trim() || 'Boshqa hujjatlar'; (groups[c] = groups[c] || []).push({ t, i }); });
    const cats = [...TPL_ORDER.filter((c) => groups[c]), ...Object.keys(groups).filter((c) => !TPL_ORDER.includes(c))];
    app.innerHTML = `
      <section class="dist-head rv ord-hero">
        <div class="breadcrumb"><a href="#/">Bosh sahifa</a> / Shablonlar</div>
        <div class="ord-hero-main">
          <span class="ord-hero-ic">${TPL_ICON}</span>
          <div class="ord-hero-txt">
            <h1>Namunaviy hujjat shablonlari</h1>
            <div class="sub">Tayyor huquqiy hujjat namunalari — boʻlimni oching, keraklisini tanlab yuklab oling (manba: yurxizmat.uz, Adliya vazirligi)</div>
          </div>
        </div>
        <div class="ord-stats">
          <div class="ord-stat"><b>${cats.length}</b><span>boʻlim</span></div>
          <span class="ord-stat-div" aria-hidden="true"></span>
          <div class="ord-stat"><b>${tpls.length}</b><span>shablon</span></div>
        </div>
      </section>
      <section class="ord-wrap rv">
        ${tpls.length ? cats.map((c) => tplCatHTML(c, groups[c])).join('') : `<div class="ord-empty">Hozircha shablon yoʻq.${SUPER ? ' Quyidagi tugma orqali qoʻshing.' : ''}</div>`}
        ${SUPER ? `<button class="ord-newcat" data-tpl="add">${ORD_ICONS.plus} Shablon (fayl) qoʻshish</button>` : ''}
      </section>`;
    enhance();
    loadDocLinks();
  }

  async function handleTemplateClick(e) {
    const btn = e.target.closest('[data-tpl]');
    if (!btn || !SUPER) return;
    e.preventDefault();
    const act = btn.dataset.tpl;
    const tpls = DATA.templates = DATA.templates || [];
    if (act === 'del') {
      if (!confirm('Shablonni oʻchirasizmi?')) return;
      const ti = +btn.dataset.ti; const rk = tpls[ti] && tpls[ti].p; // faqat FAYL shablon (havolada .p yoʻq)
      tpls.splice(ti, 1);
      try { await pushData(); } catch (_) { renderTemplates(); return; }
      if (rk) deleteFile('tpl', rk); // yetim R2 fayl qolmasin
      renderTemplates(); return;
    }
    if (act === 'add') {
      const n = prompt('Shablon nomi:'); if (!n || !n.trim()) return;
      const cat = (prompt('Boʻlim (masalan: Shartnomalar, Arizalar, Buyruqlar):', 'Umumiy') || 'Umumiy').trim() || 'Umumiy';
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
      inp.onchange = async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) { alert('Ruxsat: pdf, doc, docx, xls, xlsx, ppt, pptx'); return; }
        if (file.size > 200 * 1024 * 1024) { alert('Fayl 200MB dan katta'); return; }
        btn.classList.add('busy');
        busyOps++; // yuklash+saqlash davomida refreshData DATA'ni almashtirmasin
        const key = `shablonlar/${Date.now()}.${ext}`;
        let added = null;
        try {
          await uploadFile('tpl', key, file, file.type || 'application/octet-stream');
          added = { n: n.trim(), p: key, cat };
          (DATA.templates = DATA.templates || []).push(added); // massivni qayta oʻqiymiz
          await pushData(); renderTemplates();
        } catch (err) {
          alert('Yuklashda xatolik: ' + err.message); btn.classList.remove('busy');
          if (added) { // bazaga yozilmadi — RAMdagi yozuvni ham, R2'dagi yetim faylni ham olib tashlaymiz
            const arr = DATA.templates || [], ix = arr.indexOf(added);
            if (ix >= 0) arr.splice(ix, 1);
            deleteFile('tpl', key);
            renderTemplates();
          }
        } finally { busyOps--; }
      };
      inp.click(); return;
    }
  }
  app.addEventListener('click', handleTemplateClick);

  /* ---------- nav / routing ---------- */
  const CHART_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>';
  const ORDERS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
  const TPL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5z"/><path d="M15 2v5h5"/><path d="M8 12h6M8 16h4M8 8h2"/></svg>';

  function renderNav(activeId) {
    navEl.innerHTML =
      `<a class="dchip${activeId === 'stats' ? ' active' : ''}" href="#/statistika">${CHART_ICON}Statistika</a>` +
      `<a class="dchip${activeId === 'bday' ? ' active' : ''}" href="#/tugilgan-kunlar">${ICONS.cake}Tugʻilgan kunlar</a>` +
      `<a class="dchip${activeId === 'orders' ? ' active' : ''}" href="#/buyruqlar">${ORDERS_ICON}Hujjatlar</a>` +
      `<a class="dchip${activeId === 'tpl' ? ' active' : ''}" href="#/shablonlar">${TPL_ICON}Shablonlar</a>` +
      DATA.districts.map(d =>
        `<a class="dchip${d.id === activeId ? ' active' : ''}" href="#/hudud/${d.id}">${esc(d.name)}</a>`
      ).join('');
  }

  const loadbar = document.getElementById('loadbar');
  let firstRoute = true;
  function doRender() {
    const hash = location.hash || '#/';
    const mo = hash.match(/^#\/hudud\/([a-z]+)\/t\/(\d+)/);
    const m = hash.match(/^#\/hudud\/([a-z]+)/);
    app.classList.remove('page-in');
    void app.offsetWidth;
    if (mo) {
      renderNav(mo[1]);
      renderOrgDetail(mo[1], +mo[2]);
    } else if (m) {
      renderNav(m[1]);
      renderDistrict(m[1]);
    } else if (/^#\/statistika/.test(hash)) {
      renderNav('stats');
      renderStats();
    } else if (/^#\/tugilgan-kunlar/.test(hash)) {
      renderNav('bday');
      renderBirthdays();
    } else if (/^#\/buyruqlar/.test(hash)) {
      renderNav('orders');
      const bm = hash.match(/^#\/buyruqlar\/(\d+)/);
      renderOrders(bm ? +bm[1] : -1);
    } else if (/^#\/shablonlar/.test(hash)) {
      renderNav('tpl');
      renderTemplates();
    } else if (/^#\/jurnal/.test(hash)) {
      renderNav(null);
      renderAuditLog();
    } else {
      renderNav(null);
      renderHome();
    }
    app.classList.add('page-in');
    requestAnimationFrame(() => {
      loadbar.style.width = '100%';
      setTimeout(() => {
        loadbar.classList.remove('go');
        setTimeout(() => { loadbar.style.width = '0'; }, 320);
      }, 280);
    });
  }
  function route() {
    loadbar.classList.add('go');
    loadbar.style.width = '72%';
    window.scrollTo({ top: 0 });
    if (firstRoute) { firstRoute = false; doRender(); return; }
    // skeleton shimmer — qisqa yuklanish taassuroti
    app.innerHTML = `<div class="sk-wrap">
      <div class="sk sk-hero"></div>
      <div class="sk-grid">${'<div class="sk sk-card"></div>'.repeat(8)}</div>
    </div>`;
    setTimeout(doRender, 190);
  }

  window.addEventListener('hashchange', () => {
    searchInput.value = '';
    route();
  });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchInput.value;
      if (q.trim().length >= 2) { renderNav(null); renderSearch(q); }
      else route();
    }, 220);
  });

  // So'nggi qidiruvlar tarixi olib tashlandi — eski saqlangan yozuvlarni brauzerdan tozalaymiz
  try { localStorage.removeItem('recentq'); } catch (e) {}

  /* ---------- Tezkor klavishlar ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  app.addEventListener('click', e => {
    const btn = e.target.closest('[data-toggle]');
    if (btn) btn.nextElementSibling.classList.toggle('open');
    const sc = e.target.closest('[data-scroll]');
    if (sc) {
      e.preventDefault();
      const t = document.querySelector(sc.getAttribute('href'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  /* ---------- Boshqaruv paneli (drawer) ---------- */
  const drawer = document.getElementById('drawer');
  const menuBtn = document.getElementById('menuBtn');
  const overlay = document.getElementById('drawerOverlay');

  function setDrawer(open) {
    document.body.classList.toggle('drawer-open', open);
  }
  menuBtn.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
  overlay.addEventListener('click', () => setDrawer(false));
  document.getElementById('drawerClose').addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

  // statistika
  const tOrgs = DATA.districts.reduce((a, d) => a + d.orgs.length, 0);
  const tStaff = DATA.districts.reduce((a, d) => a + d.markaz.length, 0);
  document.getElementById('drawerStats').innerHTML = `
    <div class="ds"><b>${DATA.districts.length}</b><span>hudud</span></div>
    <div class="ds"><b>${tStaff}</b><span>xodim</span></div>
    <div class="ds"><b>${tOrgs}</b><span>tashkilot</span></div>`;

  // hudud havolalari — vazmin, professional plitkalar (shahar — oltin, tuman — ko'k)
  document.getElementById('drawerLinks').innerHTML = [
    { label: 'Shaharlar', items: DATA.districts.filter(isCity), city: true },
    { label: 'Tumanlar', items: DATA.districts.filter(d => !isCity(d)), city: false }
  ].map(g => `
    <div class="dl-group">${g.label}<i></i><b>${g.items.length}</b></div>
    ${g.items.map(d =>
      `<a href="#/hudud/${d.id}" data-did="${d.id}">
         <span class="dli ${g.city ? 'c' : 't'}">${g.city ? CITY_ICON : ICONS.pin}</span>
         <span class="dl-name">${esc(d.name)}</span>
         <span class="cnt">${d.orgs.length}</span>
       </a>`).join('')}`).join('');

  function updateDrawerActive() {
    const m = (location.hash || '').match(/^#\/hudud\/([a-z]+)/);
    document.querySelectorAll('#drawerLinks a').forEach(a =>
      a.classList.toggle('active', !!m && a.dataset.did === m[1]));
  }
  window.addEventListener('hashchange', updateDrawerActive);
  updateDrawerActive();
  document.getElementById('drawerLinks').addEventListener('click', () => setDrawer(false));
  document.getElementById('drawerNav').addEventListener('click', () => setDrawer(false));

  // qulayliklar
  const fontBtn = document.getElementById('toolFont');
  fontBtn.addEventListener('click', () => {
    const big = document.body.classList.toggle('big');
    fontBtn.lastChild.textContent = big ? ' Oddiy shrift' : ' Katta shrift';
    try { localStorage.setItem('bigfont', big ? '1' : ''); } catch (e) {}
  });
  try {
    if (localStorage.getItem('bigfont') === '1') {
      document.body.classList.add('big');
      fontBtn.lastChild.textContent = ' Oddiy shrift';
    }
  } catch (e) {}
  document.getElementById('toolCopy').addEventListener('click', function () {
    navigator.clipboard.writeText(location.href).then(() => {
      const old = this.lastChild.textContent;
      this.lastChild.textContent = ' Nusxalandi ✓';
      setTimeout(() => { this.lastChild.textContent = old; }, 1600);
    });
  });
  document.getElementById('toolTop').addEventListener('click', () => { setDrawer(false); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- Yuqoriga tugmasi ---------- */
  const toTop = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('show', window.scrollY > 500);
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- Tun/kun rejimi ---------- */
  const themeBtn = document.getElementById('themeBtn');
  function setTheme(dark) {
    document.body.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  }
  themeBtn.addEventListener('click', () => setTheme(!document.body.classList.contains('dark')));
  try { if (localStorage.getItem('theme') === 'dark') setTheme(true); } catch (e) {}

  /* ---------- Lotin ⇄ Kirill ---------- */
  const langBtn = document.getElementById('langBtn');
  const txtOrig = new WeakMap();

  function lat2cyr(s) {
    const map1 = { a:'а', b:'б', d:'д', f:'ф', g:'г', h:'ҳ', i:'и', j:'ж', k:'к', l:'л',
                   m:'м', n:'н', o:'о', p:'п', q:'қ', r:'р', s:'с', t:'т', u:'у', v:'в',
                   x:'х', z:'з', c:'ц', w:'в' };
    const AP = /[ʻʼ'`´’‘]/;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], cl = c.toLowerCase();
      const next = s[i + 1] || '', nl = next.toLowerCase();
      const isUp = c !== cl;
      const cs = r => isUp ? r.toUpperCase() : r;
      if ((cl === 'o' || cl === 'g') && AP.test(next)) { out += cs(cl === 'o' ? 'ў' : 'ғ'); i++; continue; }
      if (cl === 's' && nl === 'h') { out += cs('ш'); i++; continue; }
      if (cl === 'c' && nl === 'h') { out += cs('ч'); i++; continue; }
      if (cl === 'y') {
        if (nl === 'a') { out += cs('я'); i++; continue; }
        if (nl === 'o') { out += cs('ё'); i++; continue; }
        if (nl === 'u') { out += cs('ю'); i++; continue; }
        if (nl === 'e') { out += cs('е'); i++; continue; }
        out += cs('й'); continue;
      }
      if (cl === 'e') {
        const prev = s[i - 1] || '';
        out += cs(/[a-zA-Zа-яёўқғҳА-ЯЁЎҚҒҲ]/.test(prev) ? 'е' : 'э');
        continue;
      }
      if (AP.test(c)) {
        const prev = s[i - 1] || '';
        if (/[a-zA-Zа-яўқғҳА-ЯЎҚҒҲ]/.test(prev) && /[a-zA-Z]/.test(next)) { out += 'ъ'; continue; }
        out += c; continue;
      }
      if (map1[cl] !== undefined) { out += cs(map1[cl]); continue; }
      out += c;
    }
    return out;
  }

  function isCyr() {
    try { return localStorage.getItem('lang') === 'cyr'; } catch (e) { return false; }
  }

  function applyLang() {
    const cyr = isCyr();
    langBtn.textContent = cyr ? 'LAT' : 'КИР';
    document.documentElement.lang = cyr ? 'uz-Cyrl' : 'uz';
    const roots = [app, document.querySelector('.topbar'), drawer, document.querySelector('.footer'), document.querySelector('.qr-modal')];
    roots.forEach(root => {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        if (n.parentElement && n.parentElement.closest('script, style')) continue;
        if (cyr) {
          if (!txtOrig.has(n)) txtOrig.set(n, n.nodeValue);
          n.nodeValue = lat2cyr(txtOrig.get(n));
        } else if (txtOrig.has(n)) {
          n.nodeValue = txtOrig.get(n);
        }
      }
    });
    document.querySelectorAll('input[placeholder]').forEach(inp => {
      if (!inp.dataset.ph) inp.dataset.ph = inp.placeholder;
      inp.placeholder = cyr ? lat2cyr(inp.dataset.ph) : inp.dataset.ph;
    });
  }

  langBtn.addEventListener('click', () => {
    try { localStorage.setItem('lang', isCyr() ? 'lat' : 'cyr'); } catch (e) {}
    applyLang();
  });

  /* ---------- Excel (CSV) eksport ---------- */
  /* ---------- CSV import (tashkilotlarni ommaviy yangilash) ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ';') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  // CSV importни IKKI bosqichга ajratamiz: avval faqat REJA hisoblanadi (DATA oʻzgarmaydi),
  // foydalanuvchi tasdiqlagandan keyingina apply() mutatsiya qiladi. "Bekor" bosilsa hech nima oʻzgarmaydi.
  function importCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length || (rows[0][0] || '').toLowerCase().indexOf('hudud') === -1 && (rows[0][0] || '').toLowerCase().indexOf('ҳудуд') === -1)
      return { error: 'CSV sarlavhasi notoʻgʻri (Hudud ustuni topilmadi). Avval "Excel yuklab olish" bilan namuna oling.' };
    const nm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const eq = (a, b) => { const x = nm(a), y = nm(b); return x && (x === y || nm(lat2cyr(a)) === y || x === nm(lat2cyr(b))); };
    const tel = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean);
    const ops = [];
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r];
      const hudud = (c[0] || '').trim(), org = (c[2] || '').trim();
      if (!hudud || !org) continue;
      if (/yuridik xizmat|юридик хизмат/i.test(org)) continue; // markaz qatori
      const d = DATA.districts.find(x => eq(x.name, hudud));
      if (!d) continue;
      const rec = { fio: (c[3] || '').trim(), rtel: tel(c[4]), kfio: (c[5] || '').trim(), ktel: tel(c[6]), bfio: (c[7] || '').trim(), btel: tel(c[8]) };
      const existing = d.orgs.find(x => eq(x.org, org));
      ops.push({ d, existing, org, rec });
    }
    if (!ops.length) return { error: 'CSV da mos keladigan hudud/tashkilot qatori topilmadi.' };
    const updated = ops.filter(o => o.existing).length;
    const added = ops.length - updated;
    // Faqat boʻsh boʻlmagan kataklar yoziladi — mavjud maʼlumot boʻsh katak bilan oʻchmaydi
    const setRole = (o, role, fio, tels) => {
      if (!o[role]) o[role] = { fio: '', tel: [] };
      if (fio) o[role].fio = fio;
      if (tels.length) o[role].tel = tels;
    };
    const apply = () => {
      const touched = new Set();
      ops.forEach(({ d, existing, org, rec }) => {
        let o = existing;
        if (!o) { o = { org, r: { fio: '', tel: [] }, k: { fio: '', tel: [] }, b: { fio: '', tel: [] } }; d.orgs.push(o); }
        setRole(o, 'r', rec.fio, rec.rtel);
        setRole(o, 'k', rec.kfio, rec.ktel);
        setRole(o, 'b', rec.bfio, rec.btel);
        touched.add(d);
      });
      touched.forEach(d => d.orgs.forEach((o, i) => { o._di = d.id; o._oi = i; }));
    };
    return { updated, added, apply };
  }

  document.getElementById('toolExcel').addEventListener('click', () => {
    const m = (location.hash || '').match(/^#\/hudud\/([a-z]+)/);
    const dists = m ? DATA.districts.filter(d => d.id === m[1]) : DATA.districts;
    const cyr = isCyr();
    const T = s => cyr ? lat2cyr(s) : s;
    const Q = s => { let v = String(s ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }; // formula-injection guard
    const rows = [['Hudud', 'T/r', 'Tashkilot', 'Rahbar', 'Rahbar tel', 'Kadrlar boʻlimi', 'Kadr tel', 'Buxgalter', 'Buxgalter tel'].map(h => Q(T(h))).join(';')];
    dists.forEach(d => {
      d.orgs.forEach((o, i) => {
        rows.push([T(d.name), i + 1, T(o.org),
          T(o.r.fio), o.r.tel.join(', '), T(o.k.fio), o.k.tel.join(', '),
          T(o.b.fio), o.b.tel.join(', ')].map(Q).join(';'));
      });
      rows.push('');
      rows.push([T(d.center), '', '', '', '', '', '', '', ''].map(Q).join(';'));
      d.markaz.forEach((s, i) => {
        rows.push([T(d.name), i + 1, T('Yuridik xizmat markazi'), T(s.fio + ' (' + s.lavozim + ')'), s.tel.join(', '), '', '', '', ''].map(Q).join(';'));
      });
      rows.push('');
    });
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (m ? m[1] : 'navoiy-viloyati') + '-malumotnoma.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ---------- Xatolik haqida xabar ---------- */
  document.getElementById('toolReport').addEventListener('click', function () {
    this.href = 'mailto:mrsaidov221@gmail.com'
      + '?subject=' + encodeURIComponent('Maʼlumotnoma saytida xatolik')
      + '&body=' + encodeURIComponent('Sahifa: ' + location.href + '\n\nXatolik tavsifi:\n');
  });

  /* ---------- vCard va QR-kod ---------- */
  const qrModal = document.createElement('div');
  qrModal.className = 'qr-modal';
  qrModal.innerHTML = `<div class="qr-box">
    <h5 id="qrName"></h5>
    <div class="qr-tel" id="qrTel"></div>
    <div id="qrCanvas"></div>
    <div class="qr-hint">Telefon kamerasi bilan skanerlang — raqam avtomatik chiqadi</div>
    <button class="qr-close" id="qrClose">Yopish</button>
  </div>`;
  document.body.appendChild(qrModal);
  qrModal.addEventListener('click', e => {
    if (e.target === qrModal || e.target.id === 'qrClose') qrModal.classList.remove('open');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') qrModal.classList.remove('open'); });

  app.addEventListener('click', e => {
    const v = e.target.closest('[data-vcf]');
    if (v) {
      const fio = v.dataset.fio, pos = v.dataset.pos, tel = v.dataset.tel.replace(/\s/g, '');
      const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + fio,
        'ORG:Yuridik xizmat koʻrsatish markazi', 'TITLE:' + pos,
        'TEL;TYPE=CELL:' + tel, 'END:VCARD'].join('\r\n');
      const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fio.replace(/[^\wЀ-ӿ]+/g, '_') + '.vcf';
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    const q = e.target.closest('[data-qr]');
    if (q && window.QRCode) {
      const fio = q.dataset.fio, tel = q.dataset.tel;
      document.getElementById('qrName').textContent = isCyr() ? lat2cyr(fio) : fio;
      document.getElementById('qrTel').textContent = tel;
      const cv = document.getElementById('qrCanvas');
      cv.innerHTML = '';
      new QRCode(cv, { text: 'tel:' + tel.replace(/\s/g, ''), width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M });
      qrModal.classList.add('open');
    }
  });

  /* ---------- (2) Hududning kontaktlarini bir bosishda eksport (VCF / CSV) ---------- */
  function districtContacts(d) {
    const rows = [];
    d.markaz.forEach(s => {
      const fio = (s.fio || '').trim();
      if (!fio || /vakant/i.test(fio)) return;
      rows.push({ fio, role: (s.lavozim || 'Markaz xodimi'), org: 'Yuridik xizmat koʻrsatish markazi', tel: (s.tel || []).filter(Boolean) });
    });
    d.orgs.forEach(o => {
      [['r', 'Rahbar'], ['k', 'Kadrlar boʻlimi'], ['b', 'Buxgalter']].forEach(([role, lbl]) => {
        const p = o[role] || {}; const fio = (p.fio || '').trim();
        if (!fio || /vakant/i.test(fio)) return;
        rows.push({ fio, role: lbl, org: o.org, tel: (p.tel || []).filter(Boolean) });
      });
    });
    return rows;
  }
  function rowsToVCF(rows) {
    return rows.map(r => {
      const tels = r.tel.map(t => 'TEL;TYPE=CELL:' + String(t).replace(/\s/g, '')).filter(x => x.length > 13);
      return ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + r.fio, 'ORG:' + r.org, 'TITLE:' + r.role, ...tels, 'END:VCARD'].join('\r\n');
    }).join('\r\n');
  }
  function rowsToCSV(rows) {
    const q = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // formula-injection guard
    const head = ['F.I.O', 'Lavozim', 'Tashkilot', 'Telefon'].map(q).join(',');
    const body = rows.map(r => [r.fio, r.role, r.org, r.tel.join(' / ')].map(q).join(',')).join('\r\n');
    return '﻿' + head + '\r\n' + body;   // BOM — Excel UTF-8 ni toʻgʻri oʻqisin
  }
  function downloadBlob(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  app.addEventListener('click', e => {
    const ex = e.target.closest('[data-exp]');
    if (!ex) return;
    const d = DATA.districts.find(x => x.id === ex.dataset.d);
    if (!d) return;
    const rows = districtContacts(d);
    if (!rows.length) { alert('Eksport uchun kontakt topilmadi.'); return; }
    const base = (d.name || 'hudud').replace(/[^\wЀ-ӿ]+/g, '_') + '_kontaktlar';
    if (ex.dataset.exp === 'vcf') downloadBlob(base + '.vcf', new Blob([rowsToVCF(rows)], { type: 'text/vcard;charset=utf-8' }));
    else downloadBlob(base + '.csv', new Blob([rowsToCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  });

  /* ---------- (5) Tugʻilgan kun AI tabrigi ---------- */
  const greetModal = document.createElement('div');
  greetModal.className = 'qr-modal greet-modal';
  greetModal.innerHTML = `<div class="qr-box greet-box">
    <h5 id="greetName"></h5>
    <div class="greet-eyebrow">AI tugʻilgan kun tabrigi</div>
    <div class="greet-body" id="greetBody"></div>
    <div class="greet-acts">
      <button class="greet-btn primary" id="greetCopy" type="button">Nusxalash</button>
      <button class="greet-btn" id="greetRegen" type="button">Qayta yaratish</button>
      <button class="greet-btn" id="greetClose" type="button">Yopish</button>
    </div>
  </div>`;
  document.body.appendChild(greetModal);
  let greetCur = null;
  greetModal.addEventListener('click', e => { if (e.target === greetModal || e.target.id === 'greetClose') greetModal.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') greetModal.classList.remove('open'); });
  async function genGreeting() {
    const b = document.getElementById('greetBody');
    b.innerHTML = '<div class="greet-load"><i></i><i></i><i></i></div>';
    const copyBtn = document.getElementById('greetCopy'); copyBtn.disabled = true;
    try {
      const { data: { session } } = await authCtx.client.auth.getSession();
      const res = await fetch(CFG.url + '/functions/v1/chat', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'bday', payload: { name: greetCur.name, role: greetCur.role, district: greetCur.dist, alpha: isCyr() ? 'cyr' : 'lat' } })
      });
      const data = await res.json();
      if (data.answer) { b.textContent = data.answer; copyBtn.disabled = false; }
      else b.innerHTML = `<span class="greet-err">${esc(data.error || 'Xatolik yuz berdi.')}</span>`;
    } catch (e) { b.innerHTML = '<span class="greet-err">Ulanishda xatolik.</span>'; }
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-greet]');
    if (g) {
      greetCur = { name: g.dataset.name, role: g.dataset.role, dist: g.dataset.dist };
      document.getElementById('greetName').textContent = isCyr() ? lat2cyr(greetCur.name) : greetCur.name;
      greetModal.classList.add('open');
      genGreeting();
      return;
    }
    if (e.target.closest('#greetRegen')) { if (greetCur) genGreeting(); return; }
    if (e.target.closest('#greetCopy')) {
      const txt = document.getElementById('greetBody').textContent || '';
      if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { const c = document.getElementById('greetCopy'); c.textContent = 'Nusxalandi'; setTimeout(() => c.textContent = 'Nusxalash', 1600); }).catch(() => {});
      return;
    }
  });

  /* ---------- (3) Maʼlumot tekshiruvi — saqlash + AI tekshiruv ---------- */
  app.addEventListener('click', async e => {
    const sv = e.target.closest('[data-dvsave]');
    if (sv) {
      const x = DV_ISSUES[+sv.dataset.dvsave]; if (!x) return;
      const row = sv.closest('.dv-row'); const val = row.querySelector('.dv-in').value.trim();
      if (!val) { alert('Raqam boʻsh boʻlishi mumkin emas.'); return; }
      if (!phoneValid(val) && !confirm('Bu raqam ham standart formatда emas (9 yoki 998+9 xona). Baribir saqlansinmi?')) return;
      const d = DATA.districts.find(z => z.id === x.did); if (!d) return;
      if (x.t === 'staff') d.markaz[x.si].tel[x.ti] = val; else d.orgs[x.oi][x.role].tel[x.ti] = val;
      sv.disabled = true; sv.textContent = '...';
      try { await saveData(x.did); row.classList.add('dv-done'); sv.textContent = 'Saqlandi'; }
      catch (err) { sv.disabled = false; sv.textContent = 'Saqlash'; alert('Saqlashda xatolik.'); }
      return;
    }
    const ap = e.target.closest('[data-dvapply]');
    if (ap) { const row = ap.closest('.dv-row'); if (row) row.querySelector('.dv-in').value = ap.dataset.val; return; }
    const ai = e.target.closest('#dvAi');
    if (ai) {
      ai.disabled = true; const old = ai.textContent; ai.textContent = 'Tekshirilmoqda...';
      try {
        const { data: { session } } = await authCtx.client.auth.getSession();
        const items = DV_ISSUES.map((x, i) => ({ id: i, kind: 'phone', value: x.value, context: x.ctx }));
        const res = await fetch(CFG.url + '/functions/v1/chat', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'fixdata', payload: { items } })
        });
        const data = await res.json();
        (data.suggestions || []).forEach(s => {
          const sug = document.querySelector(`[data-dvsug="${s.id}"]`); if (!sug) return;
          // XAVFSIZLIK: taklif faqat haqiqatan toʻgʻri formatда (9 yoki 998+9 xona) boʻlsagina «qoʻllash» sifatida koʻrsatiladi.
          // AI notoʻgʻri uzunlikdagi raqamni «qayta formatlagan» boʻlsa — qoʻllash berilmaydi, qoʻlda tuzatishga yoʻnaltiriladi.
          if (s.status === 'reformat' && s.suggestion && phoneValid(s.suggestion))
            sug.innerHTML = `<button class="dv-apply" type="button" data-dvapply="${s.id}" data-val="${esc(s.suggestion)}">${esc(s.suggestion)}</button>`;
          else if (s.status === 'suspect') sug.innerHTML = `<span class="dv-flag">${esc(s.note || 'shubhali')}</span>`;
          else sug.innerHTML = '<span class="dv-flag">qoʻlda tuzating</span>';
        });
        ai.disabled = false; ai.textContent = old;
      } catch (err) { ai.disabled = false; ai.textContent = old; alert('AI tekshiruvда xatolik.'); }
      return;
    }
  });

  /* ---------- Parallax (sichqoncha) ---------- */
  if (fine) {
    const scene = document.querySelector('.bg-scene');
    const grid = document.querySelector('.bg-grid');
    let pRaf = null;
    document.addEventListener('mousemove', e => {
      if (pRaf) return;
      pRaf = requestAnimationFrame(() => {
        pRaf = null;
        const nx = e.clientX / innerWidth - .5;
        const ny = e.clientY / innerHeight - .5;
        scene.style.transform = `translate3d(${nx * -28}px, ${ny * -20}px, 0)`;
        grid.style.transform = `translate3d(${nx * 14}px, ${ny * 10}px, 0)`;
        const hr = app.querySelector('.hero-right');
        if (hr) hr.style.transform = `translate3d(${nx * 22}px, ${ny * 16}px, 0)`;
      });
    }, { passive: true });
  }

  /* ---------- Magnit tugmalar ---------- */
  if (fine) {
    document.addEventListener('pointermove', e => {
      const m = e.target.closest('.magnet, .btn-main, .btn-ghost');
      if (!m) return;
      const r = m.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - .5;
      const dy = (e.clientY - r.top) / r.height - .5;
      m.style.transform = `translate(${(dx * 9).toFixed(1)}px, ${(dy * 7).toFixed(1)}px) scale(1.045)`;
    });
    document.addEventListener('pointerout', e => {
      const m = e.target.closest('.magnet, .btn-main, .btn-ghost');
      if (m && !m.contains(e.relatedTarget)) m.style.transform = '';
    }, true);
  }

  /* ---------- Admin (tahrirlash) rejimi ---------- */
  const adminBtn = document.getElementById('adminBtn');

  function setAdmin(on) {
    document.body.classList.toggle('admin', on);
    try { sessionStorage.setItem('admin', on ? '1' : ''); } catch (e) {}
    adminBtn.lastChild.textContent = on ? ' Admin: chiqish' : ' Admin rejimi';
  }
  adminBtn.addEventListener('click', () => {
    if (document.body.classList.contains('admin')) { setAdmin(false); return; }
    // Tahrirlash huquqi FAQAT autentifikatsiya + profil orqali beriladi (server tomonda ham majburlanadi).
    if (authCtx && (SUPER || MYDID)) { setAdmin(true); setDrawer(false); }
    else alert('Sizda tahrirlash huquqi yoʻq. Administratorga murojaat qiling.');
  });
  // Admin rejimini faqat huquqi bor autentifikatsiyalangan foydalanuvchi uchun tiklaymiz
  try { if (sessionStorage.getItem('admin') === '1' && authCtx && (SUPER || MYDID)) setAdmin(true); } catch (e) {}

  // Server rejimida: chiqish tugmasi + foydalanuvchi belgisi
  if (authCtx) {
    const out = document.createElement('button');
    out.className = 'tool-btn full';
    out.innerHTML = '<span class="ti r"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg></span>'
      + ' Chiqish' + (authCtx.profile ? ' (' + esc(authCtx.profile.login) + ')' : '');
    out.addEventListener('click', async () => {
      await authCtx.client.auth.signOut();
      location.reload();
    });
    document.getElementById('toolReport').after(out);
    document.getElementById('adminReset').style.display = 'none';
  }

  const adminBadge = document.createElement('div');
  adminBadge.className = 'admin-badge';
  adminBadge.innerHTML = EDIT_ICON.replace('<svg ', '<svg width="12" height="12" ') + ' ADMIN REJIMI';
  document.body.appendChild(adminBadge);

  // tahrirlash modali
  const editModal = document.createElement('div');
  editModal.className = 'qr-modal';
  editModal.innerHTML = `<div class="qr-box">
    <h5 style="margin-bottom:12px">Maʼlumotni tahrirlash</h5>
    <div class="edit-form">
      <div class="edit-photo" id="editPhotoRow" hidden>
        <div class="ep-prev" id="epPrev"></div>
        <div class="ep-side">
          <button type="button" class="ep-btn" id="epUpload">Rasm yuklash</button>
          <button type="button" class="ep-del" id="epDel">Rasmni oʻchirish</button>
          <span class="ep-hint" id="epHint">JPG/PNG · ≤5MB</span>
        </div>
        <input type="file" id="epFile" accept="image/*" hidden>
      </div>
      <label>F.I.O.<input id="editFio" autocomplete="off"></label>
      <label>Telefon(lar) — vergul bilan<input id="editTel" autocomplete="off" placeholder="+998 90 123 45 67"></label>
      <div class="edit-actions">
        <button class="ghost" id="editCancel">Bekor</button>
        <button class="qr-close" id="editSave">Saqlash</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(editModal);
  let editTarget = null;

  app.addEventListener('click', e => {
    const eb = e.target.closest('[data-edit]');
    if (!eb) return;
    e.preventDefault(); e.stopPropagation();
    const d = DATA.districts.find(x => x.id === eb.dataset.d);
    if (!d) return;
    let obj;
    if (eb.dataset.edit === 'org') obj = d.orgs[+eb.dataset.i][eb.dataset.role];
    else obj = d.markaz[+eb.dataset.i];
    editTarget = { type: eb.dataset.edit, di: eb.dataset.d, i: +eb.dataset.i, role: eb.dataset.role, obj };
    document.getElementById('editFio').value = obj.fio || '';
    document.getElementById('editTel').value = (obj.tel || []).join(', ');
    // Rasm — faqat markaz xodimi va server (admin) rejimida
    const photoRow = document.getElementById('editPhotoRow');
    if (eb.dataset.edit === 'staff' && authCtx) {
      photoRow.hidden = false;
      renderEpPrev(obj.photo);
    } else {
      photoRow.hidden = true;
    }
    editModal.classList.add('open');
  }, true);

  /* ---------- Rasm yuklash (Supabase Storage) ---------- */
  function renderEpPrev(url) {
    const p = document.getElementById('epPrev');
    p.innerHTML = url
      ? `<img src="${esc(url)}" alt="">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>`;
  }
  if (authCtx) {
    document.getElementById('epUpload').addEventListener('click', () => document.getElementById('epFile').click());
    document.getElementById('epDel').addEventListener('click', () => {
      if (editTarget) { editTarget.obj.photo = ''; renderEpPrev(''); }
    });
    document.getElementById('epFile').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file || !editTarget) return;
      const hint = document.getElementById('epHint');
      if (file.size > 5 * 1024 * 1024) { hint.textContent = 'Fayl 5MBdan katta!'; return; }
      hint.textContent = 'Tayyorlanmoqda...';
      try {
        const blob = await resizeImage(file, 500);
        hint.textContent = 'Yuklanmoqda...';
        const path = `${editTarget.di}-${editTarget.i}-${Date.now()}.jpg`;
        const up = await uploadFile('photo', path, blob, 'image/jpeg');
        editTarget.obj.photo = up.url;
        renderEpPrev(up.url);
        hint.textContent = 'Yuklandi ✓ (Saqlashni bosing)';
      } catch (err) { hint.textContent = 'Xato: ' + err.message; }
      e.target.value = '';
    });
  }
  // Rasmni canvas orqali kichraytirib JPEG qilish (tezkor yuklash)
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => b ? resolve(b) : reject(new Error('canvas')), 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('rasm oʻqilmadi'));
      img.src = URL.createObjectURL(file);
    });
  }

  editModal.addEventListener('click', async e => {
    if (e.target === editModal || e.target.id === 'editCancel') editModal.classList.remove('open');
    if (e.target.id === 'editSave' && editTarget) {
      const fio = document.getElementById('editFio').value.trim();
      const tel = document.getElementById('editTel').value.split(',').map(s => s.trim()).filter(Boolean);
      const prevFio = editTarget.obj.fio, prevTel = editTarget.obj.tel; // xatoda tiklash uchun
      editTarget.obj.fio = fio;
      editTarget.obj.tel = tel;
      if (authCtx) {
        const btn = document.getElementById('editSave'); btn.disabled = true;
        try {
          await saveData(editTarget.di); // xatoda throw qiladi
        } catch (_) {
          editTarget.obj.fio = prevFio; editTarget.obj.tel = prevTel; // saqlanmadi — tiklaymiz
          btn.disabled = false; return; // modal ochiq qoladi, foydalanuvchi qayta urinadi (xato alert saveData'da)
        }
        btn.disabled = false;
      } else {
        const ov = getOverrides();
        const key = editTarget.type === 'org'
          ? `org|${editTarget.di}|${editTarget.i}|${editTarget.role}`
          : `staff|${editTarget.di}|${editTarget.i}`;
        ov[key] = { fio, tel };
        try { localStorage.setItem('overrides', JSON.stringify(ov)); } catch (e2) {}
      }
      editModal.classList.remove('open');
      route();
    }
  });

  /* ---------- Tashkilot qoʻshish / oʻchirish (admin) ---------- */
  function reindexOrgs(d) { d.orgs.forEach((o, i) => { o._di = d.id; o._oi = i; }); }

  app.addEventListener('click', async e => {
    if (!authCtx || !document.body.classList.contains('admin')) return;
    const del = e.target.closest('[data-orgdel]');
    const add = e.target.closest('#orgAddBtn');
    if (del) {
      e.preventDefault(); e.stopPropagation();
      if (!CANEDIT(del.dataset.d)) return;
      const d = DATA.districts.find(x => x.id === del.dataset.d);
      const o = d && d.orgs[+del.dataset.i];
      if (!o) return;
      if (!confirm(`"${o.org}" tashkiloti oʻchirilsinmi? Bu amalni qaytarib boʻlmaydi.`)) return;
      d.orgs.splice(+del.dataset.i, 1);
      reindexOrgs(d);
      await saveData(d.id);
      route();
    }
    if (add) {
      e.preventDefault(); e.stopPropagation();
      if (!CANEDIT(add.dataset.d)) return;
      const d = DATA.districts.find(x => x.id === add.dataset.d);
      if (!d) return;
      const name = prompt('Yangi tashkilot nomi (masalan: 50-maktab yoki Soliq boʻlimi):');
      if (!name || !name.trim()) return;
      d.orgs.push({ org: name.trim(), r: { fio: '', tel: [] }, k: { fio: '', tel: [] }, b: { fio: '', tel: [] } });
      reindexOrgs(d);
      await saveData(d.id);
      location.hash = `#/hudud/${d.id}/t/${d.orgs.length - 1}`;
    }
  }, true);

  /* ---------- Hujjat (PDF) tahrirlash: almashtirish / oʻchirish / qoʻshish ---------- */
  let docCtx = null;
  const docFileInput = document.createElement('input');
  docFileInput.type = 'file'; docFileInput.accept = 'application/pdf'; docFileInput.hidden = true;
  document.body.appendChild(docFileInput);

  app.addEventListener('click', async e => {
    if (!authCtx || !document.body.classList.contains('admin')) return;
    const rep = e.target.closest('[data-docreplace]');
    const rem = e.target.closest('[data-docremove]');
    const add = e.target.closest('[data-docadd]');
    if (rep) {
      e.preventDefault(); e.stopPropagation();
      docCtx = { mode: 'replace', key: rep.dataset.key };
      docFileInput.click();
    } else if (add) {
      e.preventDefault(); e.stopPropagation();
      const di = add.dataset.di, oi = +add.dataset.oi;
      if (!CANEDIT(di)) return;
      const types = { '1': ['jamoa', null], '2': ['ichki', null], '3': ['tatil', null] };
      const ch = prompt('Hujjat turi raqamini kiriting:\n1 — Jamoa shartnomasi\n2 — Ichki tartib qoidalari\n3 — Taʼtillar jadvali\n4 — Boshqa (nom yoziladi)');
      if (ch === null) return;
      let t = 'boshqa', n = null; // '4/Boshqa' uchun neytral tur — monitoring uni majburiy 'tatil' deb sanamaydi
      if (types[ch]) { t = types[ch][0]; }
      else { n = prompt('Hujjat nomi:'); if (!n || !n.trim()) return; n = n.trim(); }
      docCtx = { mode: 'add', di, oi, t, n, key: `${di}/${oi}_${t}_${Date.now()}.pdf` };
      docFileInput.click();
    } else if (rem) {
      e.preventDefault(); e.stopPropagation();
      const di = rem.dataset.di, oi = +rem.dataset.oi, dci = +rem.dataset.dci;
      if (!CANEDIT(di)) return;
      const d = DATA.districts.find(x => x.id === di);
      const o = d && d.orgs[oi];
      if (!o || !o.docs || !o.docs[dci]) return;
      if (!confirm('Bu hujjat roʻyxatdan oʻchirilsinmi?')) return;
      const removedKey = o.docs[dci].p; // R2 kaliti — saqlangach oʻchiramiz
      o.docs.splice(dci, 1);
      try { await saveData(di); } catch (_) { route(); return; }
      if (removedKey) deleteFile('doc', removedKey); // yetim fayl qolmasin
      route();
    }
  }, true);

  docFileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !docCtx) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { alert('Faqat PDF fayl yuklanadi'); docCtx = null; return; }
    if (file.size > 200 * 1024 * 1024) { alert('Fayl 200MB dan katta'); docCtx = null; return; }
    const ctx = docCtx; docCtx = null;
    busyOps++; // yuklash+saqlash davomida refreshData DATA'ni almashtirmasin (ctx.oi eskirmasin)
    try {
      await uploadFile('doc', ctx.key, file, 'application/pdf');
      if (ctx.mode === 'add') {
        const d = DATA.districts.find(x => x.id === ctx.di);
        const o = d && d.orgs[ctx.oi];
        if (!o) return;
        if (!o.docs) o.docs = [];
        const doc = { p: ctx.key, t: ctx.t };
        if (ctx.n) doc.n = ctx.n;
        o.docs.push(doc);
        await saveData(ctx.di);
        alert('Hujjat qoʻshildi ✓');
        route();
      } else {
        alert('PDF almashtirildi ✓');
        loadDocLinks();
      }
    } catch (err) { alert('Yuklashda xatolik: ' + err.message); }
    finally { busyOps--; }
  });

  // data.js eksport (tahrirlangan holatda)
  // TOʻLIQ zaxira nusxa: hududlar + eʼlon + buyruqlar + shablonlar (hujjat yoʻllari ham ichida).
  // Serverdagi avtomatik zaxiraga (site_data_backup) qoʻshimcha — qoʻlda saqlab qoʻyish uchun.
  document.getElementById('adminExport').addEventListener('click', () => {
    const snap = stripD({
      districts: DATA.districts,
      announcement: DATA.announcement || null,
      buyruqlar: DATA.buyruqlar || null,
      templates: DATA.templates || null
    });
    snap._exportedAt = new Date().toISOString();
    snap._by = (authCtx && authCtx.profile && authCtx.profile.login) || 'admin';
    const blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `navoiy-zaxira-${snap._exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Zaxira nusxa yuklab olindi ✓');
  });

  document.getElementById('adminReset').addEventListener('click', () => {
    if (confirm('Barcha mahalliy tahrirlar bekor qilinsinmi?')) {
      localStorage.removeItem('overrides');
      location.reload();
    }
  });

  /* ---------- Admin: foydalanuvchilar boshqaruvi ---------- */
  if (authCtx && authCtx.profile && authCtx.profile.is_admin) {
    const uBtn = document.getElementById('adminUsers');
    uBtn.hidden = false;
    const logBtn = document.getElementById('adminLog');
    if (logBtn) { logBtn.hidden = false; logBtn.addEventListener('click', () => setDrawer(false)); }

    /* E'lon (banner) boshqaruvi */
    const annBtn = document.getElementById('adminAnnounce');
    annBtn.hidden = false;
    annBtn.addEventListener('click', async () => {
      const cur = DATA.announcement?.text || '';
      const txt = prompt('Eʼlon matni (barcha xodimlar koʻradi). Boʻsh qoldirsangiz — eʼlon oʻchiriladi:', cur);
      if (txt === null) return;
      DATA.announcement = txt.trim() ? { text: txt.trim(), ts: Date.now() } : null;
      await pushData();
      try { localStorage.removeItem('annDismissed'); } catch (e) {}
      showAnnouncement();
      setDrawer(false);
    });

    /* Excel (CSV) yuklash — tashkilotlarni ommaviy yangilash */
    const impBtn = document.getElementById('adminImport');
    impBtn.hidden = false;
    const impFile = document.getElementById('importFile');
    impBtn.addEventListener('click', () => impFile.click());
    impFile.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      e.target.value = '';
      const res = importCSV(text);
      if (res.error) { alert('Xato: ' + res.error); return; }
      if (!confirm(`CSV oʻqildi:\n• ${res.updated} ta tashkilot yangilanadi\n• ${res.added} ta yangi qoʻshiladi\nDavom etilsinmi?`)) return; // Bekor => DATA oʻzgармаган
      res.apply(); // mutatsiya faqat tasdiqдан keyin
      try { await pushData(); } catch (err) { route(); return; } // xato pushData ichida koʻrsatiladi
      alert(`Tayyor! ${res.updated} yangilandi, ${res.added} qoʻshildi.`);
      route();
    });

    const modal = document.getElementById('umModal');
    const msg = document.getElementById('umMsg');
    const listPane = document.getElementById('umList');

    async function callAdmin(action, payload) {
      const { data: { session } } = await authCtx.client.auth.getSession();
      const res = await fetch(CFG.url + '/functions/v1/admin', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      return res.json();
    }
    function showMsg(text, ok) {
      msg.textContent = text; msg.className = 'um-msg ' + (ok ? 'ok' : 'err'); msg.hidden = false;
      setTimeout(() => { msg.hidden = true; }, 4000);
    }
    let allUsers = [];
    function renderList(filter) {
      const f = (filter || '').toLowerCase();
      const items = allUsers.filter(u => !f || (u.fio + ' ' + u.login + ' ' + (u.district||'')).toLowerCase().includes(f));
      listPane.innerHTML = '<input class="um-search" id="umSearch" placeholder="Qidirish: ism, login, hudud...">' +
        items.map(u => `<div class="um-row${u.is_admin ? ' adm' : ''}">
          <span class="ui">${esc((u.fio||'?')[0])}</span>
          <span class="uinfo"><b>${esc(u.fio)}</b><span>${esc(u.login)} · ${esc(u.district||'')}${u.is_admin?' · admin':''}</span></span>
          <span class="uact">
            <button class="pwd" data-login="${esc(u.login)}" title="Parol oʻzgartirish">🔑</button>
            ${u.login !== 'admin' ? `<button class="del" data-login="${esc(u.login)}" data-fio="${esc(u.fio)}" title="Oʻchirish">🗑</button>` : ''}
          </span>
        </div>`).join('');
      const s = document.getElementById('umSearch');
      if (s) { s.value = filter || ''; s.oninput = () => renderList(s.value); if (filter) s.focus(); }
    }
    async function loadUsers() {
      listPane.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px">Yuklanmoqda...</div>';
      const r = await callAdmin('list');
      allUsers = r.users || [];
      renderList('');
    }

    uBtn.addEventListener('click', () => { setDrawer(false); modal.hidden = false; loadUsers(); });
    document.getElementById('umClose').addEventListener('click', () => modal.hidden = true);
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

    modal.querySelectorAll('.um-tab').forEach(t => t.addEventListener('click', () => {
      modal.querySelectorAll('.um-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('umList').hidden = t.dataset.tab !== 'list';
      document.getElementById('umAdd').hidden = t.dataset.tab !== 'add';
    }));

    listPane.addEventListener('click', async e => {
      const pwd = e.target.closest('.pwd');
      const del = e.target.closest('.del');
      if (pwd) {
        const np = prompt(`"${pwd.dataset.login}" uchun yangi parol (kamida 6 belgi):`);
        if (!np) return;
        const r = await callAdmin('setPassword', { login: pwd.dataset.login, password: np });
        showMsg(r.msg || r.error, !!r.ok);
      }
      if (del) {
        if (!confirm(`"${del.dataset.fio}" (${del.dataset.login}) oʻchirilsinmi? Bu xodim endi kira olmaydi.`)) return;
        const r = await callAdmin('removeUser', { login: del.dataset.login });
        showMsg(r.msg || r.error, !!r.ok);
        if (r.ok) loadUsers();
      }
    });

    // Hudud roʻyxatini bazadagi ANIQ nomlar bilan toʻldiramiz — qoʻlda yozishdagi bitta xato
    // harf xodimni jimgina huquqsiz qoldirardi (staff-edit hududni NOM boʻyicha topadi).
    (function fillDistricts() {
      const sel = document.getElementById('umDist');
      if (!sel || sel.options.length > 1) return;
      DATA.districts.forEach(d => { const o = document.createElement('option'); o.value = d.name; o.textContent = d.name; sel.appendChild(o); });
    })();

    document.getElementById('umAddBtn').addEventListener('click', async function () {
      const payload = {
        fio: document.getElementById('umFio').value.trim(),
        district: document.getElementById('umDist').value.trim(),
        lavozim: document.getElementById('umPos').value.trim(),
        login: document.getElementById('umLogin').value.trim().toLowerCase(),
        password: document.getElementById('umPass').value,
        is_admin: document.getElementById('umAdminChk').checked
      };
      this.disabled = true;
      const r = await callAdmin('addUser', payload);
      this.disabled = false;
      showMsg(r.msg || r.error, !!r.ok);
      if (r.ok) {
        ['umFio','umDist','umPos','umLogin','umPass'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('umAdminChk').checked = false;
        modal.querySelector('.um-tab[data-tab=list]').click();
        loadUsers();
      }
    });
  }

  /* ---------- AI yordamchi chat ---------- */
  (function initAiChat() {
    const fab = document.getElementById('aiFab');
    const panel = document.getElementById('aiPanel');
    const body = document.getElementById('aiBody');
    const form = document.getElementById('aiForm');
    const input = document.getElementById('aiText');
    if (!fab) return;

    // AI faqat server (login) rejimida ishlaydi (Gemini chat + Lex AI tashqi tugma)
    if (!authCtx) { fab.style.display = 'none'; panel.style.display = 'none'; return; }

    const hist = [];
    fab.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      document.body.classList.toggle('ai-open', open);
      if (open) setTimeout(() => input.focus(), 100);
    });

    document.getElementById('aiChips').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) { input.value = b.textContent; form.requestSubmit(); }
    });

    function addMsg(text, cls) {
      const chips = document.getElementById('aiChips');
      if (chips) chips.remove();
      const d = document.createElement('div');
      d.className = 'ai-msg ' + cls;
      if (cls === 'bot') {
        // telefon raqamlarni interaktiv qilish (+998 XX XXX XX XX)
        const re = /\+998[\s\d]{9,13}\d/g;
        let last = 0, m;
        while ((m = re.exec(text)) !== null) {
          if (m.index > last) d.appendChild(document.createTextNode(text.slice(last, m.index)));
          const tel = m[0].trim();
          const pill = document.createElement('span');
          pill.className = 'ai-tel';
          pill.innerHTML = `<a href="${telHref(tel)}">${esc(tel)}</a>`
            + `<button data-copy="${esc(tel.replace(/\s/g,''))}" title="Nusxalash">📋</button>`;
          d.appendChild(pill);
          last = m.index + m[0].length;
        }
        if (last < text.length) d.appendChild(document.createTextNode(text.slice(last)));
      } else {
        d.textContent = text;
      }
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      return d;
    }
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (b) {
        navigator.clipboard.writeText(b.dataset.copy);
        const o = b.textContent; b.textContent = '✓';
        setTimeout(() => { b.textContent = o; }, 1200);
      }
    });

    // Ovozli savol — Web Speech API (brauzer ichida, bepul)
    const mic = document.getElementById('aiMic');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      mic.style.display = 'none';
    } else {
      let rec = null, listening = false;
      mic.addEventListener('click', () => {
        if (listening) { rec && rec.stop(); return; }
        rec = new SR();
        rec.lang = isCyr() ? 'uz-UZ' : 'uz-UZ';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onstart = () => { listening = true; mic.classList.add('rec'); input.placeholder = 'Tinglanmoqda...'; };
        rec.onresult = e => {
          let t = '';
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          input.value = t;
        };
        rec.onerror = () => { input.placeholder = 'Ovoz tanilmadi, qayta urining'; };
        rec.onend = () => {
          listening = false; mic.classList.remove('rec');
          input.placeholder = 'Savolingizni yozing...';
          if (input.value.trim()) form.requestSubmit();
        };
        try { rec.start(); } catch (e) {}
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      addMsg(q, 'user');
      hist.push({ role: 'user', text: q });

      const typing = document.createElement('div');
      typing.className = 'ai-msg bot typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      // Hujjat ichidan javob biroz vaqt olishi mumkin — kutishda belgi
      const DOC_HINT = /jamoa|shartnoma|ichki tartib|qoida|tatil|otpusk|jadval|grafik|hujjat|modda|band|dam olish/i;
      let hintT = null;
      if (DOC_HINT.test(q)) hintT = setTimeout(() => {
        if (typing.isConnected) typing.innerHTML = '<span class="ai-think">Hujjat oʻqilmoqda, biroz kuting…</span>';
      }, 3500);

      try {
        const { data: { session } } = await authCtx.client.auth.getSession();
        const res = await fetch(CFG.url + '/functions/v1/chat', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + session.access_token,
            'apikey': CFG.anonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ question: q, history: hist.slice(0, -1) })
        });
        const data = await res.json();
        if (hintT) clearTimeout(hintT);
        typing.remove();
        const ans = data.answer || data.error || 'Javob olinmadi.';
        addMsg(ans, 'bot');
        // Manba (qaysi hujjatdan) — ishonch uchun
        if (data.answer && Array.isArray(data.source) && data.source.length) {
          const s = document.createElement('div');
          s.className = 'ai-msg bot ai-src';
          s.textContent = 'Manba: ' + data.source.join('; ');
          body.appendChild(s);
          body.scrollTop = body.scrollHeight;
        }
        if (data.answer) hist.push({ role: 'model', text: data.answer });
      } catch (err) {
        if (hintT) clearTimeout(hintT);
        typing.remove();
        addMsg('Ulanishda xatolik. Internetni tekshiring.', 'bot');
      }
    });
  })();

  route();
  showAnnouncement();
  }

  bootstrap();
})();
