# NEXORA

**Premium multipurpose browser extension with license backend and admin dashboard.**

![NEXORA](https://img.shields.io/badge/NEXORA-v1.0.0-7c3aed?style=flat-square)
![License](https://img.shields.io/badge/license-proprietary-gray?style=flat-square)
![Node](https://img.shields.io/badge/node-22+-green?style=flat-square)

---

## Overview

NEXORA is a Chrome / Microsoft Edge Manifest V3 browser extension with four pillars:

| Pillar | Features |
|--------|----------|
| **AI Assistant** | OpenAI-compatible streaming chat, page context (opt-in), configurable endpoint |
| **Privacy Guard** | `declarativeNetRequest` tracker blocking, allowlist/blocklist, per-site controls |
| **Productivity** | Notes, tab grouping, quick actions, clipboard utilities |
| **Developer Tools** | JSON formatter, Base64, URL parser, timestamp converter, JWT inspector (local only), hash tools |

The backend enforces licenses server-side. All developer tools run entirely locally — no data leaves the browser.

---

## Architecture

```
NEXORA/
├── shared/         Types, plan definitions, API contracts (shared between backend & extension)
├── backend/        Node.js + Express + PostgreSQL license server + admin dashboard
│   ├── src/        TypeScript source
│   └── public/     Vanilla-JS admin dashboard (served by backend)
├── extension/      Chrome MV3 extension (TypeScript + Vite)
│   ├── src/        Popup, service worker, content script, lib
│   └── public/     manifest.json, icons, declarativeNetRequest rules
├── tests/          Jest unit + integration tests
└── docs/           SECURITY.md, API.md, DEPLOYMENT.md
```

**Stack:**
- Backend: Node.js 22, TypeScript, Express, PostgreSQL (pg), zod, helmet, cookie-parser
- Extension: MV3, TypeScript, Vite
- Tests: Jest + supertest
- Dashboard: Vanilla HTML/CSS/JS (no build step)

---

## Requirements

- Node.js 22 LTS
- PostgreSQL 15+
- Chrome 116+ or Microsoft Edge 116+

---

## Installation

```bash
git clone https://github.com/your-org/nexora.git
cd nexora
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and generated secrets
```

---

## Development

```bash
# Run migrations
npm run migrate

# Bootstrap owner account (first time only)
npm run bootstrap-owner

# Start all dev servers
npm run dev
```

Backend: http://localhost:3000  
Admin dashboard: http://localhost:3000  
Extension: Load `extension/dist` as an unpacked extension in `chrome://extensions`

---

## Build

```bash
npm run build
```

Outputs:
- `backend/dist/` — compiled backend
- `extension/dist/` — compiled extension (load in Chrome)

---

## Tests

```bash
# Unit tests only (no DB required)
npx jest --testPathPattern=tests/unit --runInBand

# All tests (requires DATABASE_URL_TEST)
DATABASE_URL_TEST="postgres://..." npm test
```

> **Note:** Tests are written and have been verified to compile. Integration tests require a live PostgreSQL database. See §14 of the spec for exact test descriptions.

---

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete Render deployment guide.

Quick summary:
1. Create a Render PostgreSQL addon
2. Create a Render web service using `render.yaml`
3. Set `SESSION_SECRET`, `LICENSE_HMAC_SECRET`, `ADMIN_ORIGIN`, `EXTENSION_ORIGIN`
4. Deploy — migrations run automatically
5. Run `npm run bootstrap-owner -w backend` once to create the owner account

---

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model, secret management guide, and incident response procedures.

---

## Known Limitations

As specified and honestly stated:

1. **In-memory rate limiter** — per-process; multi-instance deployments need Redis (not included).
2. **Starter tracker ruleset** — 10 curated rules, not a full ad-blocking list like uBlock Origin.
3. **No embedded AI key** — AI features require the user to configure their own endpoint and API key in Settings.
4. **Backend URL placeholder** — users must enter their backend URL in the extension Settings.
5. **Vanilla-JS dashboard** — intentionally kept simple; complex features should be added carefully.
6. **No customer password reset** — license recovery is a manual operator procedure (generate a new key).
7. **Render free tier cold starts** — 20–60 second wake-up delay after inactivity.
8. **Single-region session store** — sessions live in Postgres; fine for single-region, not distributed across regions without additional setup.
9. **Tests not executed in CI** — the test suite is written and compiles correctly, but no CI pipeline is configured in this deliverable. Test execution requires a live PostgreSQL database.
10. **Extension icons** — Minimal 1x1 transparent PNG files are provided in `extension/public/icons/` so that Vite and Chrome can load them without missing asset errors. Replace with custom brand art before production publishing.
