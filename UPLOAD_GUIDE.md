# Atlas Terminal — Launch Guide (15 minutes, no coding)

You'll do everything in the browser, same as with PeFundTracker. Five steps.

---

## Step 1 — Create the repository (2 min)

1. Go to **github.com** and log in (`gattusopierre01-cloud`).
2. Click the **+** (top right) → **New repository**.
3. Repository name: **atlas-terminal** (or any lowercase name — it becomes your URL).
4. Set it to **Public** (required for free GitHub Pages).
5. Tick **"Add a README file"**.
6. Click **Create repository**.

## Step 2 — Upload the files (4 min)

1. Unzip **atlas-terminal.zip** on your computer. You'll see folders: `assets`, `data`, `scripts`, plus the `.html` files, `requirements.txt` and `README.md`.
2. In your new repo, click **Add file → Upload files**.
3. Drag **everything inside the unzipped folder** into the upload area — including the folders. GitHub keeps the folder structure automatically.
   - ⚠️ If your computer hides the `.github` folder (it starts with a dot), don't worry — Step 3 handles it separately.
4. Scroll down, click **Commit changes**.

## Step 3 — Create the automation robot (3 min)

The nightly data robot lives in a special hidden folder, easiest to create by hand:

1. In the repo, click **Add file → Create new file**.
2. In the filename box type exactly: `.github/workflows/update-data.yml`
   (typing the `/` automatically creates the folders).
3. Open the file **github-workflow-update-data.yml** from the zip in any text editor, copy ALL of it, and paste it into the big box on GitHub.
4. Click **Commit changes**.

## Step 4 — Turn on the website (2 min)

1. In the repo, go to **Settings → Pages** (left sidebar).
2. Under "Build and deployment" → Source: **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. Wait ~2 minutes, refresh the page — GitHub shows your live URL:
   `https://gattusopierre01-cloud.github.io/atlas-terminal/`

The globe works immediately (it uses live World Bank + GDELT data).
The Markets and Screener pages show sample rows until Step 5.

## Step 5 — Run the first data load (1 min + 30 min wait)

1. Go to the **Actions** tab of the repo.
2. If GitHub asks, click **"I understand my workflows, enable them"**.
3. Click **Update market data** (left list) → **Run workflow** → green **Run workflow** button.
4. It runs for roughly 20–40 minutes (it's downloading ~650 stocks). When the tick turns green, refresh your site — the full screener is live.

From now on it refreshes itself every weekday at 22:15 UTC. You never touch it again.

---

## Routine maintenance (optional, rare)

**After a central bank changes rates:** open `data/central_banks.json` on GitHub → pencil icon → edit the number → Commit. 30 seconds.

**If the Action fails one day** (Yahoo hiccup, Wikipedia layout change): it just keeps yesterday's data — the site never breaks. Check the Actions tab for a red X; re-run it, and if it keeps failing, we debug together.

**⚠️ One GitHub quirk:** scheduled workflows pause automatically after 60 days of no commits to the repo. Any tiny edit (even to the README) restarts the clock. Since the robot itself commits data daily, this only matters if the Action breaks silently — worth a glance once a month.
