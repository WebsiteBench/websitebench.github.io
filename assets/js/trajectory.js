/* ATIF reader for one local file. Trace text is rendered as text, never as HTML or commands. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const LIMIT=64*1024*1024,PAGE=100;
  const imageTypes=new Set(['image/png','image/jpeg','image/gif','image/webp']);
  const audioTypes=new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/mp4']);
  let documents=[],current=null,matches=[],active=0,assets=new Map(),basenames=new Map(),objectURLs=[];
  let requestVersion=0,sourceLabel='',searchTimer=null;
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const pretty=value=>typeof value==='string'?value:JSON.stringify(value,null,2)??'';
  const number=value=>Number.isFinite(value)?value.toLocaleString('en-US'):'—';
  function status(text){$('#trace-status').textContent=text;}
  function clearAssets(){objectURLs.forEach(url=>URL.revokeObjectURL(url));objectURLs=[];assets=new Map();basenames=new Map();}
  function clearTrace(){
    documents=[];current=null;matches=[];active=0;clearAssets();
    $('#trace-content').hidden=true;$('#trace-step-list').replaceChildren();$('#trace-step-detail').replaceChildren();
    $('#trace-run-details').replaceChildren();
    $('#trace-document').replaceChildren();$('#trace-document-control').hidden=true;
    $('#trace-search').value='';$('#trace-filter').value='all';
  }
  function normalizePath(path){return String(path).replace(/\\/g,'/').replace(/^\.\//,'');}
  function validate(root){
    let total=0;
    const entries=[];
    function visit(data,parent=null,index=0,depth=0){
      if(depth>24||entries.length>=256)throw Error('Too many embedded agent trajectories.');
      if(!data||typeof data!=='object'||!/^ATIF-v1\.[0-8]$/.test(data.schema_version||'')||!Array.isArray(data.steps)||!data.steps.length)throw Error('Expected an ATIF-v1.0–v1.8 JSON document with non-empty steps.');
      if(!data.agent||typeof data.agent!=='object'||Array.isArray(data.agent))throw Error('ATIF agent metadata is missing.');
      total+=data.steps.length;if(total>50000)throw Error('This viewer supports up to 50,000 steps per file.');
      for(let i=0;i<data.steps.length;i++){
        const step=data.steps[i];
        if(!step||step.step_id!==i+1||!['system','user','agent'].includes(step.source)||!(typeof step.message==='string'||Array.isArray(step.message)))throw Error(`Invalid ATIF step ${i+1}: check step_id, source, and message.`);
        if(step.tool_calls!=null&&!Array.isArray(step.tool_calls))throw Error(`Invalid tool calls in step ${i+1}.`);
        for(const call of step.tool_calls||[])if(!call||typeof call.tool_call_id!=='string'||typeof call.function_name!=='string'||!call.arguments||typeof call.arguments!=='object'||Array.isArray(call.arguments))throw Error(`Invalid tool call in step ${i+1}.`);
        if(step.observation!=null&&(!Array.isArray(step.observation.results)||step.observation.results.some(result=>!result||typeof result!=='object')))throw Error(`Invalid observation in step ${i+1}.`);
        for(const result of step.observation?.results||[])if(result.subagent_trajectory_ref!=null&&(!Array.isArray(result.subagent_trajectory_ref)||result.subagent_trajectory_ref.some(ref=>!ref||typeof ref!=='object')))throw Error(`Invalid agent reference in step ${i+1}.`);
      }
      const entry={data,key:parent?`${parent.key}.${index}`:'main',parent,children:[],search:null};entries.push(entry);
      if(data.subagent_trajectories!=null&&!Array.isArray(data.subagent_trajectories))throw Error('Invalid embedded agent list.');
      const ids=new Set();
      (data.subagent_trajectories||[]).forEach((child,index)=>{
        if(typeof child.trajectory_id!=='string'||!child.trajectory_id||ids.has(child.trajectory_id))throw Error('Embedded agents need unique trajectory_id values.');
        ids.add(child.trajectory_id);entry.children.push(visit(child,entry,index,depth+1));
      });
      return entry;
    }
    visit(root);return entries;
  }
  function block(title,value,open=true){
    const detail=node('details',undefined,'trace-block');detail.open=open;detail.appendChild(node('summary',title));
    if(open)detail.appendChild(content(value));else detail.addEventListener('toggle',()=>{if(detail.open&&!detail.querySelector('.trace-body'))detail.appendChild(content(value));});
    return detail;
  }
  function textBlock(text){
    const pre=node('pre',text.length>20000?text.slice(0,20000):text);
    const wrap=node('div',undefined,'trace-text');wrap.appendChild(pre);
    if(text.length>20000){const more=node('button',`Show full text (${number(text.length)} characters)`,'trace-show-full');more.type='button';more.addEventListener('click',()=>{pre.textContent=text;more.remove();});wrap.appendChild(more);}
    return wrap;
  }
  function media(part){
    const wrap=node('div',undefined,'trace-media'),source=part.source||{},path=typeof source.path==='string'?source.path:'',type=source.media_type||part.file?.mime_type||(part.type==='image'?'image/png':'audio/wav');
    const allowed=part.type==='image'?imageTypes:audioTypes;
    const normalized=normalizePath(path);
    let url=allowed.has(type)?assets.get(normalized)||basenames.get(normalized.split('/').pop()):null;
    if(!url&&allowed.has(type)&&typeof path==='string'&&path.startsWith(`data:${type};base64,`)&&/^[A-Za-z0-9+/=\r\n]+$/.test(path.split(',')[1]||''))url=path;
    const encoded=part.file?.base64||(source.type==='base64'?source.data:null);
    if(!url&&allowed.has(type)&&typeof encoded==='string'&&/^[A-Za-z0-9+/=\r\n]+$/.test(encoded))url=`data:${type};base64,${encoded}`;
    if(url){
      const element=document.createElement(part.type==='image'?'img':'audio');element.src=url;
      if(part.type==='image'){element.alt=source.alt||`Recorded screenshot: ${path.startsWith('data:')?'embedded image':path}`;element.loading='lazy';}else{element.controls=true;element.preload='none';}
      element.addEventListener('error',()=>{wrap.replaceChildren(node('p','Media file could not be displayed.'));},{once:true});
      if(part.type==='image'){const link=node('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.title='Open screenshot at full size';link.appendChild(element);wrap.appendChild(link);}else wrap.appendChild(element);
    }else wrap.appendChild(node('p',`Media not included: ${path.startsWith('data:')?'unsupported embedded media':path||'no file reference'}`));
    return wrap;
  }
  function content(value){
    const wrap=node('div',undefined,'trace-body');
    if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)&&value.slice(0,160).includes('"type"')){
      try{const parsed=JSON.parse(value);if(parsed?.type==='image'||parsed?.type==='audio'||Array.isArray(parsed)&&parsed.length&&parsed.every(p=>['text','image','audio'].includes(p?.type)))return content(parsed);}catch(_){}
    }
    if(['image','audio'].includes(value?.type)){wrap.appendChild(media(value));return wrap;}
    if(Array.isArray(value))for(const part of value){
      if(part?.type==='text'&&typeof part.text==='string')wrap.appendChild(textBlock(part.text));
      else if(['image','audio'].includes(part?.type))wrap.appendChild(media(part));
      else wrap.appendChild(textBlock(pretty(part)));
    }else wrap.appendChild(textBlock(pretty(value)));
    return wrap;
  }
  function resolveSubagent(ref){
    if(!ref.trajectory_id)return null;
    let owner=current;
    while(owner){const child=owner.children.find(entry=>entry.data.trajectory_id===ref.trajectory_id);if(child)return child;owner=owner.parent;}
    return null;
  }
  function observation(result,label){
    let value=result.content;
    const recorded=result.extra?.tool_result_metadata?.tool_use_result;
    if(typeof value==='string'&&value.trimStart().startsWith('{"type": "image"')&&recorded?.type==='image')value=recorded;
    const wrap=block(label,value??'(No content)',true);
    for(const ref of result.subagent_trajectory_ref||[]){
      const target=resolveSubagent(ref);
      if(target){const button=node('button',`View agent: ${target.data.agent.name||target.data.trajectory_id}`,'trace-subagent');button.type='button';button.addEventListener('click',()=>selectDocument(target.key));wrap.appendChild(button);}
      else wrap.appendChild(node('p',`Agent trajectory not included: ${ref.trajectory_path||ref.trajectory_id||'unknown reference'}`,'trace-reference-note'));
    }
    return wrap;
  }
  function showStep(index,scroll=false){
    if(!current)return;active=Math.max(0,Math.min(matches.length-1,index));
    const detail=$('#trace-step-detail');detail.replaceChildren();
    $('#trace-previous').disabled=!matches.length||active===0;$('#trace-next').disabled=!matches.length||active===matches.length-1;
    $('#trace-step-number').disabled=!matches.length;$('#trace-step-total').textContent=`/ ${current.data.steps.length}`;
    if(!matches.length){$('#trace-step-number').value='';detail.appendChild(node('p','No matching steps.'));renderList();return;}
    const step=current.data.steps[matches[active]];
    $('#trace-step-number').value=step.step_id;$('#trace-step-number').max=current.data.steps.length;
    const heading=node('header',undefined,'trace-step-heading');heading.appendChild(node('h3',`Step ${step.step_id}, ${step.source}`));
    if(step.timestamp){const time=node('time',step.timestamp);time.dateTime=step.timestamp;heading.appendChild(time);}detail.appendChild(heading);
    const model=step.model_name||current.data.agent.model_name;if(model)detail.appendChild(node('p',model,'trace-step-model'));
    if(step.is_copied_context)detail.appendChild(node('p','Copied context from an earlier segment.','trace-reference-note'));
    if(step.message!==''&&step.message!=null)detail.appendChild(block('Message',step.message));
    if(step.reasoning_content)detail.appendChild(block('Reasoning',step.reasoning_content,false));
    const results=(step.observation||{}).results||[],used=new Set();
    for(const call of step.tool_calls||[]){
      const group=node('section',undefined,'trace-tool');group.appendChild(node('h4',call.function_name));group.appendChild(node('p',call.tool_call_id,'trace-call-id'));group.appendChild(block('Arguments',call.arguments));
      results.forEach((result,index)=>{if(result.source_call_id===call.tool_call_id){used.add(index);group.appendChild(observation(result,'Result'));}});
      if(!results.some(result=>result.source_call_id===call.tool_call_id))group.appendChild(node('p','No result recorded for this call.','trace-reference-note'));
      detail.appendChild(group);
    }
    results.forEach((result,index)=>{if(!used.has(index))detail.appendChild(observation(result,result.source_call_id?`Unmatched result ${result.source_call_id}`:'Observation'));});
    if(step.metrics)detail.appendChild(block('Step metrics',step.metrics,false));
    detail.appendChild(block('Raw step',step,false));renderList();
    if(scroll)detail.scrollIntoView({block:'nearest'});
  }
  function renderList(){
    const list=$('#trace-step-list');list.replaceChildren();
    const start=Math.floor(active/PAGE)*PAGE,end=Math.min(start+PAGE,matches.length);
    if(start){const previous=node('button',`Steps ${start-PAGE+1}–${start}`);previous.type='button';previous.addEventListener('click',()=>showStep(start-PAGE));list.appendChild(previous);}
    for(let i=start;i<end;i++){
      const step=current.data.steps[matches[i]],button=node('button',undefined,'trace-step-link');button.type='button';button.dataset.step=step.step_id;
      if(i===active)button.setAttribute('aria-current','step');
      const names=(step.tool_calls||[]).map(call=>call.function_name).join(', ');
      const label=names||'Message';button.title=label;
      button.appendChild(node('span',`${step.step_id}, ${step.source}`));button.appendChild(node('small',label));button.addEventListener('click',()=>showStep(i));list.appendChild(button);
    }
    if(end<matches.length){const next=node('button',`Steps ${end+1}–${Math.min(end+PAGE,matches.length)}`);next.type='button';next.addEventListener('click',()=>showStep(end));list.appendChild(next);}
    const selected=list.querySelector('[aria-current="step"]');
    if(selected){const row=selected.getBoundingClientRect(),bounds=list.getBoundingClientRect();list.scrollTop+=row.top-bounds.top-(list.clientHeight-row.height)/2;}
  }
  function filterSteps(preferred){
    if(!current)return;
    const query=$('#trace-search').value.trim().toLocaleLowerCase(),role=$('#trace-filter').value;
    if(query&&!current.search)current.search=current.data.steps.map(step=>JSON.stringify(step).toLocaleLowerCase());
    matches=[];current.data.steps.forEach((step,index)=>{if((role==='all'||role==='tools'&&(step.tool_calls||[]).length||role===step.source)&&(!query||current.search[index].includes(query)))matches.push(index);});
    $('#trace-match-count').textContent=`${number(matches.length)} / ${number(current.data.steps.length)} steps`;
    showStep(preferred===undefined?0:Math.max(0,matches.indexOf(preferred)));
  }
  function selectDocument(value,preferred){
    current=documents.find(entry=>entry.key===value)||documents[0];$('#trace-document').value=current.key;
    $('#trace-search').value='';$('#trace-filter').value='all';
    const data=current.data,metric=data.final_metrics||{};
    const stats=[sourceLabel,data.schema_version,`${number(data.steps.length)} steps`];
    if(data.agent.model_name)stats.push(data.agent.model_name);
    if(Number.isFinite(metric.total_prompt_tokens))stats.push(`${number(metric.total_prompt_tokens)} input tokens`);
    if(Number.isFinite(metric.total_completion_tokens))stats.push(`${number(metric.total_completion_tokens)} output tokens`);
    status(stats.join(', '));$('#trace-content').hidden=false;
    $('#trace-run-details').replaceChildren(block('Run details',Object.fromEntries(Object.entries(data).filter(([key])=>!['steps','subagent_trajectories'].includes(key))),false));
    filterSteps(preferred);
  }
  function install(data,label,files=[]){
    const parsed=validate(data);clearAssets();documents=parsed;sourceLabel=label;
    for(const file of files){
      if(!imageTypes.has(file.type)&&!audioTypes.has(file.type))continue;
      const url=URL.createObjectURL(file);objectURLs.push(url);const path=normalizePath(file.webkitRelativePath||file.name);assets.set(path,assets.has(path)?null:url);
      if(!basenames.has(file.name))basenames.set(file.name,url);else basenames.set(file.name,null);
    }
    const picker=$('#trace-document');picker.replaceChildren(...documents.map(entry=>{const o=node('option',entry.key==='main'?'Main agent':`${entry.data.agent.name||'Agent'}, ${entry.data.trajectory_id}`);o.value=entry.key;return o;}));
    $('#trace-document-control').hidden=documents.length<=1;
    selectDocument('main',0);
  }
  $('#trace-file').addEventListener('change',async event=>{
    const files=[...event.target.files],json=files.filter(file=>/\.json$/i.test(file.name));event.target.value='';
    if(!files.length)return;
    const version=++requestVersion;clearTrace();
    try{
      if(json.length!==1)throw Error('Choose exactly one ATIF JSON file, optionally with its images or audio.');
      if(files.reduce((sum,file)=>sum+file.size,0)>LIMIT)throw Error('Selected files exceed the 64 MB limit.');
      status('Reading the file…');const data=JSON.parse(await json[0].text());if(version!==requestVersion)return;
      install(data,json[0].name,files);
    }catch(error){if(version===requestVersion){clearTrace();status(error.message);}}
  });
  $('#trace-document').addEventListener('change',event=>selectDocument(event.target.value));
  $('#trace-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>filterSteps(),150);});
  $('#trace-filter').addEventListener('change',()=>filterSteps());
  $('#trace-previous').addEventListener('click',()=>showStep(active-1));$('#trace-next').addEventListener('click',()=>showStep(active+1));
  $('#trace-step-number').addEventListener('change',event=>{
    if(!current)return;const requested=Number(event.target.value);
    if(!Number.isInteger(requested)||requested<1||requested>current.data.steps.length){showStep(active);return;}
    $('#trace-search').value='';$('#trace-filter').value='all';filterSteps(requested-1);
  });
  $('#trace-step-list').addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();showStep(active+(event.key==='ArrowDown'?1:-1));$('#trace-step-list [aria-current="step"]')?.focus({preventScroll:true});});
  addEventListener('pagehide',clearAssets);
})();
