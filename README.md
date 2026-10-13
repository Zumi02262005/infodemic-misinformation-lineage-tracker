# infodemic-misinformation-lineage-tracker

A web platform that tracks the changes and spread of misinformation claims across public data sets through a visual representation of the claim's lineage as a force-directed graph. The tech stack used is React, Node.js/Express, and PostgreSQL, and relies on NLP similarity APIs to identify textual variations of the claim and display its history.

![Overview: a lineage replayed generation by generation](docs/screenshots/overview.jpg)

| All narratives as clusters | One narrative, with a claim selected |
| --- | --- |
| ![All narratives](docs/screenshots/lineage-all.jpg) | ![Claim inspector](docs/screenshots/lineage-claim.jpg) |

---

## Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Using the app](#using-the-app)
4. [How the lineage engine works](#how-the-lineage-engine-works)
5. [Optional: semantic embeddings (OpenAI or Hugging Face)](#optional-semantic-embeddings-openai-or-hugging-face)
6. [Configuration](#configuration)
7. [Scripts](#scripts)
8. [REST API](#rest-api)
9. [Project structure](#project-structure)
10. [Troubleshooting](#troubleshooting)
11. [About the demo data](#about-the-demo-data)

---

## What it does

- **Groups variants into narratives.** Every claim you add is compared with everything already tracked. If it is close enough to an existing claim, it joins that narrative; otherwise it starts a new one.
- **Reconstructs lineage.** Inside a narrative, claims are ordered by publication date. Each claim's parent is the most similar claim published before it, so the tree shows which earlier wording a variant most likely came from.
- **Explains each mutation.** The change from parent to child is labelled (exaggeration, altered figures, false authority, context shift, viral hook, embellishment, simplification, paraphrase or verbatim copy), with a word-level diff and the exact words that triggered each label.
- **Draws it as a force-directed graph.** A canvas graph with zoom, pan, drag, three layouts (organic, generation rings, time by generation), five colour modes, similarity links between narratives, and animated "flow" along the direction of spread.
- **Replays the spread.** A timeline scrubber hides every claim published after the cursor; press play to watch a lineage grow.
- **Compares any two claims** and searches the tracker for the closest matches to text you paste.
- **Imports data** one claim at a time or in bulk from CSV or JSON, with a dry-run preview of where each claim will land.

Tech stack: **React 19** (Vite) on the front end, **Node.js + Express 5** for the API, **PostgreSQL** for storage, **d3-force** for the graph, and a built-in NLP similarity engine that can optionally blend in **OpenAI** or **Hugging Face** embedding APIs.

---

## Quick start

### 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | **22 LTS or newer** (20.19+ also works) | Includes npm. Check with `node -v`. |
| PostgreSQL | 14 or newer | Install it locally, **or** use Docker (step 3, option B). |

Installing PostgreSQL locally:

- **Windows:** use the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). It asks you to choose a password for the `postgres` user; remember it.
- **macOS:** `brew install postgresql@16 && brew services start postgresql@16` (or [Postgres.app](https://postgresapp.com/)). Homebrew's superuser is your macOS username, with no password.
- **Linux (Debian/Ubuntu):** `sudo apt install postgresql`, then set a password with `sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`.

### 2. Install dependencies

From the project folder:

```bash
npm install
```

This installs both the server and the client (the repo uses npm workspaces).

### 3. Point the app at PostgreSQL

Copy the example settings file:

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows (PowerShell)
Copy-Item server/.env.example server/.env
```

Then choose one option.

**Option A: your own PostgreSQL.** Edit `DATABASE_URL` in `server/.env` to match your user and password:

```ini
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/infodemic
```

On macOS with Homebrew this is usually `postgres://YOUR_MAC_USERNAME@localhost:5432/infodemic`. If the password contains `@ : / # %`, percent-encode those characters (for example `p@ss` becomes `p%40ss`).

**Option B: Docker.** Leave `server/.env` as it is and start the bundled database:

```bash
docker compose up -d
```

You don't need to create the `infodemic` database yourself. The server creates it, builds the tables and loads the demo data the first time it starts.

### 4. Start the app

```bash
npm run dev
```

This starts both processes:

- the **web app** at **http://localhost:5173** (open this one)
- the **API** at http://localhost:4000 (the web app forwards `/api` requests to it)

The first start prints something like:

```
server │ [api] Infodemic API listening on http://localhost:4000
server │ [db] Created database "infodemic".
server │ [db] Database is empty. Loading the demo dataset…
server │ [db] Loaded 80 claims in 7 narratives (62 similarity links).
client │   VITE ready
client │   ➜  Local:   http://localhost:5173/
```

Press `Ctrl+C` to stop both. If PostgreSQL isn't reachable, the server keeps running, prints what is wrong and how to fix it, retries every few seconds, and the web app shows the same message in a banner until it connects.

### Run it as a single local server (optional)

To serve the built app and the API from one port:

```bash
npm run build      # builds the React app into client/dist
npm start          # serves app + API at http://localhost:4000
```

---

## Using the app

### Overview

The landing page replays the longest lineage in your data generation by generation, showing exactly which words were removed and added at each step. Below it:

- **Narratives**: every narrative with a thumbnail of its lineage tree, its fact-check verdict, how long it was active, and its size.
- **Spread over time**: a streamgraph of when each narrative's variants appeared. Hover a stream to identify it; click to open it.
- **How claims change**: the mix of mutation types, with what each one means.
- **Sources** and **Latest additions**.

### Lineage explorer (`/lineage`)

Pick **All narratives** or a single narrative from the list on the left.

| Action | How |
| --- | --- |
| Inspect a claim | Click a dot. The right panel shows the text, source, the diff from its parent, the change labels, its full lineage, the variants it spawned, and similar claims in other narratives. |
| Move around | Scroll to zoom, drag the background to pan, drag a dot to move it, or use the zoom buttons. The fit button reframes everything. |
| Keyboard | Focus the graph (Tab), then **←/→** step through claims in time order, **↑** goes to the parent, **↓** to the first child, **Esc** clears the selection, **+/−** zoom, **0** fits. |
| Layouts | **Organic** (force-directed), **Generations** (rings around the origin, one per generation), **Timeline** (left to right by date, one row per generation). |
| Colour by | Mutation type, narrative, source type, generation, or drift from the origin. |
| Similarity links | Dashed lines between similar claims that are not parent and child. On by default in the all-narratives view, where they reveal cross-narrative bridges (for example vaccine microchips "tracked by 5G"). |
| Flow | Sparks travelling along each edge in the direction of spread. Off automatically if your system asks for reduced motion. |
| Replay | Press play on the timeline under the graph, or drag across it to show only claims published up to that date. |

With no claim selected, the right panel summarises the narrative: what fact-checkers found, where it started, how it mutated, where it spread, and its most widely seen variant. Use the pencil button to rename it or change its verdict, category and summary, and the download button to export it as JSON.

### Compare (`/compare`)

Paste an earlier and a later claim to get a similarity score, a breakdown (shared words and phrases, shared spelling fragments, and meaning if embeddings are on), the words they share, the change labels and a word-level diff. **Find the closest tracked claims** searches the whole tracker for text you paste. From a claim's panel, **Compare with parent** opens this page pre-filled.

### Add claims (`/ingest`)

**One claim:** paste the text and optionally its date, reach, source dataset (or create a new one), account, region and link. **Preview match** shows where it would land without saving: the narrative, the closest earlier version, the change labels and the top matches. **Add claim** saves it and rebuilds that narrative's lineage. You can also force a specific narrative or a new one.

**Import a file:** drop a CSV or JSON file (or paste it). Rows are processed in date order, so an earlier row can become the parent of a later one. Up to 1,000 rows per import.

CSV columns (only `text` is required):

| Column | Example | Notes |
| --- | --- | --- |
| `text` | `5G masts spread the virus` | 8–2,000 characters. `claim` or `content` also work. |
| `published_at` | `2020-04-01` | Any date JavaScript can parse. Defaults to now. `date` also works. |
| `dataset` | `facebook-pages` | An existing dataset's slug, name or id, or a new name (created automatically). |
| `dataset_kind` | `social` | For new datasets: `social`, `forum`, `messaging`, `news`, `video`, `fact-check`, `other`. |
| `author` | `@handle` | Account, page or channel. |
| `region` | `PH` | Usually an ISO country code. |
| `reach` | `12300` | Shares, views or engagement. Commas are allowed. |
| `source_url` | `https://…` | Must be `http` or `https`. |

JSON imports are a list of objects with the same field names, or `{ "claims": [ … ] }`. Sample files: [`client/public/samples/sample-claims.csv`](client/public/samples/sample-claims.csv) and [`sample-claims.json`](client/public/samples/sample-claims.json), also downloadable from the import tab. The sample adds variants to the demo narratives and starts one new narrative.

### Search

The search box in the top bar ranks claims by similarity rather than exact wording alone, and opens the result in its lineage.

---

## How the lineage engine works

The engine lives in [`server/src/nlp`](server/src/nlp) and [`server/src/services/lineage.js`](server/src/services/lineage.js). It runs offline with no API key.

1. **Normalise and tokenise.** Lower-case, strip accents and punctuation, fold "COVID-19" and "SARS-CoV-2" into one token, and drop stopwords (negations such as "not" and "never" are kept).
2. **Canonicalise.** A small misinformation lexicon collapses words that variants swap freely ("jab", "shot", "vaccinated" → *vaccine*; "mast", "tower" → *tower*; "hoax", "staged" → *fake*). Everything else is reduced with the Porter stemmer.
3. **Vectorise.** Each claim becomes two TF-IDF vectors: canonical words plus adjacent word pairs, and character trigrams (which catch spelling variants). IDF is learned from the claims in your database, so words that appear everywhere count for less.
4. **Score.** `similarity = 0.7 × cosine(words) + 0.3 × cosine(character trigrams)`. If an embedding provider is configured, the embedding cosine is blended in (see below).
5. **Assign a narrative.** A new claim joins the narrative of its best match if that score is at least `LINK_THRESHOLD` (default 0.22); otherwise it starts a new narrative, titled from its first sentence.
6. **Rebuild lineage.** Within the narrative, claims are sorted by date. The earliest is the **origin**. Every later claim's **parent** is the most similar claim published before it. A backdated claim can therefore become a narrative's new origin. Each claim also gets a **generation** (steps from the origin) and **drift** (1 − similarity to the origin).
7. **Label the mutation.** The parent→child change is analysed with transparent rules: new absolute or certainty words ("confirm", "100%", "never"), added or changed figures, new authorities ("doctors", "Stanford", "leaked documents"), new place or event names, share pressure ("forward", "before it gets deleted"), dropped hedges ("can help", "may"), and length changes. The strongest signal becomes the primary label; the rest are listed alongside it.
8. **Link related claims.** For each claim, its top `RELATED_PER_CLAIM` matches above `RELATED_THRESHOLD` that are not its parent or child are stored as similarity links.

The demo narratives were tuned so variants link correctly: in leave-one-out tests about 85% of demo claims are filed into the right narrative from wording alone, and none of the unrelated control sentences cross the link threshold. Wording-only matching misses paraphrases that share no vocabulary; turning on embeddings helps with those, and you can always move a claim yourself (`PATCH /api/claims/:id`) or pick its narrative when adding it.

Run `npm run lineage:rebuild` after changing thresholds or the provider to recompute everything.

---

## Optional: semantic embeddings (OpenAI or Hugging Face)

By default the app uses only the built-in engine. To blend in meaning-based similarity from an NLP API, set these in `server/.env` and restart:

```ini
# OpenAI, or any OpenAI-compatible /embeddings endpoint (set OPENAI_BASE_URL)
NLP_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

```ini
# Hugging Face Inference API
NLP_PROVIDER=huggingface
HF_API_TOKEN=hf_...
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2
# HF_API_URL=   optional full endpoint override if Hugging Face changes its URL
```

How it is used: every claim's embedding is computed once and stored in PostgreSQL (`claims.embedding`). Scores become `SEMANTIC_WEIGHT × semantic + (1 − SEMANTIC_WEIGHT) × built-in`, where the embedding cosine is first rescaled from `[SEMANTIC_FLOOR, 1]` to `[0, 1]` (embedding models rarely score unrelated text near zero). If the API fails (no network, bad key, rate limit), the app logs the reason, falls back to the built-in engine, and retries a minute later. The status dot in the top bar and `GET /api/nlp` show which engine is active and the last error. Run `npm run lineage:rebuild` after switching so all lineage uses the same scoring.

---

## Configuration

All settings live in `server/.env` (see [`server/.env.example`](server/.env.example)). Environment variables set in your shell take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/infodemic` | PostgreSQL connection. The database is created if missing. |
| `AUTO_SEED` | `true` | Load the demo data when the database has no claims. |
| `PORT` | `4000` | API port. If you change it, start the client with `API_URL=http://127.0.0.1:<port>`. |
| `HOST` | `127.0.0.1` | Interface the API binds to (localhost only by default). |
| `NLP_PROVIDER` | `local` | `local`, `openai` or `huggingface`. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL` | – , `https://api.openai.com/v1`, `text-embedding-3-small` | OpenAI-compatible embeddings. |
| `HF_API_TOKEN`, `HF_MODEL`, `HF_API_URL` | – , `sentence-transformers/all-MiniLM-L6-v2`, auto | Hugging Face embeddings. |
| `SEMANTIC_WEIGHT` | `0.6` | Weight of the embedding score when a provider is on. |
| `SEMANTIC_FLOOR` | `0.2` (OpenAI), `0.1` (Hugging Face) | Embedding cosine treated as "unrelated". |
| `LINK_THRESHOLD` | `0.22` | Minimum score for a new claim to join an existing narrative. |
| `RELATED_THRESHOLD` | `0.2` | Minimum score for a similarity link. |
| `RELATED_PER_CLAIM` | `2` | Similarity links stored per claim. |

---

## Scripts

Run from the project folder.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API (with auto-restart) and the Vite dev server together. |
| `npm run build` | Build the React app into `client/dist`. |
| `npm start` | Start the API, serving `client/dist` if it exists, at http://localhost:4000. |
| `npm run db:setup` | Create the database and tables; load the demo data if it is empty. |
| `npm run db:reset` | Drop everything and reload the demo data. |
| `npm run db:empty` | Drop everything and recreate empty tables. Set `AUTO_SEED=false` first, or the demo data is loaded again on the next start. |
| `npm run lineage:rebuild` | Recompute lineage, labels and similarity links for every claim. |
| `npm test` | Run the server's unit tests (NLP engine, mutation analysis, CSV parsing, validation). |

---

## REST API

Base URL: `http://localhost:4000/api` (or `http://localhost:5173/api` through the dev server). All bodies are JSON.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | API, database and NLP status. |
| GET | `/nlp` | Active similarity engine, thresholds and mutation type definitions. |
| GET | `/stats` | Totals, mutation mix, datasets and latest additions. |
| GET | `/narratives` | All narratives with stats and a compact list of their claims. |
| PATCH | `/narratives/:id` | Update `title`, `summary`, `category`, `verdict`, `fact_check`. |
| DELETE | `/narratives/:id` | Delete a narrative and its claims. |
| GET | `/narratives/:id/export` | Download a narrative and its claims as JSON. |
| GET | `/graph?narrative=all\|:id` | Nodes and links (derivation and related) for the graph. |
| GET | `/claims/:id` | A claim with its parent, lineage path, children, related claims, mutation analysis and diff. |
| POST | `/claims` | Add a claim. Add `?dryRun=1` to preview the match without saving. |
| POST | `/claims/bulk` | Import many: `{ "format": "csv" \| "json", "content": "…" }` or `{ "claims": [ … ] }`. |
| PATCH | `/claims/:id` | Move a claim: `{ "narrative_id": 3 }` or `{ "narrative_id": "new" }`. |
| DELETE | `/claims/:id` | Delete a claim; its variants are re-linked. |
| POST | `/similarity` | Compare two texts: `{ "a": "…", "b": "…" }`. |
| GET | `/search?q=…&limit=8` | Claims most similar to the query. |
| GET | `/showcase?narrative=:id` | The longest origin-to-variant chain (used by the Overview). |
| GET | `/datasets` | Datasets with claim counts. |
| POST | `/datasets` | Create a dataset: `{ "name", "kind", "description", "url" }`. |
| POST | `/lineage/rebuild` | Recompute all lineage and similarity links. |
| GET | `/examples` | Example claims shown on the Add claims page. |

Examples:

```bash
# Preview where a claim would land
curl -X POST "http://localhost:4000/api/claims?dryRun=1" \
  -H "Content-Type: application/json" \
  -d '{"text": "5G masts in our town are spreading the virus", "dataset": "facebook-pages", "region": "PH"}'

# Compare two claims
curl -X POST http://localhost:4000/api/similarity \
  -H "Content-Type: application/json" \
  -d '{"a": "Gargling salt water soothes a sore throat", "b": "Gargling salt water kills the coronavirus"}'

# Import a CSV file (uses jq to wrap the file in JSON)
jq -Rs '{format: "csv", content: .}' client/public/samples/sample-claims.csv | \
  curl -X POST http://localhost:4000/api/claims/bulk -H "Content-Type: application/json" -d @-
```

Errors come back as `{ "error": "bad_request" | "not_found" | "database_unavailable" | …, "message": "…" }` with a matching HTTP status.

---

## Project structure

```
.
├── package.json              npm workspaces + root scripts
├── scripts/dev.mjs           runs the API and the web app together
├── docker-compose.yml        optional PostgreSQL 16
├── server/                   Node.js + Express API
│   ├── .env.example
│   ├── scripts/db.js         db:setup / db:reset / db:empty / lineage:rebuild
│   ├── src/
│   │   ├── index.js          HTTP server + database lifecycle
│   │   ├── app.js            Express app (API + built client)
│   │   ├── config.js         settings from server/.env
│   │   ├── routes/api.js     REST endpoints
│   │   ├── db/               pool, schema.sql, bootstrap, reconnects, demo data
│   │   ├── nlp/              tokeniser + lexicon, Porter stemmer, TF-IDF engine,
│   │   │                     embedding providers, mutation analysis + word diff
│   │   ├── services/         corpus cache, lineage reconstruction, read queries
│   │   └── utils/            validation, CSV parser, HTTP errors
│   └── test/                 node:test unit tests
├── client/                   React app (Vite)
│   ├── index.html
│   ├── vite.config.js        dev server on 5173, proxies /api to 4000
│   ├── public/samples/       sample CSV and JSON imports
│   └── src/
│       ├── App.jsx           shell, routes, API health banner
│       ├── components/       LineageGraph (canvas + d3-force), Inspector, Timeline,
│       │                     HeroMorph, charts (constellation, sparkline, streamgraph)…
│       ├── pages/            Overview, Explorer, Compare, Ingest
│       ├── lib/              API client, router, hooks, theme, formatting
│       └── styles/global.css
└── docs/screenshots/
```

Database tables: `datasets`, `narratives`, `claims` (text, source, date, reach, parent, generation, similarity, drift, mutation labels, optional embedding) and `claim_links` (similarity links). See [`server/src/db/schema.sql`](server/src/db/schema.sql).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Banner: **PostgreSQL rejected the username or password** | Put the right user and password in `DATABASE_URL` in `server/.env`. On Windows it is the password you chose in the installer. |
| Banner: **PostgreSQL is not accepting connections** | Start PostgreSQL (Windows: *Services → postgresql*; macOS: `brew services start postgresql@16`; Linux: `sudo systemctl start postgresql`) or run `docker compose up -d`. The app reconnects by itself. |
| **Database does not exist and this user may not create databases** | Create it once with `createdb infodemic` (or in pgAdmin), or use a user with the CREATEDB privilege. |
| **Port 4000 / 5173 is already in use** | Stop the other program, or set `PORT` in `server/.env` and run the client with `API_URL=http://127.0.0.1:<port>`. Vite picks the next free port automatically and prints it. |
| Docker: **port 5432 is already allocated** | You already have PostgreSQL running locally. Use it (option A), or change the compose port to `"5433:5432"` and use port 5433 in `DATABASE_URL`. |
| `npm run dev` says Node.js is too old | Install Node.js 22 LTS or newer. |
| Banner: **The Infodemic API is not running** | Start it with `npm run dev`, and check the `server │` lines in the terminal for errors. |
| Fonts look plain | The display fonts (Newsreader, Schibsted Grotesk) load from Google Fonts. Offline, the app falls back to system fonts and still works. |
| I want to start from scratch | `npm run db:reset` reloads the demo data. For an empty tracker, set `AUTO_SEED=false` in `server/.env`, then run `npm run db:empty`. |

---

## About the demo data

The seven demo narratives (5G and COVID-19, hot water and salt-water gargles, vaccine microchips, volcanoes vs. human CO₂, lemon and baking soda "cures", the staged moon landing, and HAARP weather control) are modelled on widely documented and debunked misinformation. The 80 claims themselves are **synthetic**: written for this demo, with fictional accounts, and attributed to dataset types (public social media pages, tipline submissions, transcripts and so on) rather than real exports. Several narratives deliberately start from a true statement (a sore-throat remedy, research on vaccination records, a fact about eruptions) to show how accurate information mutates. Replace or extend it with real data through the Add claims page or the bulk import API.

Mutation labels are heuristics meant to help an analyst see what changed, not verdicts. Similarity scores reflect wording (and meaning, if embeddings are on), not truth.

## License

[MIT](LICENSE)
