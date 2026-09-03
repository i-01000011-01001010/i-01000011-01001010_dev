# i.01000011.01001010.dev

Coming-soon landing page for i-01000011-01001010.dev, with an interactive
3D "project galaxy" as an early preview: identity at the center, project
categories as solar systems, individual projects as planets orbiting them.

Deployed as a Cloudflare Worker serving static assets — same pattern as
the other X42 sites.

## Structure

```
public/                     everything actually served
  index.html                 landing / coming-soon page
  404.html                   branded not-found page
  demo/index.html             the galaxy, full-screen (also embedded via
                               iframe on the landing page)
  assets/css/site.css         shared brand: fonts, colors, buttons, wordmark
  assets/css/galaxy.css       demo-only chrome: scene, popup, back/pause buttons
  assets/js/galaxy.js         all of the three.js logic
  assets/data/projects.json   the actual content — the only file you touch
                               to add, edit, or remove a project

wrangler.jsonc               Worker config — points at ./public, no server
                              code needed since this is a static site
package.json                 wrangler as a dev dependency, dev/deploy scripts
.github/workflows/deploy.yml deploys on every push to main
```

## Adding a project

Open `public/assets/data/projects.json`. Find the system (category) it
belongs in, or add a new system, and push a project object onto its
`projects` array:

```json
{
  "id": "some-short-slug",
  "label": "Human-readable name",
  "desc": "One or two sentences about it.",
  "github": "https://github.com/you/repo",   // optional
  "demo": "https://example.com",             // optional
  "status": "live"                           // optional, free text
}
```

That's it. Position, orbit radius, orbit speed, and tilt are all derived
from a hash of the system/project id in `galaxy.js`, so nothing needs to
be hand-placed and nothing will collide with an existing planet. Adding
a whole new system works the same way — add an object to the top-level
`systems` array with an `id`, `label`, `color` (hex string), `desc`, and
a `projects` array; the layout ring just gets one more slot automatically.

## Running locally

```
npm install
npm run dev
```

`wrangler dev` serves `./public` correctly, including `fetch()` calls to
`projects.json` — unlike double-clicking the HTML files directly, which
browsers block for `file://` URLs.

## First-time setup

1. `npm install`
2. `npx wrangler login` — authorizes wrangler against your Cloudflare account
3. Set `account_id` in `wrangler.jsonc`. If your token has access to more
   than one Cloudflare account (that's what caused the CI error above),
   wrangler won't guess — run `npx wrangler whoami` to list the account
   names and IDs available to you, and paste the right one in. The
   account ID isn't secret, so it's fine to commit.
4. `npm run deploy` — publishes to `<name>.<your-subdomain>.workers.dev`
5. In the Cloudflare dashboard, under this Worker → **Settings → Domains &
   Routes**, add `i-01000011-01001010.dev` as a custom domain.

## Continuous deploy from GitHub

`.github/workflows/deploy.yml` runs `wrangler deploy` on every push to
`main`. It needs one repo secret:

- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: a Cloudflare API token with the **Edit Cloudflare Workers**
  template permissions (create one at
  `dash.cloudflare.com` → My Profile → API Tokens)

Once that's set, `git push` is the whole deploy process.
