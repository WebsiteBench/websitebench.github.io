# WebsiteBench project page

The project website for *WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?*, hosted at https://websitebench.github.io/.

A minimal homepage inspired by Terminal Bench: title, two sentences explaining browser-only exploration and hidden-test evaluation, run/task entry points, and the leaderboard. Protocol, findings, citation, and run commands live on separate pages. The page uses system fonts and has no production dependencies or build step. Homepage content, the leaderboard table, and CSV download work without JavaScript; JavaScript adds sorting, theme selection, clipboard controls, and Table / Pareto / Waffle tabs.

## Preview locally

From this repository:

```sh
python3 -m http.server 8000
# Open http://localhost:8000
```

## Update results

Edit `data/leaderboard.json`, then regenerate the HTML table and CSV:

```sh
node tools/prerender.js
```

This script uses only Node's standard library. The aggregate JSON is the source for Table and Pareto only; do not edit generated table rows or CSV values by hand. Those two views retain the original published evaluation snapshot. Waffle and the task browser use the current material ledger, described below; old GPT 5.6 Sol aggregate scores are never relabeled as GPT 6.1 Sol.

## Results views

The three tabs occupy the same results area. Table and Pareto read the static aggregate table. Waffle reads the separate current `data/waffle.json` export embedded by `node tools/prerender.js`. Organization filtering applies to Table and Pareto; the Waffle shows the full model list.

- **Table:** original metrics, sortable columns, and model brand marks.
- **Pareto:** Overall / Request / Browser / System pass rate versus mean Cost / Tokens / Turns. Supports log or linear resource axes and focused or full percentage axes. The frontier is recomputed among visible models. Its connecting line is a visual guide, not a measured interpolation. No confidence intervals are estimated from aggregate scores.
- **Waffle:** 74 current tasks × 9 current models, one cell per pair. Includes Untappd and GPT 6.1 Sol; excludes Samsung and the historical GPT 5.6 Sol. Desktop splits the sorted task list into two adjacent 37-task blocks so real square cells and readable names fit together. Smaller screens use one continuous table. Headers include company logos. The 1M/200K selector applies to GLM, DeepSeek and Qwen; other models retain their recorded context. Missing scores use a faint diagonal mark, conflicting fractions use a muted amber hatch, and zero is a scored light-gray cell. Neither missing nor conflicting values are assigned a numerical score. Hover shows the exact fraction and source cell. A uniquely bound trace links to that exact context in the task browser. The continuous grayscale interpolates calibrated RGB anchors (0%→244, 5%→218, 10%→182, 25%→96, 50%→32, 100%→0). The 0%, 10%, 25%, 50% and 100% swatches use the same mapping; numerical scores are unchanged. Compact model headers omit repeated context text; hover retains the recorded context and coverage.

Open `?view=pareto#results`, `?view=waffle#results`, or `?view=waffle&context=200k#results`. Waffle defaults to the sheet's 1M context for the three multi-context models. This is an explicit view, not a claim that those runs are the final leaderboard selection. Both axes are sorted by descending mean available pass rate in the selected context: tasks from easiest to hardest (down the left block, then down the right block), and models from strongest to weakest left to right. Missing, withdrawn and conflicting fractions are excluded rather than counted as zero; real zero scores are included. Context switches re-rank both axes. Model header tooltips show the mean and scored-task coverage; task name tooltips show the mean and scored-model coverage. This display ordering is not a replacement for the separate published aggregate leaderboard. The CSV link downloads the displayed context's per-task records; Table/Pareto retain the historical aggregate CSV. Without JavaScript, the static table and CSV remain available.

Brand marks are vendored from Lobe Icons under its included MIT license; see `assets/logos/README.md`. The display question uses “reconstruct complex websites”; the paper citation retains its original title.

## Load per-task Waffle results

Both Waffle and the task browser derive from the same private `master.json` ledger. The current score authority is the uploaded `WebsiteBenchHarbor (2).xlsx`, tab `run_result_clean`. Do not replace these fractions with older verifier rewards, fill blank scores with zero, or select the highest-scoring context.

```sh
python3 tools/build_waffle.py --master /private/master.json --workbook /private/WebsiteBenchHarbor.xlsx
node tools/prerender.js
python3 -m unittest discover -s tools -p test_waffle.py -v
```

This writes the public score-only `data/waffle.json`, plus `data/waffle-1m.csv` and `data/waffle-200k.csv`. It reads current task/model metadata and exact trace IDs from `data/task-materials.json`. Score export is independent of trace availability. Each selected score retains its spreadsheet citation; source annotations withdrawing a mismatched context are respected. Unverified context annotations remain visible in tooltips instead of hiding published scores. Conflicting fractions for the same context are retained without guessing.

The current 1M view has 609 usable fractions, 56 blank pairs and one conflicting pair (DeepSeek / Fandango). The 200K view has 574 usable fractions; missing or withdrawn 200K scores never fall back to a 1M score. These views do not assert reproduction of the older aggregate leaderboard.

`tools/import_workbook.py`, `data/task-results.json`, `data/evaluated-tasks.json` and `data/final-runs.json` preserve an older workbook/cohort import and the curated Medium screenshot bindings. They do not feed the current Waffle. `tools/prerender.js` still checks those legacy screenshot bindings separately; it validates and embeds the current Waffle export independently.

## Task browser and trajectories

`tasks.html` has one task, one model and one recorded context selected at a time.
Website / Trajectory tabs share that selection. The homepage stays small.

`data/task-materials.json` is generated from the verified material ledger. It
contains the accepted 74-task cohort (including Untappd), the current nine-model
list (including GPT 6.1 Sol), context identities, availability, and score citations
from `run_result_clean`. Different contexts remain distinct. Nothing is called a
final leaderboard run, and no highest-scoring run is selected automatically.
The published aggregate leaderboard remains the separately documented snapshot.

Generate the public catalog and private bindings:

```sh
python3 tools/build_task_index.py --master /private/master.json --private-index /private/task-browser/index.json
```

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
images, fonts and data for only the accepted 74 tasks. It verifies each LFS hash
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

Analysis now leads with Human trajectory, Early stopping, and Exploration + implementation, in that order. Each section has a short result, explicit study scope, and a visible figure with a full-resolution link. Human traces cover 18 paired Grok 4.6 tasks; the exploration/implementation analysis covers 20 Grok 4.6 tasks. The Kimi K3 × Lowe’s stop-review intervention is labeled as a single case, separate from the reported median duration.

`data/analysis.json` records the values and provenance from the previous project website at revision `9a6ffd2`. The human-trace and gaps figures are retained assets. `tools/render-analysis.py` renders the early-stopping SVG from those reported numbers using matplotlib; it is a new website chart, not an extracted paper figure. The current paper PDF/LaTeX was not available when these sections were prepared. Review the numbers, wording, sample scopes, and retained figures against the current paper before publishing. This does not certify the workbook's final leaderboard runs.

To regenerate the duration figure, run `python tools/render-analysis.py` in an environment with matplotlib. Serving the site needs no additional dependency.

## Deploy on GitHub Pages

Push the reviewed changes to GitHub. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. The `.nojekyll` file prevents Jekyll processing.

## Content maintenance

- Benchmark code: https://github.com/reacher-z/WebsiteBenchHarbor
- Reference website data: https://github.com/reacher-z/WebsiteBenchWebsites
- Released website archives: https://github.com/reacher-z/WebsiteBenchWebsites/releases
- Keep author information anonymous until it can be released. Update the citation in `index.html` and `CITATION.cff` together when authors are public.
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
| `data/task-catalog.json` | Generated 74-task browser catalog |
| `assets/css/site.css` | Responsive layout, light/dark themes, and print styles |
| `assets/js/site.js` | Table sorting, theme selection, and copy buttons |
| `assets/js/results.js` | Shared result tabs, filtering, Pareto plotting, Waffle rendering, and tooltips |
| `assets/logos/` | Local SVG brand marks and source attribution |
| `data/leaderboard.json` | Evaluation data |
| `data/leaderboard.csv` | Generated downloadable results |
| `data/task-results.json` | Historical workbook records used by legacy curated screenshot bindings |
| `data/waffle.json` | Current 74 × 9 per-context published fractions, score citations, and exact viewer links |
| `tools/build_waffle.py` | Export Waffle and context CSVs from the same ledger as the task browser |
| `data/evaluated-tasks.json` | Accepted list of exactly 74 website task IDs |
| `data/final-runs.json` | Historical explicit selection manifest; not used for current per-context Waffle |
| `tools/prerender.js` | Generate table rows and CSV from JSON |
| `tools/import_workbook.py` | Audit and import actual workbook runs for an explicitly selected 74-task cohort |
| `tools/og.html`, `tools/render-og.js` | Social preview template and renderer |
| `assets/figures/` | Original paper figures retained for future use |
| `CITATION.cff`, `llms.txt` | Citation and machine-readable project information |

To regenerate `assets/og.png`, use `node tools/render-og.js`. This optional maintenance tool needs Playwright; use an existing installation via `PLAYWRIGHT=/path/to/playwright`. To use an existing browser executable, set `CHROMIUM_PATH=/path/to/chromium`. These tools are not needed to serve or deploy the website.
