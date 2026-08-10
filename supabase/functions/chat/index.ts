// Navoiy yuridik — AI yordamchi (Gemini orqali)
// 2 rejim: (1) ma'lumotnoma (ism/raqam/tashkilot) — flash-lite;
//          (2) HUJJAT bo'yicha savol — savol muayyan tashkilot hujjati haqida bo'lsa,
//              o'sha PDF R2'dan olinib Gemini'ga beriladi (skanni ham o'qiydi) — flash.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const KEY = () => Deno.env.get("GEMINI_API_KEY")!;
const gUrl = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

const R2_ACCOUNT = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const aws = new AwsClient({ accessKeyId: Deno.env.get("R2_ACCESS_KEY")!, secretAccessKey: Deno.env.get("R2_SECRET_KEY")!, region: "auto", service: "s3" });

// Kirill -> lotin + apostroflarni olib tashlash (qidiruv uchun)
const C2L: Record<string, string> = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','қ':'q','ғ':'g','ҳ':'h','ў':'o','ъ':'','ь':'','э':'e','ю':'yu','я':'ya','ы':'i' };
function norm(s: string) { return String(s || "").toLowerCase().split("").map((c) => C2L[c] ?? c).join("").replace(/[ʻ'`’]/g, ""); }

const DOC_KW = /jamoa|shartnoma|ichki|tartib|qoida|tatil|otpusk|jadval|grafik|hujjat|modda|\bband\b|ish vaqti|dam olish|mehnat|reestr|lavozim/;
const DEPT_KW: Record<string, string[]> = {
  tibbiyot: ["tibbiyot", "soglik", "shifoxona"], moliya: ["moliya", "iqtisod"], veterinariya: ["veterinar", "chorvachilik"],
  madaniyat: ["madaniyat"], sanitariya: ["sanitariya", "ses", "epidemiolog"], bandlik: ["bandli"], soliq: ["soliq"],
  obodon: ["obodon"], yoshlar: ["yoshlar"], suv: ["suv xo", "irrigatsiya"], ormon: ["rmon"], mmtb: ["maktabgacha va maktab", "mmtb", "mmt"],
  poliklinika: ["poliklinika", "oilaviy"], maskan: ["nurli maskan", "maskan"], oila: ["oila", "xotin qiz"], qishloq: ["qishloq xo", "dehqon"],
};
function docLabel(dc: any) { return dc?.n || ({ jamoa: "Jamoa shartnomasi", ichki: "Ichki tartib qoidalari", tatil: "Taʼtillar jadvali" }[dc?.t as string] || dc?.t); }

// Savoldan: qaysi tuman + tashkilot + hujjat turi -> mos hujjatlar (max 2)
function findDocs(data: any, question: string): { p: string; label: string; org: string; district: string }[] {
  const q = norm(question);
  if (!DOC_KW.test(q)) return [];
  let dtype: string | null = null;
  if (/jamoa|shartnoma/.test(q)) dtype = "jamoa";
  else if (/ichki|tartib|qoida|reestr|lavozim/.test(q)) dtype = "ichki";
  else if (/tatil|otpusk|jadval|grafik|dam olish/.test(q)) dtype = "tatil";

  let districts = (data.districts || []).filter((d: any) => q.includes(d.id) || q.includes(norm(d.name).split(" ")[0]));
  if (!districts.length) districts = data.districts || [];

  const out: { p: string; label: string; org: string; district: string }[] = [];
  const seen = new Set<string>();
  for (const d of districts) {
    for (const o of (d.orgs || [])) {
      const on = norm(o.org);
      // org boshidagi raqam (masalan "3-son ...", "5-maktab", "12-dmtt")
      const onumM = on.match(/^\s*(\d+)\s*-/);
      const onum = onumM ? onumM[1] : null;
      let typeRe: RegExp | null = null;
      if (/maktab/.test(on)) typeRe = /maktab/;
      else if (/dmtt|bog/.test(on)) typeRe = /dmtt|bog/;
      else if (/poliklinika|oilaviy/.test(on)) typeRe = /poliklinika|oilaviy/;
      let hit = false;
      if (onum && typeRe) {
        // raqamli org: savolda shu raqam org TURI yonida boʻlishi shart — boshqa raqamlar (masalan "14.1.1 bandi") chalkashtirmasin
        const numRe = new RegExp(`(^|\\D)${onum}\\s*-?\\s*(son|sonli|maktab|dmtt|bog|poliklinika|oilaviy)`);
        hit = numRe.test(q) && typeRe.test(q);
      } else {
        for (const kws of Object.values(DEPT_KW)) { if (kws.some((k) => on.includes(norm(k))) && kws.some((k2) => q.includes(norm(k2)))) { hit = true; break; } }
      }
      if (!hit) continue;
      const docs = (o.docs || []).filter((x: any) => !dtype || x.t === dtype);
      for (const dc of docs) {
        if (seen.has(dc.p)) continue; seen.add(dc.p);
        out.push({ p: dc.p, label: docLabel(dc), org: o.org, district: d.name });
        if (out.length >= 2) return out;
      }
    }
  }
  return out;
}

// Buyruqlar (yuqori tashkilot) hujjatlari — savol kalit soʻzlari hujjat nomiga mos kelsa, oʻsha PDFni qaytaradi
const STOP = new Set(["togrisidagi", "togrisida", "buyicha", "haqida", "haqidagi", "yildagi", "sonli", "buyruq", "buyrugi", "ilova", "qarori", "qaror", "farmoni", "farmon", "qonuni", "qonun", "vazirlar", "mahkamasi", "mahkamasining", "respublikasi", "respublikasining", "ozbekiston", "uzbekiston", "prezidenti", "prezidentining", "hamda", "uchun", "bilan", "yangi", "chora", "tadbirlar", "tadbiri", "namunaviy"]);
function bWords(s: string): string[] { return norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)); }
function findBuyruqDocs(data: any, question: string): { p: string; label: string; org: string; district: string }[] {
  const cats = data?.buyruqlar || [];
  if (!cats.length) return [];
  const q = " " + norm(question) + " ";
  const inQ = (w: string) => q.includes(w.slice(0, Math.min(w.length, 6)));
  const scored: { p: string; label: string; org: string; score: number }[] = [];
  for (const c of cats) {
    const catHit = bWords(c.name || "").some(inQ) ? 0.5 : 0;
    for (const dc of (c.docs || [])) {
      const dw = bWords(dc.n || "");
      if (!dw.length) continue;
      const hit = dw.filter(inQ).length;
      if (hit >= 2) scored.push({ p: dc.p, label: dc.n || "Hujjat", org: c.name || "Buyruqlar", score: hit + catHit });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((s) => ({ p: s.p, label: s.label, org: s.org, district: "Buyruqlar" }));
}

// Lokal javob (Gemini'siz) — telefon/ism/tashkilot/rol savollari. Kvota tejaladi va doim ishlaydi.
function capLines(lines: string[], title: string): string | null {
  const u = [...new Set(lines)].slice(0, 12);
  if (!u.length) return null;
  return (title ? title + ":\n" : "") + u.map((l) => "• " + l).join("\n");
}
function localFind(data: any, question: string): string | null {
  if (!data?.districts) return null;
  const q = norm(question);
  const qd = String(question).replace(/\D/g, "");
  let role: string | null = null;
  if (/kadr/.test(q)) role = "k";
  else if (/buxgalter|hisobchi/.test(q)) role = "b";
  else if (/boshli|rahbar|direktor|mudir|yuriskonsul|yurist/.test(q)) role = "r";
  const dist = (data.districts || []).find((d: any) => q.includes(d.id) || q.includes(norm(d.name).split(" ")[0]));
  const staffLine = (s: any, dn: string) => `${s.fio}${s.lavozim ? " — " + s.lavozim : ""}, ${dn}${(s.tel || []).length ? " ☎ " + s.tel.join(", ") : ""}`;
  const orgLine = (lbl: string, p: any, org: string, dn: string) => `${org} — ${lbl}: ${p.fio}${(p.tel || []).length ? " ☎ " + p.tel.join(", ") : ""} (${dn})`;
  const lines: string[] = [];

  // 1) markaz xodimlari (boshliq / yuriskonsult) — tuman + "markaz/boshliq/yurist"
  if (dist && /markaz|boshli|yuriskonsul|yurist/.test(q)) {
    for (const s of (dist.markaz || [])) {
      if (!s.fio || s.fio === "Vakant") continue;
      const lav = norm(s.lavozim || "");
      if (/boshli|yurist|yuriskonsul/.test(q)) { if (/boshli|yurist|yuriskonsul/.test(lav)) lines.push(staffLine(s, dist.name)); }
      else lines.push(staffLine(s, dist.name));
    }
    const r = capLines(lines, `${dist.name} — markaz xodimlari`); if (r) return r;
  }

  // 2) muayyan tashkilot (raqam+turi yoki dept kalit soʻzi) -> kontaktlari
  const scope = dist ? [dist] : (data.districts || []);
  let oHit: any = null, oDist: any = null;
  for (const d of scope) { for (const o of (d.orgs || [])) {
    const on = norm(o.org);
    const onumM = on.match(/^\s*(\d+)\s*-/); const onum = onumM ? onumM[1] : null;
    let typeRe: RegExp | null = null;
    if (/maktab/.test(on)) typeRe = /maktab/; else if (/dmtt|bog/.test(on)) typeRe = /dmtt|bog/; else if (/poliklinika|oilaviy/.test(on)) typeRe = /poliklinika|oilaviy/;
    let hit = false;
    if (onum && typeRe) hit = new RegExp(`(^|\\D)${onum}\\s*-?\\s*(son|sonli|maktab|dmtt|bog|poliklinika|oilaviy)`).test(q) && typeRe.test(q);
    else { for (const kws of Object.values(DEPT_KW)) { if (kws.some((k) => on.includes(norm(k))) && kws.some((k2) => q.includes(norm(k2)))) { hit = true; break; } } }
    if (hit) { oHit = o; oDist = d; break; }
  } if (oHit) break; }
  if (oHit) {
    const roles: [string, string][] = role ? [[role, ({ r: "Rahbar", k: "Kadrlar boʻlimi", b: "Buxgalter" } as any)[role]]] : [["r", "Rahbar"], ["k", "Kadrlar boʻlimi"], ["b", "Buxgalter"]];
    for (const [rk, lbl] of roles) { const p = oHit[rk]; if (p && p.fio) lines.push(orgLine(lbl, p, oHit.org, oDist.name)); }
    const r = capLines(lines, `${oHit.org} (${oDist.name})`); if (r) return r;
  }

  // 3) telefon raqami boʻyicha (teskari qidiruv)
  if (qd.length >= 5) {
    for (const d of (data.districts || [])) {
      for (const s of (d.markaz || [])) if (s.fio && (s.tel || []).some((t: string) => t.replace(/\D/g, "").includes(qd))) lines.push(staffLine(s, d.name));
      for (const o of (d.orgs || [])) for (const rl of [["r", "Rahbar"], ["k", "Kadrlar"], ["b", "Buxgalter"]] as [string, string][]) { const p = o[rl[0]]; if (p?.fio && (p.tel || []).some((t: string) => t.replace(/\D/g, "").includes(qd))) lines.push(orgLine(rl[1], p, o.org, d.name)); }
      if (lines.length >= 10) break;
    }
    const r = capLines(lines, "Topilgan kontaktlar"); if (r) return r;
  }

  // 4) umumiy substring qidiruv (ism / tashkilot)
  const STOPW = new Set(["kim", "nima", "qancha", "telefon", "raqam", "raqami", "nomer", "markaz", "tuman", "shahar", "boshli", "boshligi", "rahbar", "rahbari", "kadrlar", "buxgalter", "yurist", "yuriskonsult", "necha", "qaysi", "bormi", "haqida", "uchun", "ning", "bolimi", "bolim", "xojaligi", "xojalik", "boshqarmasi", "boshqarma", "birlashmasi", "inspeksiyasi", "idora", "faoliyatiga", "oid"]);
  const terms = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPW.has(w));
  if (terms.length) {
    for (const d of scope) {
      for (const s of (d.markaz || [])) { if (!s.fio) continue; const hay = norm(s.fio + " " + (s.lavozim || "")); if (terms.some((t) => hay.includes(t))) lines.push(staffLine(s, d.name)); }
      for (const o of (d.orgs || [])) { const hay = norm([o.org, o.r?.fio, o.k?.fio, o.b?.fio].join(" ")); if (terms.some((t) => hay.includes(t))) { for (const rl of [["r", "Rahbar"], ["k", "Kadrlar"], ["b", "Buxgalter"]] as [string, string][]) { const p = o[rl[0]]; if (p?.fio) lines.push(orgLine(rl[1], p, o.org, d.name)); } } }
      if (lines.length >= 12) break;
    }
    const r = capLines(lines, "Qidiruv natijasi"); if (r) return r;
  }
  return null;
}

function toB64(bytes: Uint8Array) { let bin = ""; const ch = 0x8000; for (let i = 0; i < bytes.length; i += ch) bin += String.fromCharCode(...bytes.subarray(i, i + ch)); return btoa(bin); }

// Katta PDF (>~14MB inline limiti) uchun Gemini Files API'ga yuklash
async function uploadToGemini(bytes: Uint8Array<ArrayBuffer>, displayName: string): Promise<string> {
  const apiKey = KEY();
  const numBytes = bytes.length;
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(numBytes), "X-Goog-Upload-Header-Content-Type": "application/pdf", "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("upload-url yoʻq");
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": String(numBytes) },
    body: bytes,
  });
  let file = (await upRes.json())?.file;
  let tries = 0;
  while (file && file.state === "PROCESSING" && tries < 12) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`);
    file = await st.json();
    tries++;
  }
  if (!file || file.state !== "ACTIVE") throw new Error("file holati: " + (file?.state || "?"));
  return file.uri as string;
}

async function fetchDoc(key: string): Promise<Uint8Array<ArrayBuffer>> {
  const url = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key.replace(/^\/+/, "")}`;
  const signed = await aws.sign(url, { method: "GET", aws: { signQuery: true } });
  const r = await fetch(signed.url);
  if (!r.ok) throw new Error("doc " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// Oddiy matn generatsiyasi (maxsus vazifalar uchun) — flash-lite, band boʻlsa flash
async function geminiText(sys: string, prompt: string, temp: number, maxTok: number): Promise<string> {
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: temp, maxOutputTokens: maxTok } });
  for (const mdl of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
    try {
      const gRes = await fetch(gUrl(mdl), { method: "POST", headers: { "x-goog-api-key": KEY(), "Content-Type": "application/json" }, body });
      const g = await gRes.json();
      const t = g?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (t) return t;
      if (g?.error?.code !== 429) break;
    } catch (_) { /* keyingi model */ }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Avtorizatsiya talab qilinadi" }, 401);

    const body = await req.json();
    const { question, history, task, payload } = body;

    const adminDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let login = "", isAdmin = false;
    try { const { data: p } = await adminDb.from("profiles").select("login,is_admin").eq("user_id", user.id).single(); login = p?.login || ""; isAdmin = !!p?.is_admin; } catch (_) { /* ataylab eʼtiborsiz: asosiy amalga taʼsir qilmasin */ }

    // ---------- MAXSUS VAZIFA (5): tugʻilgan kun tabrigi — har foydalanuvchi, limitsiz, qisqa ----------
    if (task === "bday") {
      const p = payload || {};
      const name = String(p.name || "").slice(0, 120);
      if (!name) return json({ error: "Ism kerak" }, 400);
      // Kvota himoyasi: bday ham kunlik 20 limitга kiradi (admin mustasno).
      // TOCTOU poygasini yopish (#14): avval INSERT (slot band), keyin sanaymiz.
      let bLogged = false;
      if (!isAdmin && login) {
        const uzStart0 = new Date(Date.now() + 5 * 3600e3); uzStart0.setUTCHours(0, 0, 0, 0);
        const since0 = new Date(uzStart0.getTime() - 5 * 3600e3).toISOString();
        try {
          await adminDb.from("ai_logs").insert({ login, question: "[bday tabrik]" }); bLogged = true;
          const { count } = await adminDb.from("ai_logs").select("id", { count: "exact", head: true }).eq("login", login).gte("created_at", since0);
          if ((count || 0) > 20) return json({ error: "Bugungi AI limiti (20 ta) tugadi. Ertaga qayta urinib koʻring." });
        } catch (_) { /* tekshirib boʻlmadi — oʻtkazamiz */ }
      }
      const alpha = p.alpha === "cyr" ? "KIRILL" : "LOTIN";
      const sys = `Sen Oʻzbekiston davlat tashkiloti (Adliya — yuridik xizmat koʻrsatish markazi) uchun rasmiy, ammo samimiy tabrik matni yozasan. Hurmatli, iliq ohang. EMOJI ISHLATMA. Faqat tabrik matnini ber, boshqa izoh yozma.`;
      const prompt = `Hamkasbga tugʻilgan kun tabrigi yoz. F.I.O: ${name}${p.role ? `; lavozim: ${p.role}` : ""}${p.district ? `; hudud: ${p.district}` : ""}. 2-3 jumla, ${alpha} alifbosida, kasbiy va samimiy; sogʻlik, omad va kasbiy yutuqlar tilanadi.`;
      const t = await geminiText(sys, prompt, 0.9, 320);
      if (t) { if (!bLogged) { try { await adminDb.from("ai_logs").insert({ login, question: "[bday tabrik]" }); } catch (_) { /* ataylab eʼtiborsiz: asosiy amalga taʼsir qilmasin */ } } return json({ answer: t.trim() }); }
      return json({ error: "AI hozir band. Bir oz keyinroq urinib koʻring." });
    }

    // ---------- MAXSUS VAZIFA (3): maʼlumot tekshiruvi — FAQAT admin ----------
    if (task === "fixdata") {
      if (!isAdmin) return json({ error: "Faqat administrator" }, 403);
      const items = Array.isArray(payload?.items) ? payload.items.slice(0, 40) : [];
      if (!items.length) return json({ suggestions: [] });
      const sys = `Sen maʼlumotlar bazasini tozalovchi yordamchisan. Senga shubhali yozuvlar (telefon raqamlari va F.I.O.) beriladi.
QATʼIY QOIDA: telefon raqami uchun HECH QACHON yangi raqam OʻYLAB TOPMA yoki mavjud raqamlarni oʻzgartirma. Faqat:
- raqamlar soni notoʻgʻri boʻlsa (Oʻzbekiston mobil: 9 ta milliy raqam yoki 998+9=12): status="manual" (qoʻlda tuzatilsin), suggestion="".
- raqamlar soni toʻgʻri, lekin format buzuq boʻlsa: status="reformat", suggestion=toʻgʻri formatlangan koʻrinish "+998 XX XXX XX XX" (AYNAN OʻSHA raqamlardan).
F.I.O. uchun: aniq imlo xatosi koʻrinsa status="suspect", note=qisqa izoh; aks holda status="ok".
Javobni FAQAT JSON massiv koʻrinishida ber, boshqa matnsiz: [{"id":<butun son>,"status":"...","suggestion":"...","note":"..."}].`;
      const raw = await geminiText(sys, "Yozuvlar:\n" + JSON.stringify(items), 0.1, 2000);
      let suggestions: any[] = [];
      try {
        let s = raw.replace(/```json|```/g, "").trim();
        const a = s.indexOf("["), b = s.lastIndexOf("]");      // matn ichidan JSON massivni ajratamiz
        if (a >= 0 && b > a) s = s.slice(a, b + 1);
        suggestions = JSON.parse(s);
        if (!Array.isArray(suggestions)) suggestions = [];
      } catch (_) { suggestions = []; }
      return json({ suggestions });
    }

    // ---------- ODDIY SAVOL (maʼlumotnoma / hujjat) ----------
    if (!question || question.length > 500) return json({ error: "Savol notoʻgʻri" }, 400);

    const { data: row } = await sb.from("site_data").select("data").eq("id", 1).single();
    const data = row?.data;
    let logged = false; // idempotent — bir soʻrov bir marta yoziladi
    const log = async () => {
      if (logged) return; logged = true;
      try {
        await adminDb.from("ai_logs").insert({ login, question });
        // Eskirgan yozuvlarni tozalash (ai_logs cheksiz oʻsmasin) — ~2% ehtimol bilan, 90 kundan eski
        if (Math.random() < 0.02) {
          const cutoff = new Date(Date.now() - 90 * 864e5).toISOString();
          adminDb.from("ai_logs").delete().lt("created_at", cutoff).then(() => {}, () => {});
        }
      } catch (_) { /* ataylab eʼtiborsiz: asosiy amalga taʼsir qilmasin */ }
    };

    // Har foydalanuvchiga kunlik AI savol limiti (admin mustasno) — bepul kvotani himoya qiladi.
    // TOCTOU poygasini yopish (#14): avval yozamiz (slotni band qilamiz), KEYIN sanaymiz — parallel soʻrovlar limitdan oʻtolmaydi.
    const DAILY_LIMIT = 20;
    if (!isAdmin && login) {
      const uzStart = new Date(Date.now() + 5 * 3600e3); uzStart.setUTCHours(0, 0, 0, 0);
      const sinceIso = new Date(uzStart.getTime() - 5 * 3600e3).toISOString();
      try {
        await log(); // avval INSERT (logged=true)
        const { count } = await adminDb.from("ai_logs").select("id", { count: "exact", head: true }).eq("login", login).gte("created_at", sinceIso);
        if ((count || 0) > DAILY_LIMIT) return json({ error: `Bugungi AI savollar limiti (${DAILY_LIMIT} ta) tugadi. Ertaga yana savol berishingiz mumkin. Shoshilinch boʻlsa — kerakli hujjat yoki telefonni boʻlimlardan toʻgʻridan-toʻgʻri toping.` });
      } catch (_) { /* limitni tekshirib boʻlmadi — oʻtkazib yuboramiz */ }
    }

    // ---------- HUJJAT REJIMI ----------
    let targets = findDocs(data, question);
    if (!targets.length) targets = findBuyruqDocs(data, question);
    if (targets.length) {
      const parts: any[] = [];
      const used: string[] = [];
      for (const t of targets) {
        try {
          const bytes = await fetchDoc(t.p);
          if (bytes.length <= 14 * 1024 * 1024) {
            parts.push({ inline_data: { mime_type: "application/pdf", data: toB64(bytes) } });
          } else {
            const uri = await uploadToGemini(bytes, t.p);
            parts.push({ file_data: { mime_type: "application/pdf", file_uri: uri } });
          }
          used.push(`${t.org} (${t.district}) — ${t.label}`);
        } catch (_) { /* hujjatni olib bo'lmadi — keyingisi */ }
      }
      if (parts.length) {
        parts.push({ text: question });
        const sys = `Sen Navoiy viloyati yuridik xizmat markazlari yordamchisisan. Foydalanuvchi savoliga FAQAT berilgan hujjat(lar) asosida toʻliq, aniq va tushunarli javob ber.
Hujjat(lar): ${used.join("; ")}.
Asosiy bandlarni izohlab ber; kerak boʻlsa raqam, sana, F.I.O. larni keltir. Hujjatda maʼlumot boʻlmasa "Bu maʼlumot hujjatda yoʻq" deb ayt.
MUHIM: hujjat skaner (rasm) boʻlib matn ayrim joyda noaniq boʻlsa, uni harfma-harf KOʻCHIRMA — mazmunini TOZA, tushunarli oʻzbek tilida bayon qil. Hech qachon buzuq, oʻqib boʻlmaydigan harf/belgilar chiqarma. Foydalanuvchi yozuvida (lotin/kirill) javob ber.`;
        const gbody = JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 1000 } });
        // flash (sifatli OCR) band boʻlsa -> flash-lite (alohida kvota, ~4x koʻp) ga avtomatik oʻtamiz
        const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
        let ans = "", limited = false;
        for (const mdl of models) {
          for (let attempt = 0; attempt < 2 && !ans; attempt++) {
            const gRes = await fetch(gUrl(mdl), { method: "POST", headers: { "x-goog-api-key": KEY(), "Content-Type": "application/json" }, body: gbody });
            const g = await gRes.json();
            ans = g?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (ans) break;
            if (g?.error?.code === 429) { limited = true; break; } // bu model band — keyingisiga oʻtamiz
            await new Promise((r) => setTimeout(r, 600));
          }
          if (ans) break;
        }
        await log();
        if (ans) return json({ answer: ans, source: used });
        if (limited) return json({ error: "AI hozir juda band. Bir necha daqiqadan soʻng qayta urinib koʻring." });
        // Hujjat aniq topildi, lekin AI javob bermadi — adashtirmaslik uchun halol xabar (ma'lumotnoma rejimiga tushmaymiz)
        return json({ error: `«${used[0]}» hujjati topildi, biroq javob olishda xatolik boʻldi. Iltimos, qayta urinib koʻring.` });
      }
    }

    // ---------- MA'LUMOTNOMA REJIMI ----------
    // 1) LOKAL javob (Gemini'siz) — telefon/ism/tashkilot/rol. Kvotani tejaydi va doim ishlaydi.
    const localAns = localFind(data, question);
    if (localAns) { await log(); return json({ answer: localAns }); }

    // 2) Lokal topolmasa — Gemini (flash-lite, band boʻlsa flash)
    const ctx = buildContext(data, question);
    const sys = `Sen Navoiy viloyati yuridik xizmat koʻrsatish markazlari maʼlumotnomasining yordamchisisan.
Quyidagi maʼlumotlar asosida aniq, qisqa va doʻstona javob ber. Telefon, F.I.O., tashkilot nomlarini aniq keltir.
Hujjat ichidagi savol uchun tashkilot nomini aniq yozishni soʻra (masalan: "Nurota 5-maktab jamoa shartnomasi").
Agar savol normativ-huquqiy hujjat / qonun / qaror / farmon / nizom haqida boʻlsa, "YUQORI TASHKILOT BUYRUQLARI" boʻlimidagi mos havolani (lex.uz manzili bilan) yoki PDF hujjat nomini koʻrsat.
Faqat berilgan maʼlumotga tayan; bilmasangki "Bu maʼlumot bazada yoʻq" deb ayt. Oʻzbek tilida (foydalanuvchi yozuvида) javob ber.

=== MAʼLUMOTLAR ===
${ctx}`;
    const contents: any[] = [];
    if (Array.isArray(history)) for (const h of history.slice(-6)) contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: String(h.text).slice(0, 500) }] });
    contents.push({ role: "user", parts: [{ text: question }] });
    const dbody = JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 800 } });
    let dAns = "";
    for (const mdl of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
      const gRes = await fetch(gUrl(mdl), { method: "POST", headers: { "x-goog-api-key": KEY(), "Content-Type": "application/json" }, body: dbody });
      const g = await gRes.json();
      dAns = g?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (dAns || g?.error?.code !== 429) break; // 429 boʻlsagina keyingi modelga oʻtamiz
    }
    await log();
    if (dAns) return json({ answer: dAns });
    return json({ error: "Hozir AI yordamchi vaqtincha band. Aniq ism, tashkilot nomi yoki telefon raqamini yozsangiz — darhol topib beraman (masalan: «Navoiy 5-maktab» yoki «Karmana markaz boshligʻi»)." });
  } catch (e) {
    return json({ error: "Server xatosi: " + (e as Error).message });
  }
});

function buildContext(data: any, question: string): string {
  if (!data?.districts) return "Maʼlumot yoʻq.";
  const lines: string[] = [];
  for (const d of data.districts) {
    lines.push(`\n## ${d.name} — ${d.center}`);
    for (const s of d.markaz) { if (!s.fio || s.fio === "Vakant") continue; lines.push(`- ${s.fio} (${s.lavozim}): ${(s.tel || []).join(", ")}`); }
    for (const o of d.orgs) {
      const parts: string[] = [];
      if (o.r?.fio) parts.push(`rahbar ${o.r.fio} ${(o.r.tel || []).join(", ")}`);
      if (o.k?.fio) parts.push(`kadrlar ${o.k.fio} ${(o.k.tel || []).join(", ")}`);
      if (o.b?.fio) parts.push(`buxgalter ${o.b.fio} ${(o.b.tel || []).join(", ")}`);
      lines.push(`- ${o.org}: ${parts.join("; ")}`);
    }
  }
  // Buyruqlar (lex.uz havolalari) — FAQAT normativ-huquqiy savolda qoʻshamiz; aks holda maʼlumotnoma toza/aniq qoladi
  const buy = data.buyruqlar || [];
  const LEGAL = /qonun|kodeks|qaror|farmon|nizom|buyruq|havola|lex|normativ|huquq|reglament|farmoyish|qaror|modda/;
  if (buy.length && LEGAL.test(norm(question))) {
    lines.push(`\n=== YUQORI TASHKILOT BUYRUQLARI (onlayn havolalar lex.uz + PDF hujjatlar) ===`);
    for (const c of buy) {
      const ll = (c.links || []), dd = (c.docs || []);
      if (!ll.length && !dd.length) continue;
      lines.push(`\n## ${c.name}`);
      for (const lk of ll) lines.push(`- ${lk.n}: ${lk.u}`);
      for (const dc of dd) lines.push(`- [PDF] ${dc.n} (saytdagi «Buyruqlar» boʻlimida)`);
    }
  }
  return lines.join("\n");
}
