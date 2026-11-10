# WebsiteBench for agents

WebsiteBench is a benchmark of 70 production-level websites that AI agents rebuild through browser exploration. An agent explores a reference site in a browser and builds a full-stack offline version, scored by 46,916 hidden tests. Eight models were evaluated with a 16-hour limit per run. The best, Claude Opus 5.5, has a 26.2% pass rate. The site is static and regenerated from the files in data/.

## Read

```sh
# any page as Markdown, by id
curl -sL https://website-bench.com/<kind>/<id>/index.md
curl -sL https://website-bench.com/index.md                    # leaderboard, FAQ, BibTeX
curl -sL https://website-bench.com/task/amazon/index.md        # one task: every model's result
curl -sL https://website-bench.com/run/index.md                # how to run the benchmark
curl -sL https://website-bench.com/eval/index.md               # how a rebuild is evaluated
curl -sL https://website-bench.com/analysis/index.md           # why agents fall short
curl -sL https://website-bench.com/tasks/index.md              # the 70 task ids
curl -sL https://website-bench.com/llms-full.txt               # the whole site as text
curl -sL https://website-bench.com/sitemap.xml                 # every URL with lastmod
```

Kinds: `task` (id = slug listed in /tasks/index.md), `run`, `eval`, `analysis`, `tasks`. The home page is /index.md.

## Data

```sh
curl -sL https://website-bench.com/data/leaderboard.json       # eight models: scores, cost, tokens, turns
curl -sL https://website-bench.com/data/leaderboard.csv
curl -sL https://website-bench.com/data/waffle.json            # per-task results for every model
curl -sL https://website-bench.com/data/task-materials.json    # recorded runs and published scores
