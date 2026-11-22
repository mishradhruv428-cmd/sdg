# Campus Cab Share — Replit project

A Vite + React version of the app using Supabase Auth and Postgres, with Tailwind styling.

## Start on Replit

1. Create a React/Vite Replit project, then upload/extract this archive into its workspace.
2. In Replit Secrets, create `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use the URL and `sb_publishable_...` key from your Supabase project.
3. Confirm `supabase/schema.sql` has been run in Supabase SQL Editor. Do not rerun it if the tables and policies already exist.
4. Install the dependencies from the Replit Shell if they were not installed automatically.
5. Press Run. The project starts with `npm run dev`.

For local development, copy `.env.example` to `.env.local`, fill in the two values, install dependencies, and start the Vite server. `.env.local` is gitignored.

## Email confirmation

If Supabase email confirmation is enabled, set your Replit app URL as the Supabase Auth Site URL and add it to the allowed Redirect URLs under Authentication URL Configuration. Then sign up with a `@bennett.edu.in` address, confirm the email, sign in, and finish the profile form.

## Notes

- Rides load from Supabase; the sample rides were removed. The list is empty until a ride is posted.
- Post, My rides, and Impact are still placeholders.
- The publishable key is meant for browser use with RLS enabled. Never use a `sb_secret` or service-role key in the client.
- The Supabase SDK persists the auth session in the browser.

## Stack

React 18, Vite, Tailwind CSS, and `@supabase/supabase-js`.
