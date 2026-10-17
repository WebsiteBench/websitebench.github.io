// Static HTML and browser views consume the same checksummed HF exports.
const fs=require('node:fs'),path=require('node:path');
const {renderRows}=require('../assets/js/leaderboard-view.js');
const root=path.join(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const cohort=read('cohort.json'),waffle=read('waffle.json'),board=read('leaderboard-views.json'),materials=read('task-materials.json');
const ids=cohort.tasks.map(t=>t.id),modelIDs=waffle.models.map(m=>m.id),same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
if(ids.length!==70||new Set(ids).size!==70||!same(ids,waffle.tasks.map(t=>t.id))||!same(ids,materials.tasks.map(t=>t.id)))throw Error('Current views must share the exact 70-task cohort');
if(modelIDs.length!==9||!modelIDs.includes('sol61')||modelIDs.includes('sol'))throw Error('Obsolete leaderboard model list');
for(const view of ['overview','1m','200k'])for(const model of board.views[view]){
 const entries=waffle.tasks.map(t=>t.results[model.id].contexts[model.variable_context?view:'recorded']).filter(e=>e.status==='scored');
 const mean=entries.reduce((n,e)=>n+100*e.passed/e.total,0)/entries.length;
 if(model.coverage.overall!==entries.length||Math.abs(model.overall-mean)>1e-9)throw Error('Leaderboard and Waffle disagree');
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inject=(marker,value)=>{if(!marker.test(html))throw Error('Generated content marker missing');html=html.replace(marker,(_,start,end)=>start+value+end);};
inject(/(<tbody id="board-body">)[\s\S]*?(<\/tbody><!--\/board-body-->)/,'\n'+renderRows(board.views.overview)+'\n');
for(const [id,data] of [['waffle-data',waffle],['leaderboard-data',board]])inject(new RegExp(`(<script type="application/json" id="${id}">)[\\s\\S]*?(<\\/script><!--\\/${id}-->)`),JSON.stringify(data).replace(/</g,'\\u003c'));
const citation=escape(fs.readFileSync(path.join(root,'CITATION.bib'),'utf8').trim()),citationMarker=/(<pre id="bibtex"><code>)[\s\S]*?(<\/code><\/pre>)/;
inject(citationMarker,citation);
html=html.replace(/<p class="benchmark-keyline">[\s\S]*?<\/p>/,`<p class="benchmark-keyline">${ids.length} tasks <span>·</span> ${modelIDs.length} models <span>·</span> 16 h / run</p>`);
fs.writeFileSync(path.join(root,'index.html'),html);
let analysis=fs.readFileSync(path.join(root,'analysis.html'),'utf8');analysis=analysis.replace(citationMarker,(_,start,end)=>start+citation+end);fs.writeFileSync(path.join(root,'analysis.html'),analysis);
fs.writeFileSync(path.join(root,'data/evaluated-tasks.json'),JSON.stringify(ids,null,2)+'\n');
const previews=read('task-previews.json');
const taskCatalog={models:materials.models,tasks:materials.tasks.map(t=>({id:t.id,name:t.name,views:previews.tasks[t.id]?.views||[]}))};
fs.writeFileSync(path.join(root,'data/task-catalog.json'),JSON.stringify(taskCatalog,null,2)+'\n');
console.log(`Verified and rendered ${ids.length} tasks × ${modelIDs.length} models; Table, Pareto and Waffle share all context selections.`);
