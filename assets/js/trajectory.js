/* ATIF reader. Original trace text is rendered as text, never HTML or commands. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),panel=$('#trajectory-panel');
  const LIMIT=64*1024*1024,PAGE=100;
  const imageTypes=new Set(['image/png','image/jpeg','image/gif','image/webp']);
  const audioTypes=new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/mp4']);
  let selection,key='',runs=[],documents=[],current=null,matches=[],active=0,assets=new Map(),basenames=new Map(),objectURLs=[],honorDeepLink=true;
  let requestVersion=0,controller=null,sourceLabel='',searchTimer=null,metadataLoaded=false;
  let localFileActive=new URLSearchParams(location.search).get('trace')==='local',waitingForLocal=localFileActive,currentRunID=null;
  let remote=null,stepVersion=0,filterVersion=0,stepController=null,filterController=null,stepCache=new Map();
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const pretty=value=>typeof value==='string'?value:JSON.stringify(value,null,2)??'';
  const number=value=>Number.isFinite(value)?value.toLocaleString('en-US'):'—';
  function objectURL(value){
    if(!remote||typeof value!=='string')return null;
    try{const base=new URL(remote.storage||`/_preview_runtime/task-data/${remote.id}/`,location.href),url=new URL(value,location.href);
      const file=url.pathname.slice(base.pathname.length);
      return url.origin===base.origin&&url.pathname.startsWith(base.pathname)&&/^[\w.-]+$/.test(file)&&!url.search&&!url.hash?url.href:null;
    }catch(_){return null;}
  }
  function status(text){$('#trace-status').textContent=text;}
  function runPlaceholder(label){
    const picker=$('#trace-run');picker.querySelector('option[data-placeholder]')?.remove();
    const option=node('option',label);option.value='';option.disabled=true;option.dataset.placeholder='true';picker.prepend(option);picker.value='';
    $('#trace-run-control').hidden=!runs.length;
  }
  function clearAssets(){objectURLs.forEach(url=>URL.revokeObjectURL(url));objectURLs=[];assets=new Map();basenames=new Map();}
  function clearTrace(){
    ++stepVersion;++filterVersion;stepController?.abort();filterController?.abort();remote=null;stepCache.clear();documents=[];current=null;matches=[];active=0;clearAssets();
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
    if(remote&&allowed.has(type)&&/\.(png|jpe?g|webp|gif|wav|mp3|ogg|m4a|mp4)$/.test(path))url=objectURL(path);
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
    if(value?._wb_text){wrap.appendChild(lazyText(value));return wrap;}
    if(['image','audio'].includes(value?.type)){wrap.appendChild(media(value));return wrap;}
    if(Array.isArray(value))for(const part of value){
      if(part?.type==='text'&&part.text?._wb_text)wrap.appendChild(lazyText(part.text));
      else if(part?.type==='text'&&typeof part.text==='string')wrap.appendChild(textBlock(part.text));
      else if(['image','audio'].includes(part?.type))wrap.appendChild(media(part));
      else wrap.appendChild(textBlock(pretty(part)));
    }else {wrap.appendChild(textBlock(pretty(value)));appendTextLinks(value,wrap);}
    return wrap;
  }
  function lazyText(value){
    const wrap=node('div',undefined,'trace-text');wrap.appendChild(node('pre',value.preview||''));
    const button=node('button',`Load full text · ${number(value.characters)} characters`,'trace-show-full');button.type='button';
    button.addEventListener('click',async()=>{button.disabled=true;button.textContent='Loading…';try{const url=objectURL(value._wb_text);if(!url||!url.endsWith('.txt'))throw Error();const response=await fetch(url);if(!response.ok)throw Error();wrap.replaceChildren(textBlock(await response.text()));}catch(_){button.disabled=false;button.textContent='Unavailable · retry';}});
    wrap.appendChild(button);return wrap;
  }
  function appendTextLinks(value,wrap,depth=0){
    if(depth>12||!value||typeof value!=='object')return;
    if(value._wb_text){wrap.appendChild(lazyText(value));return;}
    for(const child of Object.values(value))appendTextLinks(child,wrap,depth+1);
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
      if(target){const button=node('button',`View agent · ${target.data.agent.name||target.data.trajectory_id}`,'trace-subagent');button.type='button';button.addEventListener('click',()=>selectDocument(target.key));wrap.appendChild(button);}
      else wrap.appendChild(node('p',`Agent trajectory not included: ${ref.trajectory_path||ref.trajectory_id||'unknown reference'}`,'trace-reference-note'));
    }
    return wrap;
  }
  function updateURL(step){
    const url=new URL(location.href);url.searchParams.set('step',String(step));if(current.key==='main')url.searchParams.delete('trajectory_agent');else url.searchParams.set('trajectory_agent',current.key);
    if(localFileActive){url.searchParams.set('trace','local');url.searchParams.delete('trace_run');}else{url.searchParams.delete('trace');if(currentRunID)url.searchParams.set('trace_run',currentRunID);}
    history.replaceState(null,'',url);
  }
  async function showStep(index,scroll=false){
    if(!current)return;active=Math.max(0,Math.min(matches.length-1,index));
    const detail=$('#trace-step-detail');detail.replaceChildren();
    $('#trace-previous').disabled=!matches.length||active===0;$('#trace-next').disabled=!matches.length||active===matches.length-1;
    $('#trace-step-number').disabled=!matches.length;$('#trace-step-total').textContent=`/ ${current.data.steps.length}`;
    if(!matches.length){$('#trace-step-number').value='';detail.appendChild(node('p','No matching steps.'));renderList();return;}
    let step=current.data.steps[matches[active]];
    $('#trace-step-number').value=step.step_id;$('#trace-step-number').max=current.data.steps.length;
    if(remote){
      const own=++stepVersion,summary=step;stepController?.abort();stepController=new AbortController();
      renderList();updateURL(summary.step_id);detail.setAttribute('aria-busy','true');detail.appendChild(node('p',`Loading step ${summary.step_id}…`,'trace-reference-note'));
      try{if(!stepCache.has(summary.url)){const url=objectURL(summary.url);if(!url)throw Error();const response=await fetch(url,{signal:stepController.signal});if(!response.ok)throw Error();stepCache.set(summary.url,await response.json());if(stepCache.size>12)stepCache.delete(stepCache.keys().next().value);}if(own!==stepVersion)return;step=stepCache.get(summary.url);detail.replaceChildren();}
      catch(error){if(error.name!=='AbortError'&&own===stepVersion){detail.replaceChildren(node('p','This step could not be loaded. Select it again to retry.'));detail.setAttribute('aria-busy','false');}return;}
      detail.setAttribute('aria-busy','false');
    }
    const heading=node('header',undefined,'trace-step-heading');heading.appendChild(node('h2',`Step ${step.step_id} · ${step.source}`));
    if(step.timestamp){const time=node('time',step.timestamp);time.dateTime=step.timestamp;heading.appendChild(time);}detail.appendChild(heading);
    const model=step.model_name||current.data.agent.model_name;if(model)detail.appendChild(node('p',model,'trace-step-model'));
    if(step.is_copied_context)detail.appendChild(node('p','Copied context from an earlier segment.','trace-reference-note'));
    if(step.message!==''&&step.message!=null)detail.appendChild(block('Message',step.message));
    if(step.reasoning_content)detail.appendChild(block('Reasoning',step.reasoning_content,false));
    const results=(step.observation||{}).results||[],used=new Set();
    for(const call of step.tool_calls||[]){
      const group=node('section',undefined,'trace-tool');group.appendChild(node('h3',call.function_name));group.appendChild(node('p',call.tool_call_id,'trace-call-id'));group.appendChild(block('Arguments',call.arguments));
      results.forEach((result,index)=>{if(result.source_call_id===call.tool_call_id){used.add(index);group.appendChild(observation(result,'Result'));}});
      if(!results.some(result=>result.source_call_id===call.tool_call_id))group.appendChild(node('p','No result recorded for this call.','trace-reference-note'));
      detail.appendChild(group);
    }
    results.forEach((result,index)=>{if(!used.has(index))detail.appendChild(observation(result,result.source_call_id?`Unmatched result · ${result.source_call_id}`:'Observation'));});
    if(step.metrics)detail.appendChild(block('Step metrics',step.metrics,false));
    if(step._wb_extra){
      const extra=node('details',undefined,'trace-block');extra.appendChild(node('summary','Original provider fields'));
      extra.addEventListener('toggle',async()=>{if(!extra.open||extra.dataset.loaded)return;extra.dataset.loaded='true';try{const url=objectURL(step._wb_extra);if(!url)throw Error();const response=await fetch(url);if(!response.ok)throw Error();extra.appendChild(content(await response.json()));}catch(_){extra.dataset.loaded='';extra.appendChild(node('p','Provider fields could not be loaded.'));}});detail.appendChild(extra);
    }
    detail.appendChild(block('Raw step',step,false));renderList();updateURL(step.step_id);
    if(scroll)detail.scrollIntoView({block:'nearest'});
  }
  function renderList(){
    const list=$('#trace-step-list');list.replaceChildren();
    const start=Math.floor(active/PAGE)*PAGE,end=Math.min(start+PAGE,matches.length);
    if(start){const previous=node('button',`← Steps ${start-PAGE+1}–${start}`);previous.type='button';previous.addEventListener('click',()=>showStep(start-PAGE));list.appendChild(previous);}
    for(let i=start;i<end;i++){
      const step=current.data.steps[matches[i]],button=node('button',undefined,'trace-step-link');button.type='button';button.dataset.step=step.step_id;
      if(i===active)button.setAttribute('aria-current','step');
      const names=step.tools?.join(', ')||(step.tool_calls||[]).map(call=>call.function_name).join(', ');
      const label=step.label||names||'Message';button.title=names&&step.label?`${names} · ${step.label}`:label;
      button.appendChild(node('span',`${step.step_id} · ${step.source}`));button.appendChild(node('small',label));button.addEventListener('click',()=>showStep(i));list.appendChild(button);
    }
    if(end<matches.length){const next=node('button',`Steps ${end+1}–${Math.min(end+PAGE,matches.length)} →`);next.type='button';next.addEventListener('click',()=>showStep(end));list.appendChild(next);}
    const selected=list.querySelector('[aria-current="step"]');
    if(selected){const row=selected.getBoundingClientRect(),bounds=list.getBoundingClientRect();list.scrollTop+=row.top-bounds.top-(list.clientHeight-row.height)/2;}
  }
  async function filterSteps(preferred){
    if(!current)return;
    const query=$('#trace-search').value.trim().toLocaleLowerCase(),role=$('#trace-filter').value;
    if(remote){
      const own=++filterVersion;filterController?.abort();filterController=new AbortController();
      if(query&&!remote.storage){
        $('#trace-match-count').textContent='Searching…';
        try{const url=`/_preview_runtime/task-search?${new URLSearchParams({id:remote.id,agent:current.key,q:query,role,origin:location.origin})}`;const response=await fetch(url,{signal:filterController.signal});if(!response.ok)throw Error();const data=await response.json();if(own!==filterVersion)return;matches=data.positions;}
        catch(error){if(error.name!=='AbortError'&&own===filterVersion)$('#trace-match-count').textContent='Search unavailable';return;}
      }else matches=current.data.steps.flatMap((step,i)=>(role==='all'||role===step.source||role==='tools'&&step.tools.length)&&(!query||JSON.stringify([step.label,step.tools,step.source]).toLocaleLowerCase().includes(query))?[i]:[]);
      $('#trace-match-count').textContent=`${number(matches.length)} / ${number(current.data.steps.length)} steps`;
      showStep(preferred===undefined?0:Math.max(0,matches.indexOf(preferred)));return;
    }
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
    status(stats.join(' · '));$('#trace-content').hidden=false;
    $('#trace-run-details').replaceChildren(block('Run details',Object.fromEntries(Object.entries(data).filter(([key])=>!['steps','subagent_trajectories'].includes(key))),false));
    filterSteps(preferred);
    if(data.continued_trajectory_ref)$('#trace-step-detail').prepend(node('p',`Continuation not included: ${data.continued_trajectory_ref}`,'trace-reference-note'));
  }
  function install(data,label,files=[]){
    const parsed=validate(data);clearAssets();documents=parsed;sourceLabel=label;
    for(const file of files){
      if(!imageTypes.has(file.type)&&!audioTypes.has(file.type))continue;
      const url=URL.createObjectURL(file);objectURLs.push(url);const path=normalizePath(file.webkitRelativePath||file.name);assets.set(path,assets.has(path)?null:url);
      if(!basenames.has(file.name))basenames.set(file.name,url);else basenames.set(file.name,null);
    }
    const picker=$('#trace-document');picker.replaceChildren(...documents.map(entry=>{const o=node('option',entry.key==='main'?'Main agent':`${entry.data.agent.name||'Agent'} · ${entry.data.trajectory_id}`);o.value=entry.key;return o;}));
    $('#trace-document-control').hidden=documents.length<=1;
    const params=new URLSearchParams(location.search),deepLink=honorDeepLink?Number(params.get('step')):1,documentKey=honorDeepLink?params.get('trajectory_agent'):'main';honorDeepLink=false;
    selectDocument(documentKey,Number.isInteger(deepLink)&&deepLink>0?deepLink-1:0);
  }
  async function readResponse(response){
    if(!response.ok)throw Error('Trajectory unavailable. Open a local ATIF file instead.');
    const length=Number(response.headers.get('Content-Length'));if(length>LIMIT)throw Error('ATIF file exceeds the 64 MB limit.');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('ATIF file exceeds the 64 MB limit.');chunks.push(value);}}catch(error){await reader.cancel();throw error;}
    return JSON.parse(await new Blob(chunks).text());
  }
  async function loadRun(){
    const run=runs.find(entry=>entry.key===$('#trace-run').value);if(!run)return;
    $('#trace-run').querySelector('option[data-placeholder]')?.remove();
    localFileActive=false;waitingForLocal=false;currentRunID=run.run_id;
    const version=++requestVersion;controller?.abort();controller=new AbortController();clearTrace();status('Loading trajectory…');
    try{const response=await fetch(run.url,{signal:controller.signal,cache:'no-store'}),data=await readResponse(response);if(version!==requestVersion)return;
      install(data,`Recorded run${run.context?' · '+run.context:''}${run.run_id===selection?.runID?' · matches website preview':''}`);
    }catch(error){if(version===requestVersion&&error.name!=='AbortError'){clearTrace();runPlaceholder('Choose a recorded run');status(error.message);}}
  }
  function validRun(run,local){
    return run&&run.task===selection?.task&&run.model===selection?.model&&typeof run.run_id==='string'&&typeof run.label==='string'
      &&(local?/^\/_preview_runtime\/trace\/[\w-]+\.json$/.test(run.url||''):/^data\/trajectories\/[\w/-]+\.json$/.test(run.url||'')&&!run.url.includes('..'));
  }
  async function loadSources(){
    const version=++requestVersion,chosen={...selection};controller?.abort();controller=new AbortController();status('Looking for recorded trajectories…');
    if(chosen.record){
      metadataLoaded=true;$('#trace-run-control').hidden=true;currentRunID=chosen.record.id;localFileActive=false;
      try{
        let result;
        do{
          const response=await fetch(chosen.traceBase?`${chosen.traceBase}${chosen.record.id}/manifest.json`:`/_preview_runtime/task-trace?${new URLSearchParams({id:chosen.record.id,origin:location.origin})}`,{signal:controller.signal,cache:chosen.traceBase?'default':'no-store'});
          if(!response.ok)throw Error('The trajectory service is not connected. Use Open ATIF to read a local file.');result=chosen.traceBase?{status:'ready',manifest:await response.json()}:await response.json();
          if(version!==requestVersion)return;
          if(['preparing','busy'].includes(result.status)){status(result.message);await new Promise(resolve=>setTimeout(resolve,800));}
        }while(['preparing','busy'].includes(result.status));
        if(result.status!=='ready')throw Error(result.message||'Trajectory unavailable.');
        remote=result.manifest;if(remote.id!==chosen.record.id)throw Error('The trajectory does not match this recorded context.');
        if(chosen.traceBase)remote.storage=`${chosen.traceBase}${chosen.record.id}/`;
        $('#trace-search').placeholder=remote.storage?'Search step summaries…':'Search messages, calls, results…';
        sourceLabel='Recorded context · '+(/[\u3400-\u9fff]/.test(chosen.record.context)?'not recorded':chosen.record.context);
        documents=remote.documents.map(doc=>({key:doc.key,parent:null,children:[],data:{...doc.metadata,steps:doc.steps}}));
        remote.documents.forEach((doc,i)=>{if(doc.parent){const parent=documents.find(d=>d.key===doc.parent);documents[i].parent=parent;parent?.children.push(documents[i]);}});
        const picker=$('#trace-document');picker.replaceChildren(...documents.map(entry=>{const o=node('option',entry.key==='main'?'Main agent':entry.data.agent?.name||entry.data.trajectory_id||entry.key);o.value=entry.key;return o;}));$('#trace-document-control').hidden=documents.length<=1;
        const params=new URLSearchParams(location.search),step=honorDeepLink?Number(params.get('step')):1,agent=honorDeepLink?params.get('trajectory_agent'):'main';honorDeepLink=false;
        selectDocument(agent,Number.isInteger(step)&&step>0?step-1:0);
        return;
      }catch(error){if(version===requestVersion&&error.name!=='AbortError'){clearTrace();metadataLoaded=false;status(error.message);}return;}
    }
    const local=`/_preview_runtime/trajectories?task=${encodeURIComponent(chosen.task)}&model=${encodeURIComponent(chosen.model)}&origin=${encodeURIComponent(location.origin)}`;
    const results=await Promise.allSettled([fetch('data/trajectories.json',{signal:controller.signal}).then(r=>r.ok?r.json():null),fetch(local,{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():null)]);
    if(version!==requestVersion)return;
    const collected=[];results.forEach((result,index)=>{if(result.status==='fulfilled')for(const run of result.value?.runs||[])if(validRun(run,index===1))collected.push({...run,key:`${index}:${run.run_id}`});});
    // If both a published and a local copy exist, prefer the published one.
    runs=[...new Map(collected.reverse().map(run=>[run.run_id,run])).values()].reverse();metadataLoaded=true;
    const picker=$('#trace-run');picker.replaceChildren(...runs.map(run=>{const option=node('option',run.label);option.value=run.key;return option;}));$('#trace-run-control').hidden=!runs.length;
    const requested=new URLSearchParams(location.search).get('trace_run'),explicit=runs.find(run=>run.run_id===requested),matching=explicit||runs.find(run=>run.run_id===selection?.runID);if(matching)picker.value=matching.key;
    if(waitingForLocal){runPlaceholder('Open a local ATIF file');status('Open your local ATIF file again. Local files are not stored on this website.');}
    else if(requested&&!explicit){runPlaceholder('Choose a recorded run');status('The requested run is unavailable for this task/model. Choose a run or open an ATIF file.');}
    else if(runs.length)await loadRun();else status('No recorded trajectory connected for this task/model. Open an ATIF JSON file.');
  }
  function selectionChanged(){
    const next=panel.taskSelection;if(!next)return;selection=next;
    const nextKey=`${next.task}/${next.model}/${next.record?.id||''}`;
    if(nextKey!==key){if(key){localFileActive=false;waitingForLocal=false;currentRunID=null;const url=new URL(location.href);for(const param of ['step','trajectory_agent','trace_run','trace'])url.searchParams.delete(param);history.replaceState(null,'',url);}key=nextKey;++requestVersion;controller?.abort();clearTrace();runs=[];metadataLoaded=false;$('#trace-run-control').hidden=true;status('Choose a trajectory or open an ATIF JSON file.');}
    if(next.panel==='trajectory'&&!metadataLoaded)loadSources();
  }
  $('#trace-file').addEventListener('change',async event=>{
    const files=[...event.target.files],json=files.filter(file=>/\.json$/i.test(file.name));event.target.value='';
    if(!files.length)return;
    const version=++requestVersion;controller?.abort();clearTrace();metadataLoaded=true;honorDeepLink=false;runPlaceholder('Reading local file…');
    localFileActive=true;waitingForLocal=false;currentRunID=null;const url=new URL(location.href);url.searchParams.set('trace','local');url.searchParams.delete('trace_run');url.searchParams.delete('step');url.searchParams.delete('trajectory_agent');history.replaceState(null,'',url);
    try{
      if(json.length!==1)throw Error('Choose exactly one ATIF JSON file, optionally with its images or audio.');
      if(files.reduce((sum,file)=>sum+file.size,0)>LIMIT)throw Error('Selected files exceed the 64 MB limit.');
      status('Reading local ATIF file…');const data=JSON.parse(await json[0].text());if(version!==requestVersion)return;
      install(data,`Local file · ${json[0].name} · not linked to a benchmark result`,files);runPlaceholder(`Local file · ${json[0].name}`);
    }catch(error){if(version===requestVersion){clearTrace();runPlaceholder('Choose a recorded run');status(error.message);}}
  });
  $('#trace-run').addEventListener('change',loadRun);
  $('#trace-document').addEventListener('change',event=>selectDocument(event.target.value));
  $('#trace-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>filterSteps(),150);});
  $('#trace-filter').addEventListener('change',()=>filterSteps());
  $('#trace-previous').addEventListener('click',()=>showStep(active-1));$('#trace-next').addEventListener('click',()=>showStep(active+1));
  $('#trace-step-number').addEventListener('change',event=>{
    if(!current)return;const requested=Number(event.target.value);
    if(!Number.isInteger(requested)||requested<1||requested>current.data.steps.length){showStep(active);return;}
    $('#trace-search').value='';$('#trace-filter').value='all';filterSteps(requested-1);
  });
  $('#trace-step-list').addEventListener('keydown',async event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();await showStep(active+(event.key==='ArrowDown'?1:-1));$('#trace-step-list [aria-current="step"]')?.focus({preventScroll:true});});
  panel.addEventListener('task-selection',selectionChanged);selectionChanged();
  addEventListener('pagehide',clearAssets);
})();
