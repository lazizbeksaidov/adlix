# ADLIX — AI-Powered Legal Services Platform

[![CI](https://github.com/lazizbeksaidov/adlix/actions/workflows/ci.yml/badge.svg)](https://github.com/lazizbeksaidov/adlix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live](https://img.shields.io/badge/live-adlix.uz-1f3b73)](https://adlix.uz)

**A digital reference, management, and oversight system for regional legal‑service centers, with a built‑in AI legal assistant.**

🌐 **Live:** [adlix.uz](https://adlix.uz) · Region: Navoiy, Uzbekistan · Status: **in production use**

> **Access note.** The live system is behind authentication because it holds the contact details of 722 organizations and their responsible officers. This is a deliberate privacy decision, not a missing feature. Reviewer access can be provided on request.

> Submitted to the **President AI Award** (National AI Startup Competition & Acceleration Program) — category: *AI in Government / Public Administration*.

---

## The problem

Regional legal‑service centers coordinate hundreds of organizations (schools, kindergartens, agencies). In practice this means:

- **Documents re‑uploaded endlessly.** In the existing e‑workflow, every organization re‑uploads the same collective agreement, internal rules, etc. on each submission. A single 50 MB scan can be uploaded several times a day — bloating storage and slowing the whole system.
- **Contacts are scattered.** Finding one responsible person's phone across 700+ organizations takes calls and manual searching.
- **No single source of truth.** Data lives in spreadsheets and inboxes, drifts, and goes stale.
- **Manual reporting & weak oversight.** Leadership can't see gaps across districts in real time.

## The solution — ADLIX

A single platform that unifies contacts, documents, legal templates and an AI assistant, with district‑scoped editing and real‑time oversight.

### Key numbers (live)

| 11 districts/cities | 722 organizations | 2,200+ documents | 427 legal templates | 39 center staff |
|---|---|---|---|---|

### Features

- 🔎 **Instant search & reverse lookup** — find a person, organization or phone in seconds; type a number to learn whom it belongs to.
- 🗂️ **Documents stored once, always ready** — each document is uploaded a single time to object storage and stays attached to its organization. No re‑uploads.
- 📤 **Direct‑to‑storage uploads** — large files (up to 300 MB) go straight to Cloudflare R2 via short‑lived, size‑bound presigned URLs, bypassing the server entirely.
- 🤖 **AI legal assistant (Google Gemini)** — answers natural‑language questions from the directory and from documents (including OCR of scanned PDFs), with source attribution and a daily per‑user quota.
- 📚 **427 ready legal templates** + links to the national legal database.
- 📊 **Real‑time oversight dashboard** — analytics by district, an interactive region map (built from real district borders), data‑completeness worklists, and document‑gap monitoring.
- 📝 **Tamper‑evident audit log** — every edit (who, when, old → new) is recorded server‑side.
- 📱 **Telegram bot & Mini App** — search and AI from a phone, with phone‑number‑based access control.
- 🌗 **PWA, Latin/Cyrillic, light/dark** — installable, bilingual, responsive.

---

## Architecture

```
Browser (vanilla JS SPA, PWA)
   │  Supabase JS (auth + data)         ├─ Auth (email/login, JWT)
   ├───────────────────────────────────┤  Postgres  → site_data (JSONB) + RLS
   │  Edge Functions (Deno/TypeScript)  ├─ site_data_backup (auto snapshot trigger)
   │    • staff-edit  (district-scoped saves, optimistic locking, presigned R2)
   │    • chat        (Gemini Q&A over directory + documents, rate-limited)
   │    • docurl      (short-lived signed document URLs)
   │    • admin       (user/role management, service-role)
   │    • tgbot       (Telegram bot webhook)
   │
   ├──▶ Cloudflare R2  (documents, presigned PUT/GET, zero egress cost)
   ├──▶ Google Gemini  (AI assistant, key kept server-side)
   └──▶ Telegram Bot API
```

**Design choices worth noting**

- **Security is server‑enforced.** Row‑Level Security (RLS) gates every table; district staff can edit only their own district; the frontend never holds privileged keys (only the publishable/anon key, which is safe by design).
- **No lost updates.** Both the staff path (Edge Function) and the admin path (client) use **optimistic locking with retry** on `updated_at`; a failed read never overwrites the database.
- **Disaster recovery.** A Postgres trigger snapshots the previous state on every change (24 h of full history + 60 daily snapshots), so any accidental change is recoverable.
- **XSS‑safe rendering.** All user content is HTML‑escaped; phone values are sanitized before entering `tel:` links; CSP locks down sources.
- **Efficient sync.** Live refresh first checks a lightweight `updated_at` and only pulls the full dataset when it actually changed.

The system has been through **multiple adversarial security & reliability audits**; ~40 findings were fixed and verified against the live system.

---

## Tech stack

- **Frontend:** Vanilla JavaScript (no framework), single‑file SPA, PWA (Service Worker + manifest), custom CSS. Libraries: Supabase‑js, Motion One, qrcode.
- **Backend:** Supabase — Postgres + Auth + Storage, and **Edge Functions** (Deno / TypeScript).
- **Object storage:** Cloudflare R2 (S3‑compatible, presigned uploads).
- **AI:** Google Gemini (`gemini-2.5-flash-lite`).
- **Messaging:** Telegram Bot API + Mini App.
- **Hosting:** Vercel (frontend), custom domain `adlix.uz`.

---

## About this repository (clean‑room public mirror)

This is a **public mirror**, published as a single commit. The project has been developed and deployed continuously since June 2026 (the running application is at build **v67**), but the original repository cannot be opened as‑is: its history contains the personal data of 722 organizations and photographs of 37 civil servants.

Rather than rewriting that history, this mirror was exported from the working tree **without** any personal data, media of individuals, or credentials — so the code can be reviewed while the data stays protected. Version numbers you will see in the code (`?v=67`, `navoiy-v67` in `sw.js`) refer to the deployment build of the live system.

## Repository layout

```
index.html            App shell, auth gate, CSP
css/style.css         Full design system (light/dark, responsive)
js/app.js             SPA: routing, rendering, editing, AI chat, uploads
js/geomap.js          Real district-border map data (derived from KMZ)
js/auth-config.js     Public Supabase URL + publishable key (RLS-protected)
supabase/functions/   Edge Functions (Deno/TS) — full backend logic
  staff-edit/         District-scoped saves, optimistic lock, presigned R2
  chat/               Gemini Q&A over directory & documents
  docurl/             Signed document URLs
  admin/              User & role management
  tgbot/              Telegram bot
manifest.json, sw.js  PWA
vercel.json           Security headers (CSP, HSTS, X-Frame-Options, …)
```

## Running / deploying

The frontend is fully static — it is served by Vercel and talks to the Supabase backend.

**Edge Functions** require these environment variables (see [`.env.example`](.env.example)) — no secrets are committed to this repo:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   # provided by Supabase
R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET       # Cloudflare R2
GEMINI_API_KEY                                               # Google AI
TG_BOT_TOKEN, TG_WEBHOOK_SECRET, TG_ACCESS_CODE, TG_ADMIN_PHONES
```

Deploy an Edge Function:

```bash
supabase functions deploy chat --project-ref <your-ref> --no-verify-jwt
```

> **Data & privacy:** this public repository contains **only source code**. No personal data, credentials, staff photos, or the organization directory are included — those live in the backend, protected by authentication and RLS.

---

## Author

**Saidov Lazizbek Erkin oʻgʻli** — Chief Legal Counsel, Department of Investments, Industry and Trade (Navoiy region). Project lead & developer.
📞 +998 91 333 33 63

## Naming

**ADLIX** is the product/brand name of the platform. Inside the application the institutional title is used instead — *"Navoiy viloyati yuridik xizmat koʻrsatish markazlari"* (Legal Service Centers of Navoiy Region) — because the system is operated by a state body and must present itself under its official name to its users.

## Trademarks and emblems

The MIT license below applies to the **source code only**.

The state emblem of the Ministry of Justice of the Republic of Uzbekistan (`img/logo.png`, `img/icon-192.png`, `img/icon-512.png`), the Telegram bot avatar (`img/bot-logo.png`) and the Lex.uz mark (`img/lex-ai.jpg`) are **not** covered by it. They remain the property of their respective rights holders, are included solely so the interface renders as deployed, and must not be reused.

## License

[MIT](LICENSE) — source code only (see *Trademarks and emblems* above).
