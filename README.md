# IIIT Bhubaneswar Messmate

Disposable prepaid hostel mess demo built with plain HTML, CSS, JavaScript, a Node.js HTTP server and SQLite. No React or paid payment integration.

## Local development

Requires Bun 1.4.2 and Node.js 24+.

```sh
bun install --frozen-lockfile
bun start
# http://localhost:3000
bun run test
```

Local development uses `mess.sqlite` unless `MESS_EPHEMERAL=1` is set. Database files and uploaded images are not committed.

## Docker / disposable deployment

```sh
docker build -t iiitbh-mess-webapp .
docker run --rm -p 3000:3000 iiitbh-mess-webapp
```

The container runs as a non-root user. It uses in-memory SQLite (`MESS_EPHEMERAL=1`) and temporary uploads. Restarting replaces all wallets, reservations, complaints, uploaded images and login sessions with fresh demo state. No persistent volume is required. Multiple runtime instances have independent data; this is a demonstration, not a production mess system. Do not submit personal information.

Vercel: use the Container framework preset, project root `Dockerfile`, and `PORT=3000`. The image already defines `MESS_EPHEMERAL=1` and `MESS_UPLOADS_DIR=/tmp/mess-uploads`. Configure Bun as the install command if using the alternative Node Functions adapter. No database, storage or payment token is required. Vercel credentials belong in its CLI credential store, never in this repository.

## Demo accounts

- Student: `student@iiitbh.ac.in`
- Admin: `admin@iiitbh.ac.in`
- Demo-only password: `mess2026`
- 55 seeded students. Demo bookings and used-token examples are generated at startup.

## Features and rules

- Advance packs: breakfast ₹25, lunch/dinner ₹50. Same-day singles: ₹32/₹60/₹60.
- Non-veg lunch/dinner options Wednesday, Friday and Sunday, at the same price as veg.
- Purchasing debits the wallet; QR/code redemption is single-use and never charges again.
- Admin weekly timetable with photo editing, cooking forecast and redeemed-token history.
- Menu changes generate in-app student notices.
- Complaint submission with private image retrieval (PNG/JPEG/WebP, up to 3 MB).
- Dark mode and responsive student/admin dashboards.

## Limitations

Payments and student identities are simulated. Shared public demo credentials are intentional and unsuitable for real student use. Camera scanning and institute SSO are not connected; counter redemption uses pasted QR token codes. Meal prices/menu strings are illustrative, not the institute's official schedule. Unsplash photos are illustrative and have local image fallbacks.

Bun is primary (`bun.lock`); `pnpm-lock.yaml` is retained by request. pnpm compatibility requires `--config.package-manager-strict=false`. No npm lockfile is included.

