# SnapAudit QA Report

Date: April 16, 2026  
Auditor: QA Engineer

---

## Bugs

### 1. Missing Delete Button on History View Card
**Location:** `App.tsx:302-341` (HistoryCard component)

**Issue:** The HistoryCard has swipe-to-reveal buttons (Edit/Delete) that work via touch events, but there's also a visible pencil button in the card content (line 328-336). Clicking the pencil in the card does the same thing as the swipe action but there's no delete button visible on the card itself without swiping.

**Recommendation:** Add a visible delete button next to the edit (pencil) button in the card content for better discoverability.

---

### 2. Session Title Auto-Populate Uses US Date Format Only
**Location:** `App.tsx:892-900`

**Issue:** The session title auto-populates with format `MM/DD/YY-XXXX`. This only supports US date format and may be confusing for international users.

**Recommendation:** Consider adding a locale preference or making the date format configurable.

---

### 3. Wake Lock Only Requested on Session View
**Location:** `App.tsx:903-924`

**Issue:** The screen wake lock is only requested when `view === 'session'`. It should also be active during photo capture/tagging, as users may spend significant time writing comments.

**Recommendation:** Extend wake lock to also activate when `capturedImage` is present (tagging overlay).

---

### 4. No Error Handling for Camera Access
**Location:** `App.tsx:2195-2220`

**Issue:** If camera access fails, there's no user-facing error message or fallback option (like allowing file upload instead).

**Recommendation:** Add a user-friendly error state when camera fails, with option to upload from files.

---

### 5. iOS File Picker May Not Work Consistently
**Location:** `App.tsx:945-974`

**Issue:** The `showOpenFilePicker` API is used when available (Chromium-based browsers), but iOS Safari doesn't support this API. The fallback to hidden file input may not be triggered properly in all cases.

**Recommendation:** Consider testing on various iOS versions and potentially simplifying to always use the file input approach.

---

### 6. Potential Memory Leak in Blob Cache
**Location:** `App.tsx:703-712`

**Issue:** The `cachePhotoBlob` function uses LRU-like eviction but only keeps track of the "oldest" key, not a true LRU. If entries are added/removed out of order, it may not properly evict the oldest entries.

**Recommendation:** Implement proper LRU cache or increase the cache limit.

---

### 7. Photo Editor Doesn't Handle Missing Image Data
**Location:** `App.tsx:1030-1053`

**Issue:** If `photo.imageData` is missing and the download fails, the editor opens with no image. There's no error state shown to the user.

**Recommendation:** Add error handling to show a message when image cannot be loaded for editing.

---

### 8. Custom Store Number Validation
**Location:** `App.tsx:1000-1008`

**Issue:** The custom store number is validated to be exactly 4 digits, but there's no duplicate check against existing stores. Adding a duplicate store number is silently accepted.

**Recommendation:** Add validation to prevent duplicate store numbers.

---

## UX/UI Issues

### 9. History View Filter Doesn't Persist
**Location:** `App.tsx:623-627`

**Issue:** The `historyFilter` state is not persisted to localStorage. Users lose their filter settings when they reload.

**Recommendation:** Persist filter state to localStorage.

---

### 10. Bottom Nav Missing on History View
**Location:** `App.tsx:1544-1578`

**Issue:** The BottomNav component IS rendered on history view (line 1570), but it doesn't have an active indicator since `view === 'history'` but `activeView` is being passed as `view`.

**Actually working as expected** - but see below.

---

### 11. No Visual Feedback When No Sessions in History
**Location:** `App.tsx:493-498`

**Issue:** The empty state shows "No sessions found" which is fine, but there's no way to navigate back to home or create a new session from this screen.

**Recommendation:** Add a button to create a new session or navigate to home.

---

### 12. Share Menu on Desktop Uses Print Icon for Download
**Location:** `App.tsx:2032`

**Issue:** The download button uses an Upload icon rotated 180 degrees (line 2032), which is confusing. It should use a Download icon.

**Recommendation:** Use `Download` icon instead of rotated `Upload`.

---

### 13. Report Photos Not Sorted by Category Order
**Location:** `App.tsx:1427-1430`

**Issue:** Photos are grouped by tag, but within each category they're sorted by `createdAt` descending. This means newer photos appear first in each category, which may not be the desired order for reports.

**Recommendation:** Consider adding option to sort by creation time or maintain insertion order.

---

### 14. Dark Mode Toggle Inconsistency
**Location:** `App.tsx:1674-1679`

**Issue:** The dark mode toggle is in the header, but dark mode state is also checked for PDF generation (to force light mode). The toggle is accessible but users may not notice it's available.

**Recommendation:** Consider adding dark mode toggle to a more prominent location or adding a tooltip.

---

### 15. Long Comments May Break Report Layout
**Location:** `App.tsx:1502-1506`

**Issue:** Very long comments without line breaks could potentially break the layout in the report view, especially on mobile/PDF.

**Recommendation:** Add `word-break` or `overflow-wrap` to comment text.

---

## Optimizations

### 16. Sync Delay Could Be Reduced
**Location:** `App.tsx:875`

**Issue:** The sync waits 2 seconds before starting. While this prevents rapid syncing during active photo capture, it could be reduced to 1 second for faster cloud backup.

**Recommendation:** Consider reducing to 1 second or making it configurable.

---

### 17. Photo Prefetch Only on iOS
**Location:** `App.tsx:714-721`

**Issue:** Photo blob prefetching is only enabled for iOS devices. Android devices could also benefit from prefetching to improve performance.

**Recommendation:** Enable prefetching for all mobile devices or based on available memory.

---

### 18. Signed URLs Cached Indefinitely
**Location:** `App.tsx:655-669`

**Issue:** Signed URLs are cached in `photoUrls` state but never expire. If a URL is cached for a long time, it may expire before the user tries to use it.

**Recommendation:** Either refresh URLs periodically or re-fetch when needed.

---

### 19. PDF Generation Could Use Web Workers
**Location:** `App.tsx:1115-1392`

**Issue:** PDF generation is done on the main thread, which can cause UI jank on slower devices. Web Workers could be used to offload the processing.

**Recommendation:** Consider using a Web Worker for html2canvas rendering.

---

### 20. Large Session Lists Not Virtualized
**Location:** `App.tsx:1749-1808`

**Issue:** Sessions are rendered all at once without virtualization. For users with many sessions, this could cause performance issues.

**Recommendation:** Consider using react-window or similar for session list virtualization.

---

### 21. Multiple Supabase Queries on Remote Load
**Location:** `App.tsx:564-606`

**Issue:** The remote load effect makes separate queries for sessions and photos. These could potentially be combined or parallelized.

**Recommendation:** Use Promise.all to parallelize or consider a single query with joins.

---

## Security / Data Integrity

### 22. No Confirmation for Bulk Delete
**Location:** `App.tsx:1696-1709`

**Issue:** When storage error occurs, the "Clear All Data" button immediately shows a confirmation modal, but this is the only way to clear data. Consider adding a "Clear Photos Only" option to free up space without losing sessions.

**Recommendation:** Add option to clear only photos while keeping session metadata.

---

### 23. Offline Delete Not Synced
**Location:** `App.tsx:1109-1113`

**Issue:** If a user deletes a session while offline, it works locally but the `deleteSessionRemote` function checks for `!isOnline` and returns early, so remote deletion never happens when they come back online.

**Recommendation:** Queue deletions for when the device comes back online.

---

## Accessibility

### 24. Missing ARIA Labels on Some Buttons
**Location:** Various

**Issue:** Several buttons lack proper ARIA labels for screen readers, particularly icon-only buttons like the dark mode toggle, share buttons, etc.

**Recommendation:** Add `aria-label` attributes to all icon-only buttons.

---

### 25. Color Contrast in Dark Mode
**Location:** Various

**Issue:** Some text colors in dark mode may not meet WCAG AA contrast requirements. Particularly the gray text for metadata.

**Recommendation:** Review and adjust colors for contrast compliance.

---

### 26. Focus States Not Visible
**Location:** Various

**Issue:** There are no visible focus states for keyboard navigation on buttons and inputs.

**Recommendation:** Add visible focus styles for keyboard users.

---

## Minor Issues

### 27. Toast Messages Not Accessible
**Location:** `App.tsx:1521-1528`

**Issue:** Toast messages use a simple div with no ARIA announcement.

**Recommendation:** Add `role="status"` or `aria-live="polite"` to toast container.

---

### 28. Loading State Uses "Loading..." Text
**Location:** `App.tsx:1532-1537`

**Issue:** The auth loading screen just shows "Loading..." without any indication of what's happening.

**Recommendation:** Add a spinner or more descriptive loading message.

---

### 29. Unused Import
**Location:** `App.tsx:2`

**Issue:** `ErrorInfo` is imported from React but never used.

**Recommendation:** Remove unused import.

---

### 30. Magic Numbers in Code
**Location:** Various

**Issue:** Code contains magic numbers like `50`, `70`, `40` for vibrate, `500` for limit, `2000` for timeout, etc.

**Recommendation:** Extract to named constants for maintainability.

---

### 31. Type Assertion for Crypto
**Location:** `App.tsx:119`

**Issue:** `(globalThis.crypto as any)?.randomUUID?.()` uses `any` type assertion.

**Recommendation:** Use proper type checking or declare the type properly.

---

### 32. Inconsistent Naming: "Entries" vs "Photos"
**Location:** `App.tsx:1802`

**Issue:** The home view shows "X Entries" but elsewhere uses "Photos". Terminology should be consistent.

**Recommendation:** Standardize on "Photos" or "Entries" throughout.

---

## Database/Backend

### 33. No Pagination on Remote Queries
**Location:** `App.tsx:571-572`, `App.tsx:585-586`

**Issue:** Queries use `.limit(500)` for sessions and `.limit(2000)` for photos, but there's no pagination support for larger datasets.

**Recommendation:** Implement pagination or cursor-based fetching.

---

### 34. No Indexes Defined in SQL
**Location:** `supabase.sql` (not reviewed, but assumed)

**Issue:** Likely no indexes on `user_id`, `session_id`, or `created_at` columns which would slow down queries as data grows.

**Recommendation:** Add database indexes on frequently queried columns.

---

## Summary

| Category | Count |
|----------|-------|
| Bugs | 8 |
| UX/UI Issues | 7 |
| Optimizations | 6 |
| Security/Data | 2 |
| Accessibility | 3 |
| Minor Issues | 5 |
| Database | 2 |
| **Total** | **33** |

---

*End of QA Report*
