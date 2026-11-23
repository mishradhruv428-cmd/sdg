# Campus Cab Share

A campus ride-sharing app for Bennett University students. Students sign in with a Bennett email, post or join upcoming rides, manage their trips, and see sharing impact.

## What changed

- Ride joins check capacity, departure time, repeat joins, and the saved profile setting for women-only rides in the database.
- Added the missing `leave_ride`, `cancel_ride`, and `mark_departed_rides_completed` functions.
- Past rides stay visible to their poster and members; completed rides can be counted in campus impact.
- Ride-mate phone details are available only while an upcoming ride is active.
- Direct client edits to ride records are removed; cancellation goes through a database check.
- Updated spacing and app background, removed a remote font dependency, and kept demo data available as a local-only preview that is not saved to Supabase.

## Apply to an existing project

1. Back up your Supabase database.
2. In Supabase, open **SQL Editor** and start a new query.
3. Paste and run `supabase/migrations/2026-11-22_ride-security.sql`. It keeps existing rides and replaces the relevant policies/functions. The migration is safe to run again.
4. Replace `src/App.jsx` and `src/index.css` with the versions in this package.
5. Keep your existing Supabase URL and publishable key in Replit Secrets or `.env.local`; never use a service-role or secret key in browser code.
6. Run the project's build check, then publish/redeploy your Replit app.

## Set up a new Supabase project

1. Create a Supabase project.
2. Run the existing base setup at `supabase/schema.sql` in SQL Editor.
3. Then run `supabase/migrations/2026-11-22_ride-security.sql`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from Supabase to Replit Secrets. For local work, copy `.env.example` to `.env.local` and replace the example values.
5. Enable email confirmation in Supabase Auth. Set the deployed site as the Auth Site URL and add it to the allowed redirect URLs.
6. Install the project dependencies through Replit if needed, build the app, and publish it.

## Quick smoke test

Use two Bennett accounts: create a ride, join it from the second account, confirm contact is shown only to the rider, leave and confirm a seat reopens, then cancel from the poster account. Also test a full ride, a departed ride, and the impact page. The women-only check reads the gender selected in the student's own profile; it is not institutional identity verification.

## Hosting note

The project includes a Wrangler static-assets config. If you deploy to Cloudflare, build first and deploy with Wrangler. For Replit, use its normal publish flow. Keep the Supabase redirect URL aligned with the actual public app URL.
