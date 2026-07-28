# FabricXAI Owner App — Specification
### The owner's phone-first surface

**Decision: PWA, not native.** The owner app is the responsive phone variant of module 11.2 plus approvals, installed to the home screen, with web push notifications. Rationale: one codebase, instant updates, no app-store cycle, and every capability needed (push, offline shell, install prompt) is available to a PWA in 2026. Revisit native only if push reliability on the pilot owners' actual phones proves inadequate — that's the one honest risk, so it's tested in week one of the pilot.

---

## 1. What the owner actually does (the whole scope)

Research from the personas: an owner checks at night and between meetings, on a phone, for under three minutes. The app serves exactly five verbs — **see exceptions, approve, ask, glance numbers, be alerted.** Nothing else. Every feature request beyond these goes to the desk dashboard instead.

## 2. Screens

**S1 — Exceptions feed (home).** The ranked cards from `exceptions_feed`: LC conflicts, late/at-risk orders, critical CAPs, run-rate misses, payroll anomalies, approvals waiting. Each card: one-sentence truth, one-tap drill, and where applicable the action (approve/escalate/assign). Pull-to-refresh; feed is materialized server-side so it opens in under a second. Empty state is the product's proudest screen: "Nothing needs you. Factory is running."

**S2 — Approvals.** The owner's slice of the Approve Inbox: payroll runs, below-floor margins, UD overrides, terms changes. Swipe-friendly card stack, full detail one tap deep (payroll run shows the anomaly chips first, not 2,400 rows). Biometric confirm (WebAuthn) on money approvals.

**S3 — Numbers.** Six KPI cards with sparklines: order book + coverage, OTD, efficiency trend, DHU, cash position, this-month shipments. Each tappable to a phone-fit detail with period compare. Bengali digits per preference.

**S4 — Ask MARBIM.** The ask bar with voice input (Web Speech, bn + en); answers as shareable cards (share-sheet → WhatsApp). Recent questions pinned.

**S5 — Buyer scorecards.** The "who is actually a good buyer" list, phone-fit.

Navigation: bottom tab bar (Feed · Approvals · Numbers · Ask), scorecards inside Numbers. Dark theme only (matches the system; owners check at night).

## 3. Notifications (the contract that makes the app matter)

Push categories, each owner-configurable: red exceptions (immediate), approvals waiting (immediate), daily digest (one push at a chosen hour: yesterday's production, today's shipments, exceptions count), LC countdowns (21/14/7). Discipline rule enforced server-side: **never more than 3 non-digest pushes a day** — over-notifying an owner kills the channel permanently; overflow folds into the digest.

## 4. Technical notes

Same Next.js app, `(owner)` route group with phone-first layouts; manifest + service worker (shell cache only — data is always live or honestly stale-labeled); web push via VAPID from the notification service; sessions long-lived with biometric step-up for approvals; all reads from the cached aggregate endpoints (no heavy queries from phones).

## 5. Managers get it too

The same PWA serves managers with role-scoped content (their approvals, their department's exceptions). No separate build — the owner app is really "the phone surface," and the owner is its most important user.

## 6. Definition of done

Installs to home screen on the pilot owners' actual devices · push proven on those devices (the week-one test) · feed opens < 1s on 4G · payroll approval end-to-end with biometric · digest at chosen hour in bn · the 3-push discipline enforced · owner completes a full "night check" (feed → one approval → one question) in under 3 minutes, observed.
