# Helmet.js Usage & Threat Mitigation in BulSU Space

This document explains how Helmet is configured in `server/server.js`, what each enabled (or disabled/replaced) middleware does, and the concrete threats mitigated. It also notes additional custom middleware layered on top of Helmet.

---
## Location & Version
- Initialization: `server/server.js`
- Package: `server/package.json` lists `helmet@^8.1.0`

```js
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Using custom CSP
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  hidePoweredBy: true,
  dnsPrefetchControl: { allow: false },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  originAgentCluster: true,
  permissionsPolicy: false // handled elsewhere
}));
```

Custom CSP & extra headers are applied afterwards (`csp.reactCSP`, `securityMiddleware.additionalSecurityHeaders`, etc.).

---
## Helmet Directives & Threats
| Helmet Option | Header(s) Set | Primary Threats Mitigated | Notes |
| ------------- | ------------- | -------------------------- | ----- |
| `frameguard: deny` | `X-Frame-Options: DENY` | Clickjacking (UI redress) | Prevents *any* framing (including same-origin). |
| `noSniff: true` | `X-Content-Type-Options: nosniff` | MIME sniffing → content-type confusion → XSS / drive‑by downloads | Stops browsers guessing MIME type. |
| `xssFilter: true` | `X-XSS-Protection: 0 or 1; mode=block` (legacy behavior) | Reflected XSS (legacy browsers) | Modern browsers rely on CSP (already custom). Low modern impact but harmless defense-in-depth. |
| `hsts` | `Strict-Transport-Security` | SSL stripping / MitM downgrade | Forces HTTPS; preload + subdomains strengthens trust. Requires valid HTTPS on all subdomains. |
| `hidePoweredBy` | Removes `X-Powered-By` | Fingerprinting for automated exploit scanning | Obscures tech stack (minor, defense-in-depth). |
| `dnsPrefetchControl: {allow:false}` | `X-DNS-Prefetch-Control: off` | Privacy / Side-channel enumeration | Prevents early DNS lookups that might leak visited domains. |
| `referrerPolicy: strict-origin-when-cross-origin` | `Referrer-Policy` | Sensitive path leak via Referer header | Sends full referrer on same-origin, only origin part cross-origin. |
| `crossOriginEmbedderPolicy: true` | `Cross-Origin-Embedder-Policy: require-corp` | Cross-origin data leaks (Spectre-like) | Demands explicit CORP headers for cross-origin resources; enables powerful isolation. |
| `crossOriginOpenerPolicy: same-origin` | `Cross-Origin-Opener-Policy` | Cross-window data leaks / Spectre | Isolates browsing context group; prevents window.opener attacks. |
| `crossOriginResourcePolicy: same-origin` | `Cross-Origin-Resource-Policy: same-origin` | Unintended cross-origin resource sharing | Blocks other origins embedding your resources unless same-origin. |
| `originAgentCluster: true` | `Origin-Agent-Cluster: ?1` | Cross-origin memory side-channels | Requests isolation for JS agent clusters mitigating some side-channel vectors. |
| `contentSecurityPolicy: false` | (Disabled here) | (N/A) | Replaced by custom dynamic CSP with nonces in `csp.reactCSP` (see below). |
| `permissionsPolicy: false` | (Disabled here) | (Handled elsewhere) | Custom header set later for granular feature control. |

---
## Custom Middleware (Beyond Helmet)
The project layers additional protections (from `server/middleware/`):
| Middleware | Key Protections |
| ---------- | --------------- |
| `csp.reactCSP` | Strict CSP with dynamic nonces: mitigates XSS, inline script/style injection, mixed content. |
| `xssProtection` | Additional HTML sanitization / header hardening (if implemented) for stored or reflected payloads. |
| `preventParameterPollution` | Guards against HTTP Parameter Pollution (HPP) attacks altering server logic through duplicated params. |
| `additionalSecurityHeaders` | May add: `X-Download-Options`, `X-Permitted-Cross-Domain-Policies`, `Expect-CT` etc. (Check file for specifics). |
| `noCacheHeaders` | Disables caching for sensitive responses (protects session & PII leakage via shared caches). |
| `reflectedDownloadProtection` | Mitigates Reflected File Download attacks (content download misinterpretation). |
| Transport security middleware | Early HTTP→HTTPS redirect, reiterates HSTS & sets Secure / SameSite cookie attributes -> MitM & session fixation mitigation. |
| Rate limiter (authLimiter) | Brute force & credential stuffing mitigation (esp. login endpoints). |

---
## Threat Mapping Summary
| Threat Category | Mitigation Stack |
| --------------- | ---------------- |
| XSS (Reflected/Stored) | Custom CSP (nonces, source allowlist), Helmet legacy XSS filter, input sanitization (elsewhere) |
| Clickjacking | `X-Frame-Options: DENY` (frameguard) |
| MIME Sniffing / Content-Type Confusion | `X-Content-Type-Options: nosniff` |
| HTTPS Downgrade / SSL Stripping | HSTS + redirect middleware |
| Cross-Origin Data Leakage / Spectre | COEP, COOP, CORP, Origin Agent Cluster |
| CSRF (partially) | Strict referrer policy, SameSite cookies (in transport middleware), plus any CSRF tokens (cookie parser in place) |
| Session Hijacking | Secure cookies, HSTS, no caching, limited referrers |
| Recon / Fingerprinting | Removing X-Powered-By, restrictive CSP, referrer policy |
| HTTP Parameter Pollution | `preventParameterPollution` custom middleware |
| Reflected File Download | `reflectedDownloadProtection` custom middleware |
| Brute Force Login | `authLimiter` rate limiting |

> NOTE: CSRF full mitigation depends on token verification endpoints (not shown here). Helmet alone does not solve CSRF.

---
## Content Security Policy (Replaced Helmet CSP)
Reasons for disabling Helmet's built-in CSP:
1. Need dynamic nonces per response for inline scripts/styles (React hydration, possibly analytics injection).
2. Fine-grained directives beyond Helmet's static config.
3. Ability to centralize React-specific allowances (e.g., `script-src 'nonce-<dynamic>' 'self'` + strict `img-src`).

Ensure: All inline scripts/styles must carry the generated nonce; avoid falling back to `'unsafe-inline'` which would weaken XSS defenses.

---
## Adding New Features Safely
| Feature | Considerations |
| ------- | -------------- |
| Third-party script | Add host to CSP `script-src`, prefer subresource integrity (SRI), avoid wildcards. |
| Embedded iframe | Needs relaxed frameguard (currently DENY) → consider sandboxed embed page + explicit allowlist. |
| Cross-origin images | Add domains to `img-src`; ensure they do not enable exfil channels. |
| Web Workers / WASM | Adjust CSP: `worker-src` / `script-src` and COOP/COEP interplay for SharedArrayBuffer usage. |
| New API using cookies | Confirm SameSite/Secure attributes applied; if cross-site required, apply CSRF tokens. |

---
## Common Pitfalls & How Avoided Here
| Pitfall | Mitigation Present |
| ------- | ----------------- |
| Weak CSP w/ `unsafe-inline` | Replaced by nonce-based custom CSP. |
| Mixed content (HTTPS site loading HTTP assets) | HSTS + expected CSP `upgrade-insecure-requests` (verify present). |
| Overly permissive framing | `DENY` stops all — consider `SAMEORIGIN` if future embed need arises. |
| Accidentally leaking internal paths in Referer | `strict-origin-when-cross-origin` trims path cross-site. |

---
## Quick Checklist for Security PR Reviews
- [ ] New external domains added to CSP explicitly.
- [ ] No introduction of inline script without nonce.
- [ ] Frameguard policy reconsidered if legitimate embed requested.
- [ ] Feature requiring camera/mic/storage: update Permissions Policy (currently custom-coded, verify headers).
- [ ] Large file download endpoints set correct `Content-Type` (nosniff already assists). 
- [ ] Rate limiter extended if new auth-sensitive endpoints created.

---
## Potential Improvements
1. **Report-Only CSP Channel**: Add a `Content-Security-Policy-Report-Only` header for staged changes & telemetry.
2. **Expect-CT / Certificate Transparency**: Ensure deprecated but historical consistency (depending on current browser relevance).
3. **Subresource Integrity (SRI)**: For any CDN assets retained.
4. **Automated Header Tests**: Integration test asserting header presence/values.
5. **Permissions Policy Hardening**: Explicit deny list for geolocation, camera, microphone, fullscreen, payment.
6. **Dynamic Referrer Policy Per Route**: Stricter (`no-referrer`) on sensitive endpoints.
7. **CSP Hashes for Static Inline Chunks**: Replace nonces for cache-friendly determinism where possible.

---
## Developer Quick Reference
| Goal | Step |
| ---- | ---- |
| Adjust X-Frame policy | Update `frameguard` in Helmet config (server.js). |
| Add new domain for images | Modify custom CSP middleware `img-src`. |
| Relax cross-origin resource | Adjust `crossOriginResourcePolicy` or use proper CORS config. |
| Change referrer behavior | Update `referrerPolicy` setting. |
| Disable HSTS temporarily (NOT recommended) | Remove/alter `hsts` config & transport security middleware. |

---
_Last updated: 2025-08-17_
