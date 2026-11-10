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
hf download TIGER-Lab/WebsiteBench --repo-type dataset   # task download
```

## Search

There is no search endpoint. List task ids with `curl -sL https://website-bench.com/tasks/index.md`, or search the web with `site:website-bench.com <query>`. The Tasks page has a client-side filter at https://website-bench.com/tasks.

## Run

```sh
git clone https://github.com/TIGER-AI-Lab/WebsiteBench.git && cd WebsiteBench && uv sync
uv run harbor run --dataset websitebench/WebsiteBench@v1 --agent <agent> --model <model>
```

Full commands, including one task and the allowed hosts: https://website-bench.com/run/index.md. Code: https://github.com/TIGER-AI-Lab/WebsiteBench. Tasks: https://huggingface.co/datasets/TIGER-Lab/WebsiteBench and https://hub.harborframework.com/datasets/websitebench/WebsiteBench.

## FAQ

### What is WebsiteBench?

WebsiteBench is a benchmark of 70 production-level websites that AI agents rebuild through browser exploration. An agent explores a locally hosted reference site in a browser, then builds a full-stack site that runs offline and matches the reference in appearance and behavior. 46,916 hidden tests score the result.

### How does WebsiteBench score a rebuild?

Hidden tests compare the rebuild with the reference. Request tests check page responses and form submissions, Browser tests check interface behavior and persistence, and System tests check builds, restarts, process health and security. A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. The score is 100 × passed tests ÷ total tests. See [Eval](https://website-bench.com/eval).

### Which model scores highest on WebsiteBench?

Claude Opus 5.5 scores highest with 26.2% of hidden tests passed, ahead of GPT 6.1 Sol (20.2%) and Claude Opus 5 (17.1%). 8 models were evaluated with a 16-hour limit per run. See the [leaderboard](https://website-bench.com/#results).

### How many tasks and hidden tests does WebsiteBench have?

70 tasks and 46,916 hidden tests. A task has between 302 and 2,016 tests. Browse them on the [Tasks](https://website-bench.com/tasks) page.

### How do I run WebsiteBench?

Install uv and Docker, clone [TIGER-AI-Lab/WebsiteBench](https://github.com/TIGER-AI-Lab/WebsiteBench), and run the tasks with Harbor: uv run harbor run --dataset websitebench/WebsiteBench@v1 --agent <agent> --model <model>. The [Run](https://website-bench.com/run) page lists the full commands for all 70 tasks or one task.

### Where are the WebsiteBench tasks and data?

The tasks are on [Hugging Face](https://huggingface.co/datasets/TIGER-Lab/WebsiteBench) and [Harbor Hub](https://hub.harborframework.com/datasets/websitebench/WebsiteBench). The leaderboard is available as [JSON](https://website-bench.com/data/leaderboard.json) and [CSV](https://website-bench.com/data/leaderboard.csv), and every page has a Markdown version at index.md.

### How do I cite WebsiteBench?

Use the BibTeX entry in the [Citation](https://website-bench.com/#cite) section: WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?, 2026.

## Cite

```bibtex
@misc{zhang2026websitebench,
  title  = {WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?},
  author = {{WebsiteBench Authors}},
  year   = {2026},
  url    = {https://github.com/TIGER-AI-Lab/WebsiteBench},
}
```

## Updates

The data files and pages are regenerated whenever results change; the last data change is 2026-11-06, and each URL's lastmod is in https://website-bench.com/sitemap.xml.

## Contact

Issues and questions: https://github.com/TIGER-AI-Lab/WebsiteBench/issues
