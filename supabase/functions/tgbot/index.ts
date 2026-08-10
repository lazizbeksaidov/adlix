// Telegram bot webhook — maʼlumotnoma: qidiruv + tugmali navigatsiya (tuman → tashkilot → raqam/hujjat).
// Kirish: foydalanuvchi OʻZ telefon raqamini yuboradi; raqam markaz xodimlari roʻyxatida yoki admin roʻyxatida boʻlsa — ruxsat.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const CODE = (Deno.env.get("TG_ACCESS_CODE") || "").trim();
const HOOK_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const SITE_URL = "https://navoiy-yuridik.vercel.app";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// site_data keshi — har tugma bosishda 1.6MB qayta yuklanmasin (warm isolate'da saqlanadi, 60s TTL)
let _cache: { data: any; ts: number } | null = null;
async function getData() {
  if (_cache && Date.now() - _cache.ts < 60000) return _cache.data;
  const { data: row } = await db.from("site_data").select("data").eq("id", 1).single();
  _cache = { data: row?.data || { districts: [] }, ts: Date.now() };
  return _cache.data;
}

const R2_ACCOUNT = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const aws = new AwsClient({ accessKeyId: Deno.env.get("R2_ACCESS_KEY")!, secretAccessKey: Deno.env.get("R2_SECRET_KEY")!, region: "auto", service: "s3" });
async function signR2(key: string, disposition: string) {
  const base = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key.replace(/^\/+/, "")}`;
  const u = `${base}?X-Amz-Expires=3600&response-content-disposition=${encodeURIComponent(disposition)}`;
  return (await aws.sign(u, { method: "GET", aws: { signQuery: true } })).url;
}

const PAGE = 8, DPAGE = 10;
const DOC_LABEL: Record<string, string> = { jamoa: "Jamoa shartnomasi", ichki: "Ichki tartib qoidalari", tatil: "Taʼtillar jadvali" };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const docName = (dc: any) => dc?.n || DOC_LABEL[dc?.t] || dc?.t || "Hujjat";

async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
const send = (chat_id: number, text: string, markup?: unknown) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
const edit = (chat_id: number, message_id: number, text: string, markup?: unknown) =>
  tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
const answerCb = (id: string, text?: string) => tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
const contactKb = () => ({ keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });

function normPhone(s: string) { return String(s || "").replace(/\D/g, "").replace(/^998/, "").slice(-9); }
const ADMIN_PHONES = (Deno.env.get("TG_ADMIN_PHONES") || "").split(",").map((s) => normPhone(s)).filter((p) => p.length >= 7);
const isAdminPhone = (p: string) => { const n = normPhone(p); return n.length >= 7 && ADMIN_PHONES.includes(n); };

function findStaffByPhone(data: any, phone: string) {
  const p = normPhone(phone);
  if (p.length < 7) return null;
  for (const d of data.districts) for (const s of d.markaz) {
    if (!s.fio) continue;
    for (const t of (s.tel || [])) if (normPhone(t) === p) return { fio: s.fio, lavozim: s.lavozim || "", district: d.name };
  }
  return null;
}

const C2L: Record<string, string> = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','қ':'q','ғ':'g','ҳ':'h','ў':'o','ъ':'','ь':'','э':'e','ю':'yu','я':'ya','ы':'i' };
function normQ(q: string) { q = q.toLowerCase().trim(); if (/[а-яёўқғҳ]/.test(q)) q = q.split("").map((c) => C2L[c] ?? c).join(""); return q; }

function searchDirectory(data: any, query: string) {
  const q = normQ(query), qd = q.replace(/\D/g, ""), out: string[] = [];
  for (const d of data.districts) {
    for (const s of d.markaz) {
      if (!s.fio) continue;
      const hay = (s.fio + " " + (s.lavozim || "")).toLowerCase(), tels = (s.tel || []).join(" ").replace(/\D/g, "");
      if (hay.includes(q) || (qd.length >= 3 && tels.includes(qd))) out.push(`👤 <b>${esc(s.fio)}</b>\n${esc(s.lavozim)} · ${esc(d.name)}\n📞 ${esc((s.tel || []).join(", "))}`);
    }
    for (let oi = 0; oi < d.orgs.length; oi++) {
      const o = d.orgs[oi];
      const hay = [o.org, o.r?.fio, o.k?.fio, o.b?.fio].join(" ").toLowerCase();
      const tels = [...(o.r?.tel || []), ...(o.k?.tel || []), ...(o.b?.tel || [])].join(" ").replace(/\D/g, "");
      if (hay.includes(q) || (qd.length >= 3 && tels.includes(qd))) out.push(`🏢 <b>${esc(o.org)}</b> · ${esc(d.name)}\n/org_${d.id}_${oi} — batafsil (raqam + hujjat)`);
      if (out.length >= 14) break;
    }
    if (out.length >= 14) break;
  }
  return out;
}

// ----- Ko'rinishlar (inline tugmalar) -----
function mainMenu(data: any) {
  const rows: any[] = [];
  rows.push([{ text: "🤖 AI yordamchi — savol bering", callback_data: "ai" }]);
  rows.push([{ text: "🌐 Saytni ochish (ilova)", web_app: { url: SITE_URL } }]);
  const ds = data.districts;
  for (let i = 0; i < ds.length; i += 2) {
    const r = [{ text: ds[i].name, callback_data: `d~${ds[i].id}~0` }];
    if (ds[i + 1]) r.push({ text: ds[i + 1].name, callback_data: `d~${ds[i + 1].id}~0` });
    rows.push(r);
  }
  return { text: "🏛 <b>Navoiy viloyati — maʼlumotnoma</b>\n\n🤖 <b>AI yordamchi</b> — hujjat/qonun boʻyicha savol bering.\nYoki hududni tanlang, yoxud qidiruv uchun matn yozing (ism, telefon, tashkilot):", kb: { inline_keyboard: rows } };
}
function districtView(data: any, did: string, page: number) {
  const d = data.districts.find((x: any) => x.id === did);
  if (!d) return mainMenu(data);
  const orgs = d.orgs || [];
  const pages = Math.max(1, Math.ceil(orgs.length / PAGE));
  page = Math.min(Math.max(0, page), pages - 1);
  const rows: any[] = [];
  if ((d.markaz || []).some((s: any) => s.fio)) rows.push([{ text: "👥 Markaz xodimlari", callback_data: `g~${did}` }]);
  for (let i = page * PAGE; i < Math.min(orgs.length, page * PAGE + PAGE); i++) rows.push([{ text: "🏢 " + orgs[i].org, callback_data: `o~${did}~${i}~0` }]);
  const nav: any[] = [];
  if (page > 0) nav.push({ text: "◀", callback_data: `d~${did}~${page - 1}` });
  if (pages > 1) nav.push({ text: `${page + 1}/${pages}`, callback_data: `d~${did}~${page}` });
  if (page < pages - 1) nav.push({ text: "▶", callback_data: `d~${did}~${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "🏠 Bosh menyu", callback_data: "m" }]);
  return { text: `🏘 <b>${esc(d.name)}</b>\nTashkilot soni: ${orgs.length}. Tanlang:`, kb: { inline_keyboard: rows } };
}
function markazView(data: any, did: string) {
  const d = data.districts.find((x: any) => x.id === did);
  if (!d) return mainMenu(data);
  const lines = [`👥 <b>${esc(d.name)} — markaz xodimlari</b>`, ""];
  for (const s of (d.markaz || [])) {
    if (!s.fio) continue;
    lines.push(`👤 <b>${esc(s.fio)}</b>\n${esc(s.lavozim || "")} 📞 ${esc((s.tel || []).join(", ") || "—")}`, "");
  }
  return { text: lines.join("\n"), kb: { inline_keyboard: [[{ text: "🔙 Orqaga", callback_data: `d~${did}~0` }], [{ text: "🏠 Bosh menyu", callback_data: "m" }]] } };
}
function orgView(data: any, did: string, oi: number, dpage: number) {
  const d = data.districts.find((x: any) => x.id === did);
  const o = d?.orgs?.[oi];
  if (!o) return districtView(data, did, 0);
  const L = [`🏢 <b>${esc(o.org)}</b> · ${esc(d.name)}`, ""];
  const role = (lbl: string, p: any) => { if (p?.fio || (p?.tel || []).length) L.push(`<b>${lbl}:</b> ${esc(p.fio || "—")}${(p?.tel || []).length ? " 📞 " + esc(p.tel.join(", ")) : ""}`); };
  role("Rahbar", o.r); role("Kadrlar boʻlimi", o.k); role("Buxgalter", o.b);
  const docs = o.docs || [];
  const rows: any[] = [];
  if (docs.length) {
    L.push("", `📎 <b>Hujjatlar (${docs.length}):</b> — yuklab olish uchun bosing`);
    const pages = Math.max(1, Math.ceil(docs.length / DPAGE));
    dpage = Math.min(Math.max(0, dpage), pages - 1);
    for (let i = dpage * DPAGE; i < Math.min(docs.length, dpage * DPAGE + DPAGE); i++) rows.push([{ text: "📄 " + docName(docs[i]), callback_data: `f~${did}~${oi}~${i}` }]);
    const nav: any[] = [];
    if (dpage > 0) nav.push({ text: "◀ hujjat", callback_data: `o~${did}~${oi}~${dpage - 1}` });
    if (dpage < pages - 1) nav.push({ text: "hujjat ▶", callback_data: `o~${did}~${oi}~${dpage + 1}` });
    if (nav.length) rows.push(nav);
  } else {
    L.push("", "📎 Hujjat yuklanmagan.");
  }
  rows.push([{ text: "🔙 Tashkilotlar", callback_data: `d~${did}~0` }, { text: "🏠 Bosh menyu", callback_data: "m" }]);
  return { text: L.join("\n"), kb: { inline_keyboard: rows } };
}
async function sendDoc(data: any, did: string, oi: number, doci: number, chat_id: number) {
  const o = data.districts.find((x: any) => x.id === did)?.orgs?.[oi];
  const dc = o?.docs?.[doci];
  if (!dc) { await send(chat_id, "Hujjat topilmadi."); return; }
  const fn = (docName(dc) + ".pdf").replace(/["\\/]/g, " ");
  try {
    const url = await signR2(dc.p, `attachment; filename="${fn}"`);
    const res: any = await tg("sendDocument", { chat_id, document: url, caption: `📄 ${docName(dc)} · ${o.org}` });
    if (!res.ok) {
      const view = await signR2(dc.p, "inline");
      await send(chat_id, `📄 <b>${esc(docName(dc))}</b>\n<a href="${view}">Hujjatni ochish / yuklab olish</a>\n<i>(havola 1 soat amal qiladi)</i>`);
    }
  } catch (_e) {
    await send(chat_id, "Hujjatni yuklashda xatolik. Birozdan soʻng urinib koʻring.");
  }
}

// ===== AI yordamchi (Gemini) — saytdagi chat funksiyasi mantigʻi =====
const GKEY = () => Deno.env.get("GEMINI_API_KEY")!;
const gUrl = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const AI_PROMPT = "🤖 Savolingizni yozing — hujjat, qonun yoki maʼlumot boʻyicha.\nMasalan: «Navoiy 5-maktab taʼtil jadvali» yoki «Mehnat kodeksi havolasi».";
const sendPlain = (chat_id: number, text: string, markup?: unknown) =>
  tg("sendMessage", { chat_id, text, disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
function aiNorm(s: string) { return String(s || "").toLowerCase().split("").map((c) => C2L[c] ?? c).join("").replace(/[ʻ'`’]/g, ""); }

const DOC_KW = /jamoa|shartnoma|ichki|tartib|qoida|tatil|otpusk|jadval|grafik|hujjat|modda|\bband\b|ish vaqti|dam olish|mehnat|reestr|lavozim/;
const DEPT_KW: Record<string, string[]> = {
  tibbiyot: ["tibbiyot","soglik","shifoxona"], moliya:["moliya","iqtisod"], veterinariya:["veterinar","chorvachilik"],
  madaniyat:["madaniyat"], sanitariya:["sanitariya","ses","epidemiolog"], bandlik:["bandli"], soliq:["soliq"],
  obodon:["obodon"], yoshlar:["yoshlar"], suv:["suv xo","irrigatsiya"], ormon:["rmon"], mmtb:["maktabgacha va maktab","mmtb","mmt"],
  poliklinika:["poliklinika","oilaviy"], maskan:["nurli maskan","maskan"], oila:["oila","xotin qiz"], qishloq:["qishloq xo","dehqon"],
};
const aiDocLabel = (dc: any) => dc?.n || DOC_LABEL[dc?.t] || dc?.t || "Hujjat";
function findDocs(data: any, question: string) {
  const q = aiNorm(question);
  if (!DOC_KW.test(q)) return [] as any[];
  let dtype: string | null = null;
  if (/jamoa|shartnoma/.test(q)) dtype = "jamoa";
  else if (/ichki|tartib|qoida|reestr|lavozim/.test(q)) dtype = "ichki";
  else if (/tatil|otpusk|jadval|grafik|dam olish/.test(q)) dtype = "tatil";
  let districts = (data.districts || []).filter((d: any) => q.includes(d.id) || q.includes(aiNorm(d.name).split(" ")[0]));
  if (!districts.length) districts = data.districts || [];
  const out: any[] = []; const seen = new Set<string>();
  for (const d of districts) for (const o of (d.orgs || [])) {
    const on = aiNorm(o.org);
    const onumM = on.match(/^\s*(\d+)\s*-/); const onum = onumM ? onumM[1] : null;
    let typeRe: RegExp | null = null;
    if (/maktab/.test(on)) typeRe = /maktab/;
    else if (/dmtt|bog/.test(on)) typeRe = /dmtt|bog/;
    else if (/poliklinika|oilaviy/.test(on)) typeRe = /poliklinika|oilaviy/;
    let hit = false;
    if (onum && typeRe) { const numRe = new RegExp(`(^|\\D)${onum}\\s*-?\\s*(son|sonli|maktab|dmtt|bog|poliklinika|oilaviy)`); hit = numRe.test(q) && typeRe.test(q); }
    else { for (const kws of Object.values(DEPT_KW)) { if (kws.some((k) => on.includes(aiNorm(k))) && kws.some((k2) => q.includes(aiNorm(k2)))) { hit = true; break; } } }
    if (!hit) continue;
    for (const dc of (o.docs || []).filter((x: any) => !dtype || x.t === dtype)) { if (seen.has(dc.p)) continue; seen.add(dc.p); out.push({ p: dc.p, label: aiDocLabel(dc), org: o.org, district: d.name }); if (out.length >= 2) return out; }
  }
  return out;
}
const STOP = new Set(["togrisidagi","togrisida","buyicha","haqida","haqidagi","yildagi","sonli","buyruq","buyrugi","ilova","qarori","qaror","farmoni","farmon","qonuni","qonun","vazirlar","mahkamasi","mahkamasining","respublikasi","respublikasining","ozbekiston","uzbekiston","prezidenti","prezidentining","hamda","uchun","bilan","yangi","chora","tadbirlar","tadbiri","namunaviy"]);
function bWords(s: string) { return aiNorm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)); }
function findBuyruqDocs(data: any, question: string) {
  const cats = data?.buyruqlar || []; if (!cats.length) return [] as any[];
  const q = " " + aiNorm(question) + " ";
  const inQ = (w: string) => q.includes(w.slice(0, Math.min(w.length, 6)));
  const scored: any[] = [];
  for (const c of cats) { const catHit = bWords(c.name || "").some(inQ) ? 0.5 : 0;
    for (const dc of (c.docs || [])) { const dw = bWords(dc.n || ""); if (!dw.length) continue; const hit = dw.filter(inQ).length; if (hit >= 2) scored.push({ p: dc.p, label: dc.n || "Hujjat", org: c.name || "Buyruqlar", district: "Buyruqlar", score: hit + catHit }); } }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2);
}
function toB64(bytes: Uint8Array) { let bin = ""; const ch = 0x8000; for (let i = 0; i < bytes.length; i += ch) bin += String.fromCharCode(...bytes.subarray(i, i + ch)); return btoa(bin); }
async function fetchDocBytes(key: string) {
  const url = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key.replace(/^\/+/, "")}`;
  const signed = await aws.sign(url, { method: "GET", aws: { signQuery: true } });
  const r = await fetch(signed.url); if (!r.ok) throw new Error("doc " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function uploadToGemini(bytes: Uint8Array, displayName: string) {
  const apiKey = GKEY(); const n = bytes.length;
  const s = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, { method: "POST", headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(n), "X-Goog-Upload-Header-Content-Type": "application/pdf", "Content-Type": "application/json" }, body: JSON.stringify({ file: { display_name: displayName } }) });
  const uurl = s.headers.get("X-Goog-Upload-URL"); if (!uurl) throw new Error("upload-url");
  const up = await fetch(uurl, { method: "POST", headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": String(n) }, body: new Blob([bytes]) }); // Blob — Deno 2 tip mosligi
  let file = (await up.json())?.file; let t = 0;
  while (file && file.state === "PROCESSING" && t < 12) { await new Promise((r) => setTimeout(r, 1500)); const st = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`); file = await st.json(); t++; }
  if (!file || file.state !== "ACTIVE") throw new Error("file " + (file?.state || "?"));
  return file.uri as string;
}
function buildAiContext(data: any, question: string) {
  if (!data?.districts) return "Maʼlumot yoʻq.";
  const lines: string[] = [];
  for (const d of data.districts) {
    lines.push(`\n## ${d.name} — ${d.center}`);
    for (const s of d.markaz) { if (!s.fio || s.fio === "Vakant") continue; lines.push(`- ${s.fio} (${s.lavozim}): ${(s.tel || []).join(", ")}`); }
    for (const o of d.orgs) { const ps: string[] = []; if (o.r?.fio) ps.push(`rahbar ${o.r.fio} ${(o.r.tel || []).join(", ")}`); if (o.k?.fio) ps.push(`kadrlar ${o.k.fio} ${(o.k.tel || []).join(", ")}`); if (o.b?.fio) ps.push(`buxgalter ${o.b.fio} ${(o.b.tel || []).join(", ")}`); lines.push(`- ${o.org}: ${ps.join("; ")}`); }
  }
  const buy = data.buyruqlar || []; const LEGAL = /qonun|kodeks|qaror|farmon|nizom|buyruq|havola|lex|normativ|huquq|reglament|farmoyish|modda/;
  if (buy.length && LEGAL.test(aiNorm(question))) { lines.push(`\n=== YUQORI TASHKILOT BUYRUQLARI (havolalar lex.uz + PDF) ===`); for (const c of buy) { const ll = c.links || [], dd = c.docs || []; if (!ll.length && !dd.length) continue; lines.push(`\n## ${c.name}`); for (const lk of ll) lines.push(`- ${lk.n}: ${lk.u}`); for (const dc of dd) lines.push(`- [PDF] ${dc.n} («Buyruqlar» boʻlimida)`); } }
  return lines.join("\n");
}
async function geminiTry(body: string, models: string[]) {
  for (const mdl of models) for (let a = 0; a < 2; a++) {
    try { const r = await fetch(gUrl(mdl), { method: "POST", headers: { "x-goog-api-key": GKEY(), "Content-Type": "application/json" }, body }); const g = await r.json(); const ans = g?.candidates?.[0]?.content?.parts?.[0]?.text; if (ans) return ans; if (g?.error?.code === 429) break; } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return "";
}
function capLinesTg(lines: string[], title: string): string | null {
  const u = [...new Set(lines)].slice(0, 12); if (!u.length) return null;
  return (title ? title + ":\n" : "") + u.map((l) => "• " + l).join("\n");
}
function localFindTg(data: any, question: string): string | null {
  if (!data?.districts) return null;
  const q = aiNorm(question); const qd = String(question).replace(/\D/g, "");
  let role: string | null = null;
  if (/kadr/.test(q)) role = "k"; else if (/buxgalter|hisobchi/.test(q)) role = "b";
  else if (/boshli|rahbar|direktor|mudir|yuriskonsul|yurist/.test(q)) role = "r";
  const dist = (data.districts || []).find((d: any) => q.includes(d.id) || q.includes(aiNorm(d.name).split(" ")[0]));
  const sl = (s: any, dn: string) => `${s.fio}${s.lavozim ? " — " + s.lavozim : ""}, ${dn}${(s.tel || []).length ? " ☎ " + s.tel.join(", ") : ""}`;
  const ol = (lbl: string, p: any, org: string, dn: string) => `${org} — ${lbl}: ${p.fio}${(p.tel || []).length ? " ☎ " + p.tel.join(", ") : ""} (${dn})`;
  let lines: string[] = [];
  if (dist && /markaz|boshli|yuriskonsul|yurist/.test(q)) {
    for (const s of (dist.markaz || [])) { if (!s.fio || s.fio === "Vakant") continue; const lav = aiNorm(s.lavozim || "");
      if (/boshli|yurist|yuriskonsul/.test(q)) { if (/boshli|yurist|yuriskonsul/.test(lav)) lines.push(sl(s, dist.name)); } else lines.push(sl(s, dist.name)); }
    const r = capLinesTg(lines, `${dist.name} — markaz xodimlari`); if (r) return r;
  }
  const scope = dist ? [dist] : (data.districts || []); let oHit: any = null, oDist: any = null;
  for (const d of scope) { for (const o of (d.orgs || [])) {
    const on = aiNorm(o.org); const onumM = on.match(/^\s*(\d+)\s*-/); const onum = onumM ? onumM[1] : null;
    let typeRe: RegExp | null = null; if (/maktab/.test(on)) typeRe = /maktab/; else if (/dmtt|bog/.test(on)) typeRe = /dmtt|bog/; else if (/poliklinika|oilaviy/.test(on)) typeRe = /poliklinika|oilaviy/;
    let hit = false;
    if (onum && typeRe) hit = new RegExp(`(^|\\D)${onum}\\s*-?\\s*(son|sonli|maktab|dmtt|bog|poliklinika|oilaviy)`).test(q) && typeRe.test(q);
    else { for (const kws of Object.values(DEPT_KW)) { if (kws.some((k) => on.includes(aiNorm(k))) && kws.some((k2) => q.includes(aiNorm(k2)))) { hit = true; break; } } }
    if (hit) { oHit = o; oDist = d; break; }
  } if (oHit) break; }
  if (oHit) {
    const roles: [string, string][] = role ? [[role, ({ r: "Rahbar", k: "Kadrlar boʻlimi", b: "Buxgalter" } as any)[role]]] : [["r", "Rahbar"], ["k", "Kadrlar boʻlimi"], ["b", "Buxgalter"]];
    for (const [rk, lbl] of roles) { const p = oHit[rk]; if (p && p.fio) lines.push(ol(lbl, p, oHit.org, oDist.name)); }
    const r = capLinesTg(lines, `${oHit.org} (${oDist.name})`); if (r) return r;
  }
  if (qd.length >= 5) {
    for (const d of (data.districts || [])) {
      for (const s of (d.markaz || [])) if (s.fio && (s.tel || []).some((t: string) => t.replace(/\D/g, "").includes(qd))) lines.push(sl(s, d.name));
      for (const o of (d.orgs || [])) for (const rl of [["r", "Rahbar"], ["k", "Kadrlar"], ["b", "Buxgalter"]] as [string, string][]) { const p = o[rl[0]]; if (p?.fio && (p.tel || []).some((t: string) => t.replace(/\D/g, "").includes(qd))) lines.push(ol(rl[1], p, o.org, d.name)); }
      if (lines.length >= 10) break;
    }
    const r = capLinesTg(lines, "Topilgan kontaktlar"); if (r) return r;
  }
  const STOPW = new Set(["kim","nima","qancha","telefon","raqam","raqami","nomer","markaz","tuman","shahar","boshli","boshligi","rahbar","rahbari","kadrlar","buxgalter","yurist","yuriskonsult","necha","qaysi","bormi","haqida","uchun","ning","bolimi","bolim","xojaligi","xojalik","boshqarmasi","boshqarma","birlashmasi","inspeksiyasi","idora","faoliyatiga","oid"]);
  const terms = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPW.has(w));
  if (terms.length) {
    for (const d of scope) {
      for (const s of (d.markaz || [])) { if (!s.fio) continue; const hay = aiNorm(s.fio + " " + (s.lavozim || "")); if (terms.some((t) => hay.includes(t))) lines.push(sl(s, d.name)); }
      for (const o of (d.orgs || [])) { const hay = aiNorm([o.org, o.r?.fio, o.k?.fio, o.b?.fio].join(" ")); if (terms.some((t) => hay.includes(t))) { for (const rl of [["r", "Rahbar"], ["k", "Kadrlar"], ["b", "Buxgalter"]] as [string, string][]) { const p = o[rl[0]]; if (p?.fio) lines.push(ol(rl[1], p, o.org, d.name)); } } }
      if (lines.length >= 12) break;
    }
    const r = capLinesTg(lines, "Qidiruv natijasi"); if (r) return r;
  }
  return null;
}
async function askAI(data: any, question: string): Promise<{ answer: string; source?: string[] }> {
  let targets = findDocs(data, question);
  if (!targets.length) targets = findBuyruqDocs(data, question);
  if (targets.length) {
    const parts: any[] = []; const used: string[] = [];
    for (const t of targets) { try { const b = await fetchDocBytes(t.p); if (b.length <= 14 * 1024 * 1024) parts.push({ inline_data: { mime_type: "application/pdf", data: toB64(b) } }); else { const uri = await uploadToGemini(b, t.p); parts.push({ file_data: { mime_type: "application/pdf", file_uri: uri } }); } used.push(`${t.org} (${t.district}) — ${t.label}`); } catch (_) {} }
    if (parts.length) {
      parts.push({ text: question });
      const sys = `Sen Navoiy viloyati yuridik xizmat markazlari yordamchisisan. Foydalanuvchi savoliga FAQAT berilgan hujjat(lar) asosida toʻliq, aniq javob ber. Hujjat(lar): ${used.join("; ")}. Asosiy bandlarni izohlab ber. Hujjat skaner boʻlib matn noaniq boʻlsa harfma-harf koʻchirma — mazmunini toza oʻzbek tilida tushuntir, buzuq belgilar chiqarma. Hujjatda maʼlumot boʻlmasa "Bu maʼlumot hujjatda yoʻq" deb ayt.`;
      const ans = await geminiTry(JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 1000 } }), ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
      if (ans) return { answer: ans, source: used };
      return { answer: `«${used[0]}» hujjati topildi, biroq hozir javob olishda xatolik. Birozdan soʻng qayta urinib koʻring.` };
    }
  }
  // LOKAL javob (Gemini'siz) — telefon/ism/tashkilot/rol. Kvota tejaladi va doim ishlaydi.
  const localAns = localFindTg(data, question);
  if (localAns) return { answer: localAns };
  const ctx = buildAiContext(data, question);
  const sys = `Sen Navoiy viloyati yuridik xizmat markazlari maʼlumotnomasi yordamchisisan. Quyidagi maʼlumot asosida aniq, qisqa javob ber. Telefon, F.I.O., tashkilot nomlarini aniq keltir. Normativ-huquqiy savol boʻlsa mos lex.uz havolasini koʻrsat. Faqat berilgan maʼlumotga tayan; bilmasang "Bu maʼlumot bazada yoʻq" deb ayt.\n\n=== MAʼLUMOTLAR ===\n${ctx}`;
  const ans = await geminiTry(JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: question }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }), ["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
  return { answer: ans || "Hozir AI vaqtincha band. Aniq ism, tashkilot nomi yoki telefon raqamini yozsangiz — darhol topib beraman. Yoki /menu orqali qidiring." };
}
function cleanAns(t: string) { return String(t || "").replace(/\*\*/g, "").replace(/^#{1,6}\s*/gm, "").trim().slice(0, 3900); }
async function runAI(chat_id: number, question: string, loginKey: string) {
  try {
    const uzStart = new Date(Date.now() + 5 * 3600e3); uzStart.setUTCHours(0, 0, 0, 0);
    const sinceIso = new Date(uzStart.getTime() - 5 * 3600e3).toISOString();
    const { count } = await db.from("ai_logs").select("id", { count: "exact", head: true }).eq("login", loginKey).gte("created_at", sinceIso);
    if ((count || 0) >= 20) { await sendPlain(chat_id, "Bugungi AI savollar limiti (20 ta) tugadi. Ertaga yana savol berishingiz mumkin."); return; }
  } catch (_) {}
  await tg("sendChatAction", { chat_id, action: "typing" });
  const res = await askAI(await getData(), question);
  let out = cleanAns(res.answer);
  if (res.source?.length) out += `\n\n📄 Manba: ${res.source.join("; ")}`;
  await sendPlain(chat_id, out, { inline_keyboard: [[{ text: "🤖 Yana savol", callback_data: "ai" }], [{ text: "🏠 Bosh menyu", callback_data: "m" }]] });
  try { await db.from("ai_logs").insert({ login: loginKey, question }); } catch (_) {}
}

Deno.serve(async (req) => {
  // Fail-closed: sekret oʻrnatilmagan boʻlsa ham yoki mos kelmasa ham — rad etamiz (hech qachon ochiq qolmaydi)
  if (!HOOK_SECRET || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== HOOK_SECRET) return new Response("forbidden", { status: 403 });
  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  // ---------- Tugma bosilishi (callback) ----------
  if (update.callback_query) {
    const cq = update.callback_query;
    const cid = cq.message?.chat?.id, mid = cq.message?.message_id;
    try {
      await answerCb(cq.id);
      const { data: chat } = await db.from("tg_chats").select("authorized").eq("chat_id", cid).maybeSingle();
      if (chat?.authorized !== true) { await send(cid, "🔒 Avval telefon raqamingizni tasdiqlang: /start"); return new Response("ok"); }
      const [a, did, p2, p3] = String(cq.data || "").split("~");
      const data = await getData();
      if (a === "m") { const v = mainMenu(data); await edit(cid, mid, v.text, v.kb); }
      else if (a === "d") { const v = districtView(data, did, +p2 || 0); await edit(cid, mid, v.text, v.kb); }
      else if (a === "g") { const v = markazView(data, did); await edit(cid, mid, v.text, v.kb); }
      else if (a === "o") { const v = orgView(data, did, +p2, +p3 || 0); await edit(cid, mid, v.text, v.kb); }
      else if (a === "f") { await sendDoc(data, did, +p2, +p3, cid); }
      else if (a === "ai") { await tg("sendMessage", { chat_id: cid, text: AI_PROMPT, reply_markup: { force_reply: true, input_field_placeholder: "Savolingiz..." } }); }
    } catch (_e) {}
    return new Response("ok");
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return new Response("ok");
  const chat_id = msg.chat.id;
  const text = (msg.text || "").trim();
  const uname = msg.from?.username || "";
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");

  try {
    const { data: chat } = await db.from("tg_chats").select("authorized,name").eq("chat_id", chat_id).maybeSingle();
    const authed = chat?.authorized === true;
    const showMenu = async () => { const v = mainMenu(await getData()); await send(chat_id, v.text, v.kb); };

    if (!authed) {
      if (msg.contact) {
        if (msg.contact.user_id && msg.from?.id && msg.contact.user_id !== msg.from.id) { await send(chat_id, "Iltimos, pastdagi tugma orqali <b>oʻz</b> raqamingizni yuboring.", contactKb()); return new Response("ok"); }
        const staff = findStaffByPhone(await getData(), msg.contact.phone_number);
        if (staff) {
          await db.from("tg_chats").upsert({ chat_id, username: uname, name: staff.fio, authorized: true, last_seen: new Date().toISOString() });
          await send(chat_id, `✅ <b>Tasdiqlandi!</b>\n${esc(staff.fio)} — ${esc(staff.lavozim)}, ${esc(staff.district)}`, { remove_keyboard: true });
          await showMenu();
        } else if (isAdminPhone(msg.contact.phone_number)) {
          await db.from("tg_chats").upsert({ chat_id, username: uname, name: name || "Administrator", authorized: true, last_seen: new Date().toISOString() });
          await send(chat_id, "✅ <b>Tasdiqlandi!</b> (administrator)", { remove_keyboard: true });
          await showMenu();
        } else {
          await db.from("tg_chats").upsert({ chat_id, username: uname, name, authorized: false, last_seen: new Date().toISOString() });
          await send(chat_id, "❌ Bu raqam markaz xodimlari roʻyxatida topilmadi.\n\nAgar yuridik xizmat markazi xodimi boʻlsangiz, administrator bilan bogʻlaning.", { remove_keyboard: true });
        }
        return new Response("ok");
      }
      // XAVFSIZLIK (#10): admin telefonini MATN sifatida yozib avtorizatsiya OLIB TASHLANDI —
      // raqam egaligi isbotlanmaydi (birov admin raqamini bilса admin boʻlib olardi).
      // Admin faqat tasdiqlangan kontakt (user_id===from.id, yuqorida) yoki kirish kodi orqali kiradi.
      if (CODE && text === CODE) { await db.from("tg_chats").upsert({ chat_id, username: uname, name, authorized: true, last_seen: new Date().toISOString() }); await send(chat_id, "✅ <b>Tasdiqlandi!</b>", { remove_keyboard: true }); await showMenu(); return new Response("ok"); }
      await db.from("tg_chats").upsert({ chat_id, username: uname, name, authorized: false, last_seen: new Date().toISOString() });
      await send(chat_id, "🔒 <b>Navoiy viloyati yuridik xizmat markazlari</b> maʼlumotnomasi.\n\nFoydalanish uchun telefon raqamingizni tasdiqlang — pastdagi <b>“📱 Telefon raqamni yuborish”</b> tugmasini bosing.", contactKb());
      return new Response("ok");
    }

    await db.from("tg_chats").update({ last_seen: new Date().toISOString() }).eq("chat_id", chat_id);

    if (text === "/start" || text === "/menu" || text.toLowerCase() === "menyu") { await showMenu(); return new Response("ok"); }
    // /org_<did>_<oi> — qidiruvdan batafsilga o'tish
    const m = text.match(/^\/org_([a-z]+)_(\d+)$/i);
    if (m) {
      const v = orgView(await getData(), m[1], +m[2], 0);
      await send(chat_id, v.text, v.kb);
      return new Response("ok");
    }
    // ----- AI yordamchi: /ai buyrugʻi yoki force_reply javobi -----
    if (text === "/ai" || text.toLowerCase() === "ai") {
      await tg("sendMessage", { chat_id, text: AI_PROMPT, reply_markup: { force_reply: true, input_field_placeholder: "Savolingiz..." } });
      return new Response("ok");
    }
    const isAiReply = typeof msg.reply_to_message?.text === "string" && msg.reply_to_message.text.startsWith("🤖 Savolingizni");
    if (isAiReply && text.length >= 2) {
      const key = "tg:" + (chat?.name || name || chat_id);
      const p = runAI(chat_id, text, key);
      const eq = (globalThis as any).EdgeRuntime;
      if (eq?.waitUntil) eq.waitUntil(p); else await p;
      return new Response("ok");
    }

    if (text.length < 2) { await send(chat_id, "Kamida 2 ta belgi kiriting yoki /menu bilan koʻrib chiqing."); return new Response("ok"); }

    const results = searchDirectory(await getData(), text);
    if (!results.length) await send(chat_id, `🔍 "<b>${esc(text)}</b>" boʻyicha hech narsa topilmadi. /menu bilan koʻrib chiqing.`);
    else await send(chat_id, `🔍 <b>${results.length}</b> ta natija:\n\n` + results.slice(0, 10).join("\n\n"));
  } catch (_e) {
    await send(chat_id, "Xatolik yuz berdi. Birozdan soʻng urinib koʻring.");
  }
  return new Response("ok");
});
