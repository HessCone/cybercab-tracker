# Cybercab Count — Texas

A live tracker for how many Cybercabs are registered with the Texas DMV for driverless operation.
Built by Hess Cone. Unofficial fan tracker, not affiliated with Tesla.

## How it works
- **Source:** the Texas DMV (TxDMV Motor Carrier Credentialing System) publishes each company's automated-vehicle roster:
  `https://txmccs.txdmv.gov/api/TruckStop/companies/81edcff1-8a6e-4ed0-be1f-60668515e223/automated-motor-vehicles?limit=100&offset=0`
- **Counting:** VINs starting with `5YJAJEEU` = Cybercab, `7SAYGDEE` = Model Y, anything else = other.
- `fetch.py` (Python standard library only) pages through the whole roster and writes:
  - `data/latest.json` – current counts, check time, every VIN with type + first-seen time
  - `data/history.json` – counts over time (one point per change, at least one per day)
  - `data/vins.json` – first-seen time for every VIN (VINs new since the last run = "added")
- History points marked `"backfilled": true` came from public @fsd_database posts on X (each has its post link). Their Model Y numbers are fleet total minus Cybercabs.
- The site (`index.html`, `style.css`, `app.js`) is plain static files that read `data/*.json`. Chart.js loads from a CDN. No build step.

## Run locally
```bash
python3 fetch.py                 # update data
python3 -m http.server 8000      # then open http://localhost:8000
```

## Put it online for free (a parent needs to make the account)

### Option A: GitHub Pages (auto-updates every hour)
1. Create a new public repo on GitHub and upload everything in this folder (including the hidden `.github` folder and `.nojekyll`).
2. Repo **Settings → Pages → Build and deployment**: Source = "Deploy from a branch", Branch = `main`, folder `/ (root)`. Save.
3. Repo **Settings → Actions → General → Workflow permissions**: choose "Read and write permissions". Save.
4. **Actions** tab → "Update Cybercab count" → **Run workflow** once to test. After that it runs every hour and commits new data, and Pages republishes automatically.
5. Your site is at `https://<username>.github.io/<repo>/`.

### Option B: Netlify
1. Sign in at netlify.com → "Add new site" → "Import from Git" → pick the GitHub repo above (keeps the hourly GitHub Action for data).
2. Build command: leave empty. Publish directory: `.`
3. Every data commit from the Action triggers a redeploy.

(Netlify drag-and-drop also works, but then the numbers only update when you re-upload.)

## Notes
- GitHub may pause scheduled workflows in repos with no activity for 60 days; the hourly data commits normally keep it active.
- Registration ≠ cars giving rides. Texas is currently the only state with a public Cybercab roster.
