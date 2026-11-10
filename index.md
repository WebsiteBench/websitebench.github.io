---
title: "WebsiteBench: AI Agents Rebuilding 70 Websites"
url: https://website-bench.com/
updated: 2026-11-06
type: benchmark
---

# WebsiteBench

WebsiteBench is a benchmark of 70 production-level websites that AI agents rebuild through browser exploration. An agent explores a reference site in a browser and builds a full-stack offline version, scored by 46,916 hidden tests. Eight models were evaluated with a 16-hour limit per run. The best, Claude Opus 5.5, has a 26.2% pass rate.

## Leaderboard

Percent of hidden tests passed.

| Model | Overall | Request | Browser | System |
| --- | ---: | ---: | ---: | ---: |
| Claude Opus 5.5 | 26.2 | 71.2 | 21.8 | 35.4 |
| GPT 6.1 Sol | 20.2 | 64.3 | 16.9 | 36.8 |
| Claude Opus 5 | 17.1 | 58.8 | 12.9 | 28.8 |
| GLM 5.3 Flash | 14.7 | 43.3 | 11.4 | 24.8 |
| DeepSeek V4.1 Flash | 13.5 | 39.9 | 9.8 | 29.7 |
| Grok 4.6 | 12.1 | 39.3 | 8.3 | 29.5 |
| Kimi K3 | 10.6 | 41.0 | 6.8 | 25.6 |
| Qwen 3.8 Max | 7.3 | 28.7 | 4.1 | 21.8 |

## Benchmark

- A user workflow is a sequence of actions that completes a user goal and ends in an observable result, such as browsing products, adding an item to a cart, checking out and seeing an order confirmation.
- An agent explores a locally hosted reference website through a browser: screenshots, interface state, navigation, clicks, typing and media downloads.
- It builds a full-stack site that runs offline, within 16 hours, and may revisit the reference while coding and testing.
- Hidden tests then compare rebuild and reference. Request (T1) tests check page responses and form submissions. Browser (T2) tests check interface behavior at three levels: immediate responses (L1), state changes read back (L2), and persistence, other users and recovery (L3). System (T3) tests check builds, restarts, process health and security.
- A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. Browser workflow tests repeat a sequence of user actions and check its result. Each must pass with two independent executors, Playwright and Browser Use.
- Scores are pass rates: 100 × sum(passed tests) / sum(total tests), for Overall and for each test group. Cost, tokens and turns are per-task means.

## Questions

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

## Citation

```bibtex
@misc{zhang2026websitebench,
  title  = {WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?},
  author = {{WebsiteBench Authors}},
  year   = {2026},
  url    = {https://github.com/TIGER-AI-Lab/WebsiteBench},
}
```

## Links

- Code: https://github.com/TIGER-AI-Lab/WebsiteBench
- Tasks on Hugging Face: https://huggingface.co/datasets/TIGER-Lab/WebsiteBench
- Tasks on Harbor Hub: https://hub.harborframework.com/datasets/websitebench/WebsiteBench
- Run: https://website-bench.com/run/index.md
- Tasks: https://website-bench.com/tasks/index.md
- Eval: https://website-bench.com/eval/index.md
- Analysis: https://website-bench.com/analysis/index.md
