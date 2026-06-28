# FCC2026 Stage Project

This is the **Stage phone/tablet controller** for the FCC2026 AI gimmick.

Open this page on the device used on stage. The operator enters the ceremony PIN, arms the AI, starts voice input, and sends the approved initiation command to Supabase.

## Files

- `index.html` — Stage controller page
- `stage.js` — voice recognition, safety request, manual/reset buttons
- `styles.css` — FCC2026 visual theme
- `config.js` — public Supabase URL, anon key, shared session ID
- `supabase.sql` — run once in Supabase SQL Editor
- `supabase/functions/fcc2026-command/index.ts` — Supabase Edge Function

## Run locally

From inside this folder:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500/
```

Use Chrome for microphone voice recognition. `localhost` is allowed for microphone testing.

## Configure

Edit `config.js`:

```js
SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
SESSION_ID: "fcc2026-main-stage"
```

Use exactly the same `SESSION_ID` in the AV project.

## Supabase setup, run once only

1. Open Supabase SQL Editor.
2. Run `supabase.sql`.
3. Deploy the Edge Function:

```bash
supabase functions deploy fcc2026-command
supabase secrets set GIMMICK_PIN="YOUR-CEREMONY-PIN"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR-SERVICE-ROLE-KEY"
```

If needed:

```bash
supabase secrets set SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
```

Never put the service role key inside `config.js` or GitHub Pages.

## Publish to GitHub Pages

Create a repository, for example:

```text
fcc2026-stage
```

Upload this folder's contents to the repository root. Then enable:

```text
Settings > Pages > Deploy from branch > main > /root
```

The live URL will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/fcc2026-stage/
```

## Stage operation

1. Open the Stage URL on the stage phone/tablet.
2. Enter the ceremony PIN.
3. Click **Connect**.
4. Click **Arm AI**.
5. Click **Start Voice Input**.
6. Say: **Initiate Future Cities**.
7. If the mic fails, use **Manual Initiate**.
8. Use **Reset / Stop AV** to return the AV screen to standby.
