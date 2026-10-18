# WebsiteBench project page

The project website for *WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?*, hosted at https://websitebench.github.io/.

A minimal homepage inspired by Terminal Bench: title, two sentences explaining browser-only exploration and hidden-test evaluation, run/task entry points, and the leaderboard. Protocol, findings, citation, and run commands live on separate pages. The page uses system fonts and has no production dependencies or build step. Homepage content, the leaderboard table, and CSV download work without JavaScript; JavaScript adds sorting, theme selection, clipboard controls, and Table / Pareto / Waffle tabs.

## Preview locally

From this repository:

```sh
python3 -m http.server 8000
# Open http://localhost:8000
```

## Results and updates

The active cohort is **70 tasks × 9 models**. Untappd, RoomSketcher, Workable and edX are excluded from every current view; their original materials remain in HF history. `data/cohort.json` contains the exact active task list.

Table, Pareto and Waffle share the same selected canonical results from `TIGER-Lab/WebsiteBenchArtifacts`. GPT 6.1 Sol replaces the historical GPT 5.6 Sol. Do not edit aggregate percentages or generated CSVs by hand.

- **Table:** the arithmetic mean of available per-task pass fractions, with each task weighted equally. Overall and Request/Browser/System include coverage counts; missing/invalid results are excluded, never treated as zero. Missing group counts stay blank. Cost, tokens and turns are recalculated from resource values published with the selected score/context; estimates and partial usage remain qualified.
- **Pareto:** accuracy and resource means use the same paired task subset for each point. Hover shows coverage. A model without the selected resource data has no point. The frontier connects the visible reported points; the line is a guide, and no confidence intervals are invented.
- **Waffle:** one cell per task/model, sorted easy to hard and high to low. Desktop uses two 35-task blocks. Grayscale represents a measured pass fraction; red means error, orange means timeout, and a diagonal mark means no usable score or pending verification. All states retain their source and context. Clicking a bound cell opens that exact recorded run.

The shared context selector applies to all three tabs. Overview uses Qwen 200K, DeepSeek 1M and the recorded settings for the other models. GLM uses 1M with eight explicit 200K task selections (Eat This Much, Eventbrite, Fandango, Insurify, Notion, Rate My Professors, Tripadvisor and Warby Parker). This choice is recorded in HF `sources/display-contexts.json`, and the mixed column/cells show actual contexts. Strict 1M/200K comparisons remain available. No maximum score is selected.

Overview contains **621/630 scored cells**: five errors, two generation timeouts and two pending new-protocol verifications remain. Strict 1M has 594 scored cells; strict 200K has 562. The [current gap report](https://huggingface.co/datasets/TIGER-Lab/WebsiteBenchArtifacts/blob/main/missing/score-gaps.md) explains each remaining cell. The 200K and 1M labels are reported context-window configurations, independent of the evaluation protocol.

## Sync from HF

`data/unified-source.json` pins one HF commit and the hashes of all 13 site exports. The importer verifies every file before replacing website data. Scores, ATIF, website code, evaluations and provenance remain separate files under `benchmark/<task>/<model>/<context>/`. Excel is retained only as migration history.

```sh
python3 tools/sync_hf_catalog.py --revision <40-character-HF-commit>
node tools/prerender.js
python3 -m unittest discover -s tools -p 'test_*.py'
```

On the HF metadata checkout, edit canonical JSON, then run `tools/export_unified_tables.py --root .` and `tools/validate_unified_catalog.py --root .` before publishing. `tools/build_leaderboard.py` derives all context-specific means, resource/score pairings and per-task audit inputs. The original 74-task publication and workbook migration stay in history; they do not feed the current aggregates. Brand marks are vendored from Lobe Icons under its included MIT license.

## Task browser and trajectories

`tasks.html` has one task, one model and one recorded context selected at a time.
Website / Trajectory tabs share that selection. The homepage stays small.

`data/task-materials.json` is imported from the verified HF catalog. It
contains the active 70-task cohort, the current nine-model
list (including GPT 6.1 Sol), context identities, availability, and score citations
from canonical score files. Different contexts remain distinct. Nothing is called a
final leaderboard run, and no highest-scoring run is selected automatically.
The published aggregate leaderboard remains the separately documented snapshot.

Generate the public catalog and private bindings:

```sh
python3 tools/build_task_index.py --master /private/master.json --private-index /private/task-browser/index.json
```

Use `--website-artifacts /private/verified-artifact-download` to attach the
preserved projects from `TIGER-Lab/WebsiteBenchArtifacts`. Import requires a
completed, hash-verified download. The selected-run manifest must exactly match
the trajectory's `path-layout.json` provenance. Agent and reference downloads are
pinned to the source revision; private filesystem paths stay outside the public
catalog. The local replay reads the packaged `repo/` and
`environment/reference/` directories directly and verifies the archive checksum.
Source-specific caches prevent a previously extracted project from replacing a
newly bound export. Unavailable upstream exports leave existing verified bindings
intact. Exported code availability does not certify that it can launch unchanged.
Reference exports with a saved `standalone.tar.gz` use those recorded build
outputs directly; the replay does not rebuild or regenerate the website.
Verified exports up to 8 GB are cached on disk by archive checksum and project
root. Large projects share read-only assets and keep a small writable entry point
and temporary state, rather than copying gigabytes into each container’s memory.

The public catalog contains no local artifact paths, tokens, raw trajectories or
website archives. Keep the private index and cache outside this repository.

### Local interactive preview

Build the shared runtime, prepare complete reference sources, then start the gateway:

```sh
docker build -t websitebench-replay:local tools/replay
python3 tools/prepare_reference_sources.py --repository /path/to/WebsiteBenchWebsites --output /private/reference-sources --fetch
# Use the snapshot directory printed by the preparation step below.
python3 tools/serve_preview.py --task-index /private/task-browser/index.json --task-cache /private/task-browser/cache --references /private/reference-sources/SNAPSHOT --port 8000
```

Reference preparation restores missing tracked files and hydrates LFS-managed HTML,
images, fonts and data for only the active 70 tasks. It verifies each LFS hash
and writes a separate snapshot; it does not change the existing checkout.

Install `zstandard` for cached `.tar.zst` archives. `orjson` is optional and speeds
up large JSON indexing. The catalog builder and ordinary static site have no
third-party dependencies.

The gateway starts only the selected reference and original candidate. Five Node
references build once into source-hashed standalone bundles in bounded containers;
Python and Node share a cached base runtime and a separate npm build cache. Obsolete queued preparations are canceled on selection changes.
Both sites use the same 1440×800 viewport. Top / bottom is the default; side by side is optional.
The path field navigates both sites. Scroll synchronization uses relative scroll
positions; optional navigation synchronization mirrors paths, never POST bodies.
Each full-size link opens one real website. Reset creates fresh processes and
state for both sites. The reference remains available if the candidate cannot
start. Missing code, dependencies, and syntax errors are reported explicitly;
archived model code is never silently repaired or substituted. Email verification
sidecars are not connected in this local preview. Replaying a website does not
rerun its benchmark evaluation or certify its published score.

Replays run as an unprivileged user in Docker with no external network, no host
ports, read-only source and bounded writable tmpfs. At most six containers are
retained; idle pairs are reclaimed, and ten-minute inactivity expires them.
Visible comparisons keep their sessions alive; returning to an expired preview
restarts it.
Cookie jars are separate and stay on the server. Each site uses its own temporary `*.localhost` origin on the gateway port. This
preserves native routing, module loading and localStorage while keeping both
sites separate from the parent and each other. Sandboxes and CSP restrict their
capabilities and network access; messages are accepted only from mounted frames.
If a browser proxy cannot resolve local subdomains, the viewer falls back to the
opaque-origin path proxy. Native mode preserves JavaScript bundles unchanged.
Grok's deduplicated host archives are materialized once for all their original
runs, resolving tar hard links to copied bytes. Traversal and symlinks are not
extracted. Other candidate bundles are cached per recorded context. Large immutable Python
reference trees serve assets directly from the read-only snapshot, avoiding a
large RAM copy.

This gateway is a local development service, not an Internet-facing multi-user
sandbox. Public interactive replays need a separately hosted runtime service;
GitHub Pages alone cannot run these backends. A static preview automatically
falls back to the genuine paired Medium/Qwen 200K screenshots.

### Large ATIF trajectories

Opening Trajectory requests a small step manifest. Only the selected step is
fetched; screenshots, audio, provider fields, and long tool output load on demand.
Twelve steps are retained in the browser cache. Full-text search runs against a
server-side index. Messages, reasoning, tool calls, matched observations, metrics,
and embedded agent trajectories are displayed as inert text, never executed.

The private cache is derived from the source hash. Recorded IDs include that
hash, and individual step/media/text URLs include content hashes. Updated
converters cannot accidentally reuse stale browser-cached step bodies. Initial indexing
is bounded to two background jobs. A 221 MB / 4,535-step real trace was exercised
without downloading its raw JSON to the browser.

`Open ATIF` still supports browser-local files, limited to 64 MB / 50,000 steps.
Those imports are never uploaded or associated with benchmark scores. Media from
arbitrary external URLs is never automatically loaded.

For static object storage, prepare an export outside the repository:

```sh
python3 tools/export_task_trace.py --index /private/task-browser/index.json --cache /private/task-browser/cache --run RECORD_ID --output /private/export --base https://YOUR-CDN/traces
```

This copies only manifest-referenced step/media/text objects, excluding the raw
source, full-text search index and provider extras. It does not publish anything.
Review before uploading; configure the storage's CORS for the website origin,
compression for JSON/text, and long-lived caching for immutable recorded IDs.
Set `trace_base` in `data/viewer-config.json` to the reviewed CDN base to enable
backend-free trace browsing. Static exports search step summaries; the local
service searches full messages and tool output. No HF token belongs in the
browser, configuration, or repository.

Checks:

```sh
python3 -m unittest discover -s tools -p 'test_*.py' -v
node --check assets/js/tasks.js
node --check assets/js/trajectory.js
node tools/prerender.js
```

## Analysis figures

Analysis follows the current paper: Human trajectory, Exploration + implementation, and Early stopping. Figures 4 and 5 are direct high-resolution renders of the paper figures, with unchanged chart contents. Their source asset names, source-PDF hash, page and crop geometry are recorded in `assets/figures/paper/provenance.json`. The full paper is not published by this website.

Human traces cover 18 matched Grok 4.6 website pairs. The exploration analysis covers 20 runs; its pre-edit coverage applies to the 17 trajectories that reached the checkpoint. Distinct page, workflow, and requirement denominators are preserved. Early stopping follows the paper text and reports the Kimi K3 × Lowe’s example in a separate single-case table; it does not display an invented paper figure.

`data/analysis.json` distinguishes matching the current paper from verifying the underlying raw analysis tables. Matching a figure does not independently reproduce its experiment or certify the canonical leaderboard. The Overleaf project was read only.

## Deploy on GitHub Pages

Push the reviewed changes to GitHub. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. The `.nojekyll` file prevents Jekyll processing.

## Content maintenance

- Benchmark code: https://github.com/reacher-z/WebsiteBenchHarbor
- Reference website data: https://github.com/reacher-z/WebsiteBenchWebsites
- Released website archives: https://github.com/reacher-z/WebsiteBenchWebsites/releases
- Keep author information anonymous until it can be released. Update `CITATION.bib` and `CITATION.cff` together when authors are public, then run `node tools/prerender.js` to update the homepage and Analysis citation blocks.
- Add a paper link when a public paper URL is available.
- Never mention the conference, its year, or review status.
- The internal trajectory spreadsheet is not linked publicly. Review its contents and sharing permissions before publishing any trajectories.
- `#results` remains on the homepage. Old `#task`, `#benchmark`, `#findings`, `#why`, `#run`, and `#cite` links redirect to Tasks, Analysis, or Run.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Minimal homepage and generated leaderboard |
| `tasks.html`, `assets/js/tasks.js` | Task/reference/model visual comparison browser |
| `assets/js/trajectory.js`, `data/trajectories.json` | ATIF reader and explicitly curated public trace index |
| `analysis.html`, `run.html` | Analysis, data checks, citation, and run instructions |
| `data/analysis.json`, `tools/render-analysis.py` | Analysis values/source provenance and duration-figure rendering |
| `data/task-previews.json` | Explicitly paired screenshot sources |
| `data/task-catalog.json` | Generated active task browser catalog |
| `assets/css/site.css` | Responsive layout, light/dark themes, and print styles |
| `assets/js/site.js` | Table sorting, theme selection, and copy buttons |
| `assets/js/results.js` | Shared result tabs, filtering, Pareto plotting, Waffle rendering, and tooltips |
| `assets/logos/` | Local SVG brand marks and source attribution |
| `data/leaderboard.json` | Evaluation data |
| `data/leaderboard.csv` | Generated downloadable results |
| `data/task-results.json` | Historical workbook records used by legacy curated screenshot bindings |
| `data/waffle.json` | Current 70 × 9 per-context published fractions, score citations, and exact viewer links |
| `tools/build_waffle.py` | Export Waffle and context CSVs from the same ledger as the task browser |
| `data/evaluated-tasks.json` | Active list of exactly 70 website task IDs |
| `data/final-runs.json` | Historical explicit selection manifest; not used for current per-context Waffle |
| `tools/prerender.js` | Generate table rows and CSV from JSON |
| `tools/import_workbook.py` | Audit and import actual workbook runs for an explicitly selected 74-task cohort |
| `tools/og.html`, `tools/render-og.js` | Social preview template and renderer |
| `assets/figures/` | Original paper figures retained for future use |
| `CITATION.cff`, `llms.txt` | Citation and machine-readable project information |

To regenerate `assets/og.png`, use `node tools/render-og.js`. This optional maintenance tool needs Playwright; use an existing installation via `PLAYWRIGHT=/path/to/playwright`. To use an existing browser executable, set `CHROMIUM_PATH=/path/to/chromium`. These tools are not needed to serve or deploy the website.

The homepage includes a compact Citation disclosure, an entry beside the hero actions, a BibTeX download and a copy button. `CITATION.bib` is the shared source for both HTML citation blocks; direct `#cite` links open the disclosure. Current author metadata remains Anonymous until supplied.
