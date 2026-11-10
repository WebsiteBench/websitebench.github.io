// Agent-readable files, all derived from the data and the page facts:
// Markdown twins (index.md), llms.txt, llms-full.txt, AGENTS.md / agents.md / agents.txt.
const fs = require('node:fs'), path = require('node:path');
const {plain} = require('./faq.js');

const ORIGIN = 'https://website-bench.com';
const fm = (title, url, updated, type) => `---\ntitle: ${JSON.stringify(title)}\nurl: ${url}\nupdated: ${updated}\ntype: ${type}\n---\n\n`;
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const preBlock = (html, id) => decode(new RegExp(`<pre[^>]*id="${id}"[^>]*><code>([\\s\\S]*?)</code></pre>`).exec(html)[1]).trim();
const titleOf = html => decode(/<title>([^<]*)<\/title>/.exec(html)[1]);
const pct = v => (typeof v === 'number' ? v.toFixed(1) : '—');

function build(ctx) {
  const {root, facts, ranked, taskPages, lastmod, faq, bibtex, demo, best} = ctx;
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.writeFileSync(path.join(root, rel), text); };
  const html = f => fs.readFileSync(path.join(root, f), 'utf8');
  const sorted = [...ranked].sort((a, b) => b.overall - a.overall);
  const summary = `WebsiteBench is a benchmark of ${facts.tasks} production-level websites that AI agents rebuild through browser exploration. An agent explores a reference site in a browser and builds a full-stack offline version, scored by ${facts.tests} hidden tests. ${ctx.modelWord} models were evaluated with a 16-hour limit per run. The best, ${best.name}, has a ${facts['best-overall']} pass rate.`;
  const boardTable = ['| Model | Overall | Request | Browser | System |', '| --- | ---: | ---: | ---: | ---: |',
    ...sorted.map(m => `| ${m.name} | ${pct(m.overall)} | ${pct(m.request)} | ${pct(m.browser)} | ${pct(m.system)} |`)].join('\n');
  const benchmark = [
    '- A user workflow is a sequence of actions that completes a user goal and ends in an observable result, such as browsing products, adding an item to a cart, checking out and seeing an order confirmation.',
    '- An agent explores a locally hosted reference website through a browser: screenshots, interface state, navigation, clicks, typing and media downloads.',
    '- It builds a full-stack site that runs offline, within 16 hours, and may revisit the reference while coding and testing.',
    '- Hidden tests then compare rebuild and reference. Request (T1) tests check page responses and form submissions. Browser (T2) tests check interface behavior at three levels: immediate responses (L1), state changes read back (L2), and persistence, other users and recovery (L3). System (T3) tests check builds, restarts, process health and security.',
    '- A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. Browser workflow tests repeat a sequence of user actions and check its result. Each must pass with two independent executors, Playwright and Browser Use.',
    `- Scores are pass rates: 100 × sum(passed tests) / sum(total tests), for Overall and for each test group. Cost, tokens and turns are per-task means.`,
  ].join('\n');
  const findings = [
    '- Underexploration: by their first code edit, agents had visited nearly every core page and started nearly every core workflow, but had followed only a few to their final result.',
    '- A human trace, a log of browser actions without page content, raised scores.',
    '- Failure to implement observed behavior: almost none of the checked requirements that agents had observed were implemented the way the reference behaved. In an AMC Theatres run the agent opened /movies?tab=coming-soon, but its server ignores the tab query; in a PetSmart run the category cards keep their labels but show the wrong artwork.',
    '- Early stopping: most runs ended well before the 16-hour limit. With Claude Code\'s /goal hook reviewing each attempt to stop, a Kimi K3 run on Lowe\'s continued from 1.0 to 10.9 hours and its score rose from 0% to 31.3%.',
  ].join('\n');
  const links = `- Code: https://github.com/TIGER-AI-Lab/WebsiteBench\n- Tasks on Hugging Face: https://huggingface.co/datasets/TIGER-Lab/WebsiteBench\n- Tasks on Harbor Hub: https://hub.harborframework.com/datasets/websitebench/WebsiteBench`;
  const faqMd = faq.map(f => `### ${f.q}\n\n${f.a}`).join('\n\n');

  // ---- Markdown twins
  const twins = {};
  const bibBlock = '```bibtex\n' + bibtex + '\n```';
  twins['index.md'] = fm(titleOf(html('index.html')), `${ORIGIN}/`, lastmod, 'benchmark')
    + `# WebsiteBench\n\n${summary}\n\n## Leaderboard\n\nPercent of hidden tests passed.\n\n${boardTable}\n\n## Benchmark\n\n${benchmark}\n\n## Questions\n\n${faqMd}\n\n## Citation\n\n${bibBlock}\n\n## Links\n\n${links}\n- Run: ${ORIGIN}/run/index.md\n- Tasks: ${ORIGIN}/tasks/index.md\n- Eval: ${ORIGIN}/eval/index.md\n- Analysis: ${ORIGIN}/analysis/index.md\n`;

  const runHtml = html('run.html');
  twins['run/index.md'] = fm(titleOf(runHtml), `${ORIGIN}/run`, lastmod, 'guide')
    + `# Run the benchmark\n\nWebsiteBench is a benchmark of ${facts.tasks} tasks with ${facts.tests} hidden tests, run with Harbor, which fetches the tasks from Harbor Hub. It requires uv and Docker.\n\n## Run all ${facts.tasks} tasks\n\n\`\`\`sh\n${preBlock(runHtml, 'run-all')}\n\`\`\`\n\n## Run one task\n\n\`\`\`sh\n${preBlock(runHtml, 'run-one')}\n\`\`\`\n\n- The repository pins Harbor 0.25.0.\n- The same tasks are on Hugging Face: https://huggingface.co/datasets/TIGER-Lab/WebsiteBench. Pass \`--path\` to run a downloaded task.\n- Set \`--agent\` and \`--model\` to what you want to evaluate.\n- \`--allow-environment-host\` opens the agent installer's download hosts during setup.\n`;

  const evalHtml = html('eval.html');
  twins['eval/index.md'] = fm(titleOf(evalHtml), `${ORIGIN}/eval`, lastmod, 'method')
    + `# Eval\n\nThe WebsiteBench score is a pass rate: 100 × passed tests ÷ total tests over ${facts.tests} hidden tests in ${facts.tasks} tasks. A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. The run below is ${facts['demo-model']} on Uber Eats, which passes ${facts['demo-run-passed']} of ${facts['demo-run-total']} tests.\n\n## How a rebuild is tested\n\n${benchmark}\n\n## The Uber Eats run\n\n- Model: ${facts['demo-model']}\n- Score: ${facts['demo-run-score']} (${facts['demo-run-passed']} of ${facts['demo-run-total']} hidden tests)\n- Request / Browser / System tests passed: ${facts['demo-run-request']} / ${facts['demo-run-browser']} / ${facts['demo-run-system']}\n\n## Tests shown on the page\n\n${demo.tests.map(t => `- ${t.group}: ${t.text}`).join('\n')}\n`;

  twins['analysis/index.md'] = fm(titleOf(html('analysis.html')), `${ORIGIN}/analysis`, lastmod, 'analysis')
    + `# Analysis\n\nThe best agent, ${best.name}, passes ${facts['best-overall']} of ${facts.tests} hidden tests, about one test in ${facts['one-in']}. Agents fall short in three ways.\n\n## Findings\n\n${findings}\n`;

  twins['tasks/index.md'] = fm(titleOf(html('tasks.html')), `${ORIGIN}/tasks`, lastmod, 'catalog')
    + `# Tasks\n\nWebsiteBench has ${facts.tasks} websites and ${facts.tests} hidden tests; a task has between ${facts['tests-min']} and ${facts['tests-max']} tests. Each entry links to the task's Markdown page.\n\n`
    + taskPages.map(t => `- [${t.name}](${ORIGIN}/task/${ctx.taskSlug(t)}/index.md): ${t.tests.toLocaleString('en-US')} hidden tests, best ${t.best.rate.toFixed(1)}% (${t.best.model.name})`).join('\n') + '\n';

  for (const t of taskPages) {
    const slug = ctx.taskSlug(t), url = `${ORIGIN}/task/${slug}`;
    twins[`task/${slug}/index.md`] = fm(ctx.taskTitle(t), url, lastmod, 'task')
      + `# ${t.name}\n\n${ctx.taskAnswer(t)}\n\n## Results\n\n| Model | Passed | Total | Pass rate |\n| --- | ---: | ---: | ---: |\n${t.runs.map(r => `| ${r.model.name} | ${r.total ? r.passed.toLocaleString('en-US') : '—'} | ${r.total ? r.total.toLocaleString('en-US') : '—'} | ${r.total ? r.rate.toFixed(1) + '%' : '—'} |`).join('\n')}\n\n## Links\n\n- Page: ${url}\n- Task on Harbor Hub: https://hub.harborframework.com/tasks/websitebench/${t.id}\n- All tasks: ${ORIGIN}/tasks/index.md\n- Leaderboard: ${ORIGIN}/index.md\n`;
  }
  for (const [rel, text] of Object.entries(twins)) write(rel, text);

  // ---- llms.txt (llmstxt.org): sections of Markdown links, then Optional
  const md = p => `${ORIGIN}${p}`;
  const llms = `# WebsiteBench\n\n> ${summary}\n\n## Pages\n- [Leaderboard and citation](${md('/index.md')}): the eight models, benchmark design, FAQ and BibTeX\n- [Run](${md('/run/index.md')}): commands to run the benchmark with Harbor\n- [Tasks](${md('/tasks/index.md')}): the ${facts.tasks} websites, each with every model's result\n- [Eval](${md('/eval/index.md')}): how a rebuild is evaluated, with one real run\n- [Analysis](${md('/analysis/index.md')}): why agents fall short\n\n## Read by id\n- Any page as Markdown: \`curl -sL ${ORIGIN}/<kind>/<id>/index.md\`, for example [Amazon](${md('/task/amazon/index.md')}) for \`curl -sL ${ORIGIN}/task/amazon/index.md\`\n- [Agent guide](${md('/AGENTS.md')}): read commands, JSON data, citation and contact\n- [Full site as text](${md('/llms-full.txt')}): every page in one file\n\n## Leaderboard (percent of hidden tests passed: overall / Request / Browser / System)\n${sorted.map(m => `- ${m.name}: ${pct(m.overall)} / ${pct(m.request)} / ${pct(m.browser)} / ${pct(m.system)}`).join('\n')}\n\n## Task pages\n${taskPages.map(t => `- [${t.name}](${md(`/task/${ctx.taskSlug(t)}/index.md`)}): ${t.tests.toLocaleString('en-US')} hidden tests, best ${t.best.rate.toFixed(1)}%`).join('\n')}\n\n## Optional\n- [Code](https://github.com/TIGER-AI-Lab/WebsiteBench)\n- [Tasks on Hugging Face](https://huggingface.co/datasets/TIGER-Lab/WebsiteBench)\n- [Tasks on Harbor Hub](https://hub.harborframework.com/datasets/websitebench/WebsiteBench)\n- [Leaderboard data (JSON)](${md('/data/leaderboard.json')})\n- [Sitemap](${md('/sitemap.xml')})\n`;
  write('llms.txt', llms);

  // ---- llms-full.txt: every Markdown twin, front matter removed
  const body = t => t.replace(/^---\n[\s\S]*?\n---\n\n/, '');
  const order = ['index.md', 'run/index.md', 'tasks/index.md', 'eval/index.md', 'analysis/index.md', ...taskPages.map(t => `task/${ctx.taskSlug(t)}/index.md`)];
  const demote = text => { let fence = false; return text.split('\n').map(l => { if (l.startsWith('```')) fence = !fence; return !fence && /^#{1,5} /.test(l) ? '#' + l : l; }).join('\n'); };
  write('llms-full.txt', `# WebsiteBench: full site\n\n> ${summary}\n\nUpdated ${lastmod}. Each section below is the Markdown twin of a page at ${ORIGIN}.\n\n` + order.map(rel => `<!-- ${ORIGIN}/${rel} -->\n\n` + demote(body(twins[rel]))).join('\n---\n\n'));

  // ---- AGENTS.md, agents.md, agents.txt: identical
  const agents = `# WebsiteBench for agents\n\n${summary} The site is static and regenerated from the files in data/.\n\n## Read\n\n\`\`\`sh\n# any page as Markdown, by id\ncurl -sL ${ORIGIN}/<kind>/<id>/index.md\ncurl -sL ${ORIGIN}/index.md                    # leaderboard, FAQ, BibTeX\ncurl -sL ${ORIGIN}/task/amazon/index.md        # one task: every model's result\ncurl -sL ${ORIGIN}/run/index.md                # how to run the benchmark\ncurl -sL ${ORIGIN}/eval/index.md               # how a rebuild is evaluated\ncurl -sL ${ORIGIN}/analysis/index.md           # why agents fall short\ncurl -sL ${ORIGIN}/tasks/index.md              # the ${facts.tasks} task ids\ncurl -sL ${ORIGIN}/llms-full.txt               # the whole site as text\ncurl -sL ${ORIGIN}/sitemap.xml                 # every URL with lastmod\n\`\`\`\n\nKinds: \`task\` (id = slug listed in /tasks/index.md), \`run\`, \`eval\`, \`analysis\`, \`tasks\`. The home page is /index.md.\n\n## Data\n\n\`\`\`sh\ncurl -sL ${ORIGIN}/data/leaderboard.json       # eight models: scores, cost, tokens, turns\ncurl -sL ${ORIGIN}/data/leaderboard.csv\ncurl -sL ${ORIGIN}/data/waffle.json            # per-task results for every model\ncurl -sL ${ORIGIN}/data/task-materials.json    # recorded runs and published scores\n`;
  for (const f of ['AGENTS.md', 'agents.md', 'agents.txt']) write(f, agents);
  return Object.keys(twins).length;
}
module.exports = {build};
