<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SnapAudit

Mobile-first audit tool for capturing photos, tagging issues, and generating PDF reports.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Run the app:
   `npm run dev`

## Supabase Setup (free tier friendly)

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase.sql`.
3. In **Storage**, create a **private** bucket named `photos`.
4. In **Authentication**, enable **Email / Password**.
