// R2 hujjatlari uchun signed URL — faqat login qilgan foydalanuvchiga.
// Har hujjat uchun 2 ta havola: view (brauzerда ochish) + dl (yuklab olish, filename bilan).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;
const aws = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY")!,
  secretAccessKey: Deno.env.get("R2_SECRET_KEY")!,
  region: "auto",
  service: "s3",
});
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// XAVFSIZLIK: kalit faqat xavfsiz belgilardan iborat boʻlsin — traversal/normalizatsiya hujumiga qarshi
// (staff-edit dagi bilan bir xil qoida). Bucketdagi ixtiyoriy obyektni imzolab berishning oldini oladi.
const KEY_OK = (k: string) =>
  typeof k === "string" && k.length > 0 && k.length <= 200 &&
  !k.includes("..") && /^[A-Za-z0-9][A-Za-z0-9/_.\-]*$/.test(k);

async function sign(key: string, disposition: string) {
  const base = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
  const u = `${base}?X-Amz-Expires=3600&response-content-disposition=${encodeURIComponent(disposition)}`;
  const signed = await aws.sign(u, { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    // {items:[{p, fn}]} yoki eski {paths:[...]}
    const list: { p: string; fn?: string }[] = Array.isArray(body.items) ? body.items
      : Array.isArray(body.paths) ? body.paths.map((p: string) => ({ p })) : [];
    if (!list.length) return json({ error: "no paths" }, 400);

    const urls: Record<string, { view: string; dl: string }> = {};
    for (const it of list.slice(0, 30)) {
      const key = String(it.p).replace(/^\/+/, "");
      if (!KEY_OK(key)) continue; // notoʻgʻri kalit — imzolamaymiz
      const fn = (it.fn || key.split("/").pop() || "hujjat.pdf").replace(/["\\]/g, "");
      urls[it.p] = {
        view: await sign(key, "inline"),
        dl: await sign(key, `attachment; filename="${fn}"`),
      };
    }
    return json({ urls });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
