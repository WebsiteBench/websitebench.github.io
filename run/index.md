---
title: "Run the benchmark · WebsiteBench"
url: https://website-bench.com/run
updated: 2026-11-06
type: guide
---

# Run the benchmark

WebsiteBench is a benchmark of 70 tasks with 46,916 hidden tests, run with Harbor, which fetches the tasks from Harbor Hub. It requires uv and Docker.

## Run all 70 tasks

```sh
git clone https://github.com/TIGER-AI-Lab/WebsiteBench.git
cd WebsiteBench
uv sync
export OPENAI_API_KEY='<key>'
uv run harbor run --dataset websitebench/WebsiteBench@v1 \
  --agent codex --model '<model>' \
  --allow-environment-host snapshot.debian.org \
  --allow-environment-host raw.githubusercontent.com \
  --allow-environment-host github.com \
  --allow-environment-host nodejs.org \
  --allow-environment-host registry.npmjs.org
```

## Run one task

```sh
export OPENAI_API_KEY='<key>'
uv run harbor run --task websitebench/medium@v1 \
  --agent codex --model '<model>' \
  --allow-environment-host snapshot.debian.org \
  --allow-environment-host raw.githubusercontent.com \
  --allow-environment-host github.com \
  --allow-environment-host nodejs.org \
  --allow-environment-host registry.npmjs.org
```

- The repository pins Harbor 0.25.0.
- The same tasks are on Hugging Face: https://huggingface.co/datasets/TIGER-Lab/WebsiteBench. Pass `--path` to run a downloaded task.
- Set `--agent` and `--model` to what you want to evaluate.
- `--allow-environment-host` opens the agent installer's download hosts during setup.
