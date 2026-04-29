# SnapAudit Speed, Consistency, and Reliability Plan

Date: April 27, 2026

## Verification Performed

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed; hook coverage now verifies user-scoped sessions and duplicate store prevention.
- `npm run test:e2e`: passed; Playwright covers the local authenticated mobile audit flow.
- Local dev server: started successfully at `http://localhost:3000`; `/api/health` returned `{"status":"ok"}`.
- Headless mobile smoke test: loaded the sign-in screen with no application console errors. Dev-mode navigation timing was about 1.24 s to DOMContentLoaded and 1.26 s to load, with 23 resources transferred.

## Progress Update - April 27, 2026

- Added local test auth via `?testAuth=1` in development or `VITE_ENABLE_TEST_AUTH="true"`.
- Added the first Vitest coverage for user-scoped sessions and duplicate store prevention.
- Fixed duplicate custom store insertion during batched React updates.
- Moved local photo image payload persistence to IndexedDB when available; localStorage now stores photo metadata without base64 `imageData`.
- Verified the local authenticated flow with a fake camera: create session, enter camera, adjust zoom, capture, tag, and save.
- Confirmed saved photo metadata in localStorage does not include `imageData`.
- Batched background session/photo metadata sync, added an in-flight guard, and added retry backoff after partial syncs or errors.
- Added signed URL cache expiry and in-flight request reuse to reduce repeated Supabase signed URL calls.
- Bounded PDF photo prefetch concurrency and capped markup editor undo snapshots to reduce memory spikes during large reports or long edit sessions.
- Production-mode smoke test loaded the sign-in screen with no console errors.
- Added Playwright E2E coverage for the local test-auth mobile audit flow: create session, enter camera, zoom, capture, tag, save, and verify photo metadata excludes `imageData`.
- Added a configurable HMR port so E2E/dev servers do not collide with other local Vite processes.
- Expanded Playwright E2E coverage for upload fallback, editing from the report, history store filtering, and deleting a session.
- Fixed a history-view bug where delete confirmation state was set but the confirmation modal was not rendered.
- Added accessible names for camera icon buttons so snapshot/upload/photos controls are easier to test and more accessible.
- Replaced fixed remote session/photo limits with paginated Supabase reads so larger audit histories can hydrate consistently.
- Limited background storage uploads to bounded concurrency and batch-upserted synced photo metadata after uploads complete.

## Testing Limits

- The authenticated audit/camera/report workflow is now covered locally through test auth and fake media.
- Camera permission and capture behavior should be verified on real target devices, especially iOS Safari and Android Chrome, because camera APIs and file saving behave differently by browser.
- Live Supabase sync should still be checked with a real account and realistic network conditions before calling the remote path fully validated.

## Improvement Plan

1. Add an authenticated test harness.
   - Status: mostly implemented. Local test auth is available, fake media is configured, and Playwright covers session creation, camera zoom/capture, upload fallback, tagging, report editing, history filtering, and delete confirmation.
   - Remaining: add coverage for sign-in with a real seeded account, PDF/share menu behavior, and any Supabase row-level-security failures.

2. Move unsynced photo payloads out of `localStorage`.
   - Status: implemented for browsers with IndexedDB support, with localStorage fallback for unsupported environments.
   - `useSnapAudit` currently persists the full `photos` array, including base64 image data before sync, on every photo state change.
   - Store photo blobs/data URLs in IndexedDB and keep only metadata in localStorage. Debounce metadata writes to reduce main-thread stalls.
   - Keep a migration path for existing localStorage photos.

3. Make background sync more predictable.
   - Status: implemented for the local client path. Sync now batches session/photo metadata writes, prevents overlapping runs, limits storage upload concurrency, and backs off after partial syncs or errors.
   - Remaining: verify live Supabase behavior with large queues, intermittent offline/online transitions, and row-level-security failures.

4. Cache remote photo URLs with expiry and in-flight de-duplication.
   - Status: implemented for signed URL creation and remote metadata hydration.
   - `ensureSignedUrl` caches URLs, but not expiry or active requests.
   - Signed URL entries now track `{ url, expiresAt, promise? }` to prevent repeated Supabase calls and stale links.
   - Remote session/photo metadata now pages through Supabase instead of relying on fixed `500` session and `2000` photo limits.

5. Reduce PDF generation memory spikes.
   - Status: started. Report photo prefetch now runs with bounded concurrency.
   - PDF generation already lazy-loads `jspdf` and `html2canvas`, which is good.
   - The risky part is pre-fetching every photo at once and rendering the full report at `scale: 2`.
   - Add bounded photo-fetch concurrency, downscale report images before embedding, show progress/cancel UI, and use lower scale or chunked rendering for very large reports.

6. Cap markup editor history growth.
   - Status: implemented. Undo history is capped at 25 snapshots.
   - `MarkupEditor` stores a full data URL snapshot for each completed stroke.
   - Cap undo history and consider storing drawing commands or compressed snapshots to prevent memory growth during long edit sessions.

7. Add observability for slow paths.
   - Measure image resize time, sync queue length/duration, signed URL fetches, PDF generation duration, and storage quota failures.
   - Surface recoverable errors as user-facing toasts instead of only console logs.

8. Keep bundle weight under watch.
   - Production build chunks are reasonable, and the heavy PDF libraries are split out.
   - Continue keeping report/PDF code lazy-loaded, and consider route/component splitting if the authenticated app grows.
