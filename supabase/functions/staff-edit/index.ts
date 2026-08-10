// staff-edit: tuman bo'yicha cheklangan tahrirlash (district-scoped).
// Har bir xodim FAQAT o'z hududini saqlay oladi / fayl yuklaydi; admin (Viloyat) — hammasini.
// Server tomonda majburlanadi. Fayl yuklash funksiya orqali proxy qilinadi (CORS shart emas).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const R2_ACCOUNT = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const aws = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY")!,
  secretAccessKey: Deno.env.get("R2_SECRET_KEY")!,
  region: "auto",
  service: "s3",
});
const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
const anonDb = createClient(SUPA_URL, ANON, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAXFILE = 30 * 1024 * 1024;

async function authProfile(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user }, error } = await anonDb.auth.getUser(token);
  if (error || !user) return { err: json({ error: "unauthorized" }, 401) };
  const { data: prof } = await admin.from("profiles").select("district,is_admin,login").eq("user_id", user.id).single();
  if (!prof) return { err: json({ error: "profil topilmadi" }, 403) };
  return { prof };
}
async function allowedDistrictId(prof: any) {
  if (prof.is_admin) return { id: null, data: null };
  const { data: row } = await admin.from("site_data").select("data").eq("id", 1).single();
  const d = (row?.data?.districts || []).find((x: any) => x.name === prof.district);
  if (!d) return { err: json({ error: "Sizning hududingiz topilmadi: " + prof.district }, 403) };
  return { id: d.id };
}

// Tahrir farqini hisoblab, audit jurnali (edit_log) uchun qatorlar tayyorlaydi
function telStr(p: any) { return ((p?.tel) || []).filter(Boolean).join(", "); }
// Nom boʻyicha juftlash kaliti (takroriy nomlar uchun tartib raqami qoʻshiladi)
function pairByKey(arr: any[], keyOf: (x: any) => any): Map<string, any> {
  const m = new Map<string, any>(), seen = new Map<string, number>();
  for (const it of (arr || [])) {
    if (!it) continue;
    const base = String(keyOf(it) ?? "");
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    m.set(base + "#" + n, it);
  }
  return m;
}
function diffDistrict(oldD: any, newD: any, login: string) {
  const rows: any[] = [];
  const dn = newD.name;
  const ROLES: [string, string][] = [["r", "Rahbar"], ["k", "Kadrlar"], ["b", "Buxgalter"]];
  // Orglar — INDEKS emas, NOM boʻyicha juftlanadi: oʻrtadan bittasi oʻchsa qolganlari "oʻzgardi" boʻlib koʻrinmaydi.
  // Takroriy nom (masalan 2 ta "1-DMTT") uchun kalitga tartib raqami qoʻshiladi — soxta yozuvlar chiqmaydi.
  const oO = oldD.orgs || [], nO = newD.orgs || [];
  const oMap = pairByKey(oO, (o: any) => o.org), nMap = pairByKey(nO, (o: any) => o.org);
  for (const [k, nw] of nMap) {
    const o = oMap.get(k);
    if (!o) { rows.push({ login, district: dn, kind: "org-add", ref: nw.org, field: "tashkilot", old_val: "", new_val: nw.org }); continue; }
    for (const [role, lbl] of ROLES) {
      const op = o[role] || {}, np = nw[role] || {};
      if ((op.fio || "") !== (np.fio || "")) rows.push({ login, district: dn, kind: "org", ref: nw.org, field: lbl + " F.I.O.", old_val: op.fio || "", new_val: np.fio || "" });
      if (telStr(op) !== telStr(np)) rows.push({ login, district: dn, kind: "org", ref: nw.org, field: lbl + " telefon", old_val: telStr(op), new_val: telStr(np) });
    }
  }
  for (const [k, o] of oMap) if (!nMap.has(k)) rows.push({ login, district: dn, kind: "org-del", ref: o.org, field: "tashkilot", old_val: o.org, new_val: "" });
  // Markaz xodimlari — F.I.O. boʻyicha juftlanadi
  const oM = oldD.markaz || [], nM = newD.markaz || [];
  const oS = pairByKey(oM, (s: any) => s.fio), nS = pairByKey(nM, (s: any) => s.fio);
  for (const [k, nw] of nS) {
    const o = oS.get(k);
    if (!o) { rows.push({ login, district: dn, kind: "staff-add", ref: nw.fio, field: "markaz xodimi", old_val: "", new_val: nw.fio }); continue; }
    if (telStr(o) !== telStr(nw)) rows.push({ login, district: dn, kind: "staff", ref: nw.fio, field: "markaz telefon", old_val: telStr(o), new_val: telStr(nw) });
    if ((o.tug || "") !== (nw.tug || "")) rows.push({ login, district: dn, kind: "staff", ref: nw.fio, field: "tugʻilgan sana", old_val: o.tug || "", new_val: nw.tug || "" });
  }
  for (const [k, s] of oS) if (!nS.has(k)) rows.push({ login, district: dn, kind: "staff-del", ref: s.fio, field: "markaz xodimi", old_val: s.fio, new_val: "" });
  if (rows.length > 300) { // kesilganini yashirmaymiz
    const extra = rows.length - 299;
    return rows.slice(0, 299).concat([{ login, district: "—", kind: "org", ref: "—", field: "DIQQAT", old_val: "", new_val: `yana ${extra} ta oʻzgarish jurnalga sigʻmadi` }]);
  }
  return rows;
}

// Payload validatsiyasi (#15) — shishishga (DoS) va hujjat yoʻli inyeksiyasiga qarshi
const KEY_OK = (k: any) => typeof k === "string" && k.length <= 200 && !k.includes("..") && /^[A-Za-z0-9][A-Za-z0-9/_.\-]*$/.test(k);
function validateDistrict(d: any): string | null {
  if (!d || typeof d !== "object" || typeof d.id !== "string" || !d.id) return "district notoʻgʻri";
  if (JSON.stringify(d).length > 700_000) return "hudud maʼlumoti juda katta";
  if (d.orgs != null && (!Array.isArray(d.orgs) || d.orgs.length > 3000)) return "orgs notoʻgʻri";
  if (d.markaz != null && (!Array.isArray(d.markaz) || d.markaz.length > 500)) return "markaz notoʻgʻri";
  for (const o of (d.orgs || [])) {
    for (const dc of (o?.docs || [])) {
      if (dc && dc.p != null && !KEY_OK(dc.p)) return "hujjat yoʻli notoʻgʻri: " + String(dc.p).slice(0, 40);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const up = url.searchParams.get("up"); // 'doc' | 'photo' | null

    // ---------- FAYL YUKLASH (proxy) ----------
    if (up === "doc" || up === "photo" || up === "tpl") {
      const { prof, err } = await authProfile(req);
      if (err) return err;
      const key = String(req.headers.get("x-key") || "").replace(/^\/+/, "");
      if (!key) return json({ error: "x-key yo'q" }, 400);
      // XAVFSIZLIK: kalit traversal/normalizatsiyaga qarshi — faqat xavfsiz belgilar, '..' taqiqlanadi
      if (key.length > 200 || key.includes("..") || !/^[A-Za-z0-9][A-Za-z0-9/_.\-]*$/.test(key)) return json({ error: "kalit notoʻgʻri" }, 400);
      if (up === "tpl") {
        // Shablonlar — umumiy (viloyat), faqat superadmin yuklaydi
        if (!prof.is_admin) return json({ error: "Faqat superadmin shablon yuklay oladi" }, 403);
      } else {
        const al = await allowedDistrictId(prof);
        if (al.err) return al.err;
        if (!prof.is_admin) {
          const ok = up === "doc" ? key.startsWith(al.id + "/") : key.startsWith(al.id + "-");
          if (!ok) return json({ error: "Bu hudud sizga tegishli emas" }, 403);
        }
      }
      // OʻCHIRISH: hujjat/shablon roʻyxatdan olib tashlanganda R2 obyektni ham oʻchiramiz (yetim fayl xarajati oldini oladi).
      // Auth + hudud + kalit tekshiruvi yuqorida oʻtdi.
      const del = url.searchParams.get("del");
      if (del && (up === "doc" || up === "tpl")) {
        const r2url = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
        const res = await aws.fetch(r2url, { method: "DELETE" });
        if (!res.ok && res.status !== 404) return json({ error: "R2 DELETE xato: " + res.status }, 500);
        return json({ ok: true, deleted: key });
      }
      // TO'G'RIDAN-TO'G'RI YUKLASH (presign): fayl serverni chetlab R2'ga to'g'ridan boradi — 30MB proksi chegarasi YO'Q.
      // Server faqat auth + hudud + kalit + hajmni tekshirib, imzolangan (5 daqiqalik) PUT-havolani qaytaradi.
      const presign = url.searchParams.get("presign");
      if (presign && (up === "doc" || up === "tpl")) {
        const CTP: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
        const pext = (key.toLowerCase().split(".").pop() || "");
        if (up === "doc" && pext !== "pdf") return json({ error: "faqat .pdf" }, 400);
        if (up === "tpl" && !CTP[pext]) return json({ error: "Ruxsat etilmagan fayl turi (pdf/doc/docx/xls/xlsx/ppt/pptx)" }, 400);
        const size = parseInt(req.headers.get("x-size") || "0", 10);
        if (!size || size <= 0) return json({ error: "x-size yoʻq" }, 400);
        if (size > 300 * 1024 * 1024) return json({ error: "Fayl 300MB dan katta" }, 413);
        const r2url = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}?X-Amz-Expires=300`;
        // Content-Length imzolanadi — mijoz aytgan hajmdan kattaroq fayl yuklolmaydi (imzo majburlaydi)
        const signed = await aws.sign(r2url, { method: "PUT", headers: { "Content-Length": String(size) }, aws: { signQuery: true, allHeaders: true } });
        return json({ url: signed.url, key });
      }
      // Xom ArrayBuffer — tarmoq/saqlash uchun (BodyInit bilan mos); Uint8Array — bayt tekshiruvi uchun
      const ab = await req.arrayBuffer();
      const buf = new Uint8Array(ab);
      if (!buf.length) return json({ error: "bo'sh fayl" }, 400);
      if (buf.length > MAXFILE) return json({ error: "Fayl 30MB dan katta" }, 413);
      if (up === "doc" || up === "tpl") {
        const CT: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
        const ext = (key.toLowerCase().split(".").pop() || "");
        if (up === "doc" && ext !== "pdf") return json({ error: "faqat .pdf" }, 400);
        if (up === "tpl" && !CT[ext]) return json({ error: "Ruxsat etilmagan fayl turi (pdf/doc/docx/xls/xlsx/ppt/pptx)" }, 400);
        const r2url = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
        const put = await aws.fetch(r2url, { method: "PUT", body: ab, headers: { "Content-Type": CT[ext] || "application/octet-stream" } });
        if (!put.ok) return json({ error: "R2 PUT xato: " + put.status }, 500);
        return json({ ok: true, key });
      } else {
        // Rasm (#16): kengaytma whitelisti + oʻlcham + magic-bayt tekshiruvi (public bucketga ixtiyoriy bayt tushmasin)
        const ext = (key.toLowerCase().split(".").pop() || "");
        const IMG_CT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
        if (!IMG_CT[ext]) return json({ error: "Faqat jpg/png/webp rasm" }, 400);
        if (buf.length > 5 * 1024 * 1024) return json({ error: "Rasm 5MB dan katta" }, 413);
        const okMagic =
          (buf[0] === 0xFF && buf[1] === 0xD8) || // JPEG
          (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) || // PNG
          (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50); // RIFF…WEBP
        if (!okMagic) return json({ error: "Rasm fayli buzuq yoki notoʻgʻri format" }, 400);
        const { error: e } = await admin.storage.from("staff").upload(key, ab, { contentType: IMG_CT[ext], upsert: true });
        if (e) return json({ error: e.message }, 500);
        const { data: pub } = admin.storage.from("staff").getPublicUrl(key);
        return json({ ok: true, url: pub.publicUrl });
      }
    }

    // ---------- HUDUDNI SAQLASH ----------
    const { prof, err } = await authProfile(req);
    if (err) return err;
    const body = await req.json();
    if (body.action === "save") {
      const dist = body.payload?.district;
      if (!dist || !dist.id) return json({ error: "district yo'q" }, 400);
      const vErr = validateDistrict(dist);
      if (vErr) return json({ error: vErr }, 400);
      const al = await allowedDistrictId(prof);
      if (al.err) return al.err;
      if (!prof.is_admin && dist.id !== al.id) return json({ error: "Faqat o'z hududingizni tahrirlay olasiz" }, 403);
      // OPTIMISTIK QULF + RETRY (#2/#9): butun blobni koʻr-koʻrona ustiga yozmaymiz.
      // updated_at token bilan shartli update — parallel yozuv boʻlsa 0 qator yangilanadi,
      // qaytadan FRESH oʻqib (boshqa hudud oʻzgarishini saqlab) shu hududni qayta qoʻllaymiz.
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: row, error: re } = await admin.from("site_data").select("data,updated_at").eq("id", 1).single();
        if (re || !row) return json({ error: "site_data o'qilmadi" }, 500);
        const data = row.data;
        const oldTs = row.updated_at;
        const idx = (data.districts || []).findIndex((x: any) => x.id === dist.id);
        if (idx < 0) return json({ error: "hudud topilmadi" }, 404);
        const logRows = diffDistrict(data.districts[idx], dist, prof.login);
        data.districts[idx] = dist;
        const { data: upd, error: e } = await admin.from("site_data")
          .update({ data, updated_by: prof.login, updated_at: new Date().toISOString() })
          .eq("id", 1).eq("updated_at", oldTs).select("id");
        if (e) return json({ error: e.message }, 500);
        if (upd && upd.length) {
          // muvaffaqiyat — audit jurnalini yozamiz (yozuv xatosi saqlashga taʼsir qilmasin)
          try { if (logRows.length) await admin.from("edit_log").insert(logRows); } catch (_) { /* ataylab eʼtiborsiz: asosiy amalga taʼsir qilmasin */ }
          return json({ ok: true });
        }
        // konflikt: bu orada boshqa yozuv boʻldi — qaytadan urinamiz
      }
      return json({ error: "Saqlab boʻlmadi — ayni damda boshqa tahrir ketmoqda. Qayta urining." }, 409);
    }
    return json({ error: "noma'lum amal" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
