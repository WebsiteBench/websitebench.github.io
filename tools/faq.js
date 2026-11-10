// The home page FAQ: one source for the visible list, the FAQPage JSON-LD and the Markdown twin.
// Answers use [label](url) links; every number comes from the same facts as the rest of the site.
function faqItems({facts, ranked, tasksRange}) {
  const top = [...ranked].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const pct = m => m.overall.toFixed(1) + '%';
  return [
    {q: 'What is WebsiteBench?', a: `WebsiteBench is a benchmark of ${facts.tasks} production-level websites that AI agents rebuild through browser exploration. An agent explores a locally hosted reference site in a browser, then builds a full-stack site that runs offline and matches the reference in appearance and behavior. ${facts.tests} hidden tests score the result.`},
    {q: 'How does WebsiteBench score a rebuild?', a: `Hidden tests compare the rebuild with the reference. Request tests check page responses and form submissions, Browser tests check interface behavior and persistence, and System tests check builds, restarts, process health and security. A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. The score is 100 × passed tests ÷ total tests. See [Eval](https://website-bench.com/eval).`},
    {q: 'Which model scores highest on WebsiteBench?', a: `${top[0].name} scores highest with ${pct(top[0])} of hidden tests passed, ahead of ${top[1].name} (${pct(top[1])}) and ${top[2].name} (${pct(top[2])}). ${facts.models} models were evaluated with a 16-hour limit per run. See the [leaderboard](https://website-bench.com/#results).`},
    {q: 'How many tasks and hidden tests does WebsiteBench have?', a: `${facts.tasks} tasks and ${facts.tests} hidden tests. A task has between ${facts['tests-min']} and ${facts['tests-max']} tests. Browse them on the [Tasks](https://website-bench.com/tasks) page.`},
    {q: 'How do I run WebsiteBench?', a: `Install uv and Docker, clone [TIGER-AI-Lab/WebsiteBench](https://github.com/TIGER-AI-Lab/WebsiteBench), and run the tasks with Harbor: uv run harbor run --dataset websitebench/WebsiteBench@v1 --agent <agent> --model <model>. The [Run](https://website-bench.com/run) page lists the full commands for all ${facts.tasks} tasks or one task.`},
    {q: 'Where are the WebsiteBench tasks and data?', a: `The tasks are on [Hugging Face](https://huggingface.co/datasets/TIGER-Lab/WebsiteBench) and [Harbor Hub](https://hub.harborframework.com/datasets/websitebench/WebsiteBench). The leaderboard is available as [JSON](https://website-bench.com/data/leaderboard.json) and [CSV](https://website-bench.com/data/leaderboard.csv), and every page has a Markdown version at index.md.`},
    {q: 'How do I cite WebsiteBench?', a: `Use the BibTeX entry in the [Citation](https://website-bench.com/#cite) section: WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?, 2026.`},
  ];
}
const plain = a => a.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
const html = (a, esc) => esc(a).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
module.exports = {faqItems, plain, html};
