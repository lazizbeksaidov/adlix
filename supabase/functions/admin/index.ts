// Admin amallar — foydalanuvchi/parol boshqaruvi.
// Faqat is_admin profilli foydalanuvchi chaqira oladi. Service kaliti faqat shu yerda (serverda).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOMAIN = "@navoiy-adliya.uz";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // So'rovchini tekshirish + admin ekanini
    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Avtorizatsiya yoʻq" }, 401);

    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: prof } = await admin.from("profiles").select("is_admin").eq("user_id", user.id).single();
    if (!prof?.is_admin) return json({ error: "Sizda admin huquqi yoʻq" }, 403);

    const { action, payload } = await req.json();

    if (action === "list") {
      const { data } = await admin.from("profiles").select("*").order("is_admin", { ascending: false });
      return json({ users: data || [] });
    }

    if (action === "aiStats") {
      // So'nggi 7 kun statistikasi
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data: logs } = await admin.from("ai_logs").select("login, question, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
      const rows = logs || [];
      // Sana OʻZBEKISTON (+5) kuni boʻyicha — chat limiti bilan bir xil chegara (#13)
      const uzDay = (t: number) => new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
      const today = uzDay(Date.now());
      let todayCount = 0;
      const byDay: Record<string, number> = {};
      const byQ: Record<string, number> = {};
      const byUser: Record<string, number> = {};
      for (const r of rows) {
        const day = uzDay(new Date(r.created_at).getTime());
        byDay[day] = (byDay[day] || 0) + 1;
        if (day === today) todayCount++;
        const q = (r.question || "").trim().toLowerCase().slice(0, 80);
        if (q) byQ[q] = (byQ[q] || 0) + 1;
        if (r.login) byUser[r.login] = (byUser[r.login] || 0) + 1;
      }
      const top = (o: Record<string, number>, n: number) =>
        Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
      return json({
        total: rows.length, today: todayCount,
        days: Object.entries(byDay).sort().map(([k, v]) => ({ k, v })),
        topQuestions: top(byQ, 8),
        topUsers: top(byUser, 6),
        recent: rows.slice(0, 15).map((r) => ({ login: r.login, q: r.question, at: r.created_at })),
      });
    }

    if (action === "setPassword") {
      const { login, password } = payload;
      if (!login || !password || password.length < 6) return json({ error: "Parol kamida 6 belgi" }, 400);
      const { data: p } = await admin.from("profiles").select("user_id").eq("login", login).single();
      if (!p) return json({ error: "Foydalanuvchi topilmadi" }, 404);
      const { error } = await admin.auth.admin.updateUserById(p.user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, msg: `${login} paroli yangilandi` });
    }

    if (action === "addUser") {
      const { fio, district, lavozim, login, password, is_admin } = payload;
      if (!fio || !login || !password || password.length < 6) return json({ error: "Maydonlar toʻliq emas (parol ≥6)" }, 400);
      const { data: ex } = await admin.from("profiles").select("user_id").eq("login", login).maybeSingle();
      if (ex) return json({ error: "Bu login band" }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email: login + DOMAIN, password, email_confirm: true,
        user_metadata: { fio, login },
      });
      if (error) return json({ error: error.message }, 400);
      // Profil yozuvi muvaffaqiyatsiz boʻlsa — auth akkauntni QAYTARIB OLAMIZ.
      // Aks holda kira oladigan, lekin hech qanday huquqi/hududi yoʻq "yarim" akkaunt qolardi.
      const { error: pErr } = await admin.from("profiles").insert({
        user_id: created.user.id, fio, district: district || "", lavozim: lavozim || "", login, is_admin: !!is_admin,
      });
      if (pErr) {
        try { await admin.auth.admin.deleteUser(created.user.id); } catch (_) { /* qaytarib boʻlmadi */ }
        return json({ error: "Profil yaratilmadi: " + pErr.message }, 500);
      }
      return json({ ok: true, msg: `${login} qoʻshildi` });
    }

    if (action === "removeUser") {
      const { login } = payload;
      if (login === "admin") return json({ error: "Superadminni oʻchirib boʻlmaydi" }, 400);
      const { data: p } = await admin.from("profiles").select("user_id").eq("login", login).single();
      if (!p) return json({ error: "Topilmadi" }, 404);
      // AVVAL profil (huquq) oʻchiriladi — agar keyingi qadam uzilsa ham kirish huquqi qolmaydi
      const { error: dErr } = await admin.from("profiles").delete().eq("login", login);
      if (dErr) return json({ error: "Profil oʻchirilmadi: " + dErr.message }, 500);
      const { error: aErr } = await admin.auth.admin.deleteUser(p.user_id);
      if (aErr) return json({ error: "Huquq olib tashlandi, lekin akkaunt oʻchmadi: " + aErr.message }, 500);
      return json({ ok: true, msg: `${login} oʻchirildi` });
    }

    return json({ error: "Nomaʼlum amal" }, 400);
  } catch (e) {
    return json({ error: "Server xatosi: " + String(e) }, 500);
  }
});
