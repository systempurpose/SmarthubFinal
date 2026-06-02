# SmartHub Static Website (HTML only)

This folder is a pure static website. No Laravel and no build step required.

## Files

- `index.html` (professional landing page)
- `styles.css` (responsive UI styling)
- `app.js` (download metrics + redirect logic)
- `email-confirmation/index.html` (kept for auth redirect route)
- `reset-password/index.html` (Supabase password reset route container)
- `password-changed/index.html` (post-reset success route container)
- `.nojekyll`

## Download Tracking + Redirect

When users click **Download for Windows**:

1. The site increments a public counter using CountAPI.
2. It resolves the latest GitHub release.
3. It redirects users to the newest Windows installer asset (fallback: release page).

Configured in `app.js`:

- `RELEASE_OWNER`
- `RELEASE_REPO`
- `TRACKING_NAMESPACE`
- `TRACKING_KEY`

## Deploy to Cloudflare Pages

- Project type: Pages
- Connect repository: `systempurpose/SmartHub3`
- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `.`

## Supabase Redirect URLs

Auth redirect routes are available for Supabase settings:

- `https://<YOUR_DOMAIN>/email-confirmation/`
- `https://<YOUR_DOMAIN>/reset-password/`
- `https://<YOUR_DOMAIN>/password-changed/`

Set the same URL in your SmartHub local config (`supabase.local.json`) for:

- `SMARTHUB_SUPABASE_EMAIL_REDIRECT_URL`
- `SMARTHUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL`
- `SMARTHUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL`
