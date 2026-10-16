/* Task browser: small catalog, one selected context, two demand-loaded sites. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
  const taskPicker=$('#task-picker'),modelPicker=$('#model-picker'),contextPicker=$('#context-picker');
  let catalog,selection,version=0,controller,frames=[],observers=[],timers=[],serviceAvailable=null,traceBase=null;
  let panel=params.get('panel')==='trajectory'?'trajectory':'website',mode=params.get('mode')||'interactive',previewNote='',mirroredRoutes=[];
  const client=crypto.randomUUID().replaceAll('-','');
  const chosenContexts=new Map();
  const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
  const contextLabel=value=>/[\u3400-\u9fff]/.test(value||'')?'Context not recorded':String(value||'Context not recorded').replace(/1m/i,'1M').replace(/(\d)k/i,'$1K').replace(/-(max|xhigh)$/,' · $1');
  const message=text=>{$('#preview-status').textContent=text;};
  const pause=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  function serviceURL(value){
    try{const url=new URL(value,location.href);
      if(url.origin===location.origin&&/^\/__live\/[\w-]+\/$/.test(url.pathname))return {origin:'null',native:false};
      if(url.protocol===location.protocol&&url.port===location.port&&/^[a-f0-9]{48}\.localhost$/.test(url.hostname)&&url.pathname==='/'&&!url.search&&!url.hash)return {origin:url.origin,native:true};
    }catch(_){}return null;
  }
  const send=(entry,data)=>entry.frame.contentWindow?.postMessage(data,entry.origin==='null'?'*':entry.origin);
  function api(operation,values={}) {return `/_preview_runtime/${operation}?${new URLSearchParams({...values,origin:location.origin})}`;}
  function updateURL(){
    if(!selection)return;const url=new URL(location.href);
    url.searchParams.set('task',selection.task);url.searchParams.set('model',selection.model);
    if(selection.record)url.searchParams.set('context',selection.record.id);else url.searchParams.delete('context');
    if(panel==='trajectory')url.searchParams.set('panel','trajectory');else url.searchParams.delete('panel');
    if(mode==='screenshot')url.searchParams.set('mode',mode);else url.searchParams.delete('mode');
    const path=$('#comparison-route').value;if(path&&path!=='/')url.searchParams.set('path',path);else url.searchParams.delete('path');url.searchParams.delete('state');
    history.replaceState(null,'',url);document.title=`${selection.taskName} · WebsiteBench`;
  }
  function clearFrames(){
    observers.forEach(o=>o.disconnect());observers=[];timers.forEach(clearTimeout);timers=[];frames=[];
    for(const side of ['reference','candidate']){$(`#${side}-preview`).replaceChildren();$(`#${side}-preview`).classList.remove('is-live','replay-unavailable');$(`#${side}-preview`).style.height='';$(`#${side}-live-link`).hidden=true;}
  }
  function setPanel(value){
    panel=value;$('#task-website').hidden=panel!=='website';$('#trajectory-panel').hidden=panel!=='trajectory';$('#preview-status').hidden=panel==='trajectory';
    document.querySelectorAll('[data-task-panel]').forEach(b=>{const active=b.dataset.taskPanel===panel;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    if(selection){const target=$('#trajectory-panel');target.taskSelection={...selection,panel};target.dispatchEvent(new CustomEvent('task-selection'));}
    updateURL();
    if(panel==='trajectory'){controller?.abort();clearFrames();}
    else if(selection&&!frames.length)showComparison();
  }
  function empty(text,canStart=false){
    $('.comparison-stage').hidden=true;$('#comparison-empty').hidden=false;$('#comparison-empty-message').textContent=text;
    $('#start-preview').hidden=!canStart;$('#open-task-trace').hidden=!selection?.record;
  }
  function installFrame(role,prefix,path,fallback){
    const target=$(`#${role}-preview`),frame=document.createElement('iframe');
    frame.title=`${selection.taskName} · ${role==='reference'?'Reference':selection.modelName}`;
    const transport=serviceURL(prefix);frame.sandbox='allow-scripts allow-forms'+(transport.native?' allow-same-origin':'');frame.referrerPolicy='no-referrer';
    frame.style.width='1440px';frame.style.height='800px';target.classList.add('is-live');target.setAttribute('aria-busy','true');
    const entry={frame,role,prefix,path,ready:false,origin:transport.origin};frames.push(entry);
    const resize=()=>{const scale=target.clientWidth/1440;frame.style.transform=`scale(${scale})`;target.style.height=`${800*scale}px`;};
    const observer=new ResizeObserver(resize);observer.observe(target);observers.push(observer);
    target.appendChild(frame);frame.src=prefix+path.replace(/^\//,'');resize();
    const link=$(`#${role}-live-link`);link.href=frame.src;link.hidden=false;
    const timeout=setTimeout(()=>{if(frames.includes(entry)&&!entry.ready)message('This website has not responded. Reset to retry, or inspect its trajectory.');},25000);timers.push(timeout);
    if(transport.native&&serviceURL(fallback)?.native===false){
      const compatibility=setTimeout(()=>{if(!frames.includes(entry)||entry.ready)return;entry.origin='null';entry.prefix=fallback;frame.sandbox='allow-scripts allow-forms';frame.src=fallback+entry.path.replace(/^\//,'');link.href=frame.src;},8000);timers.push(compatibility);
    }
  }
  addEventListener('message',event=>{
    const entry=frames.find(f=>f.frame.contentWindow===event.source),data=event.data;
    if(!entry||event.origin!==entry.origin||data?.role!==entry.role)return;
    if(data.type==='websitebench-live-scroll'&&$('#sync-scroll').checked&&Number.isFinite(data.x)&&Number.isFinite(data.y)){
      for(const other of frames)if(other!==entry)send(other,{type:'websitebench-set-scroll',x:data.x,y:data.y,pointX:data.pointX,pointY:data.pointY,nested:Boolean(data.nested)});
    }
    if(data.type!=='websitebench-live-route'||typeof data.path!=='string'||!/^\/(?!\/)/.test(data.path)||data.path.includes('\\')||data.path.length>2000)return;
    const changed=entry.path!==data.path;entry.path=data.path;entry.status=Number.isInteger(data.status)?data.status:200;entry.ready=true;entry.frame.parentElement.setAttribute('aria-busy','false');
    $(`#${entry.role}-live-link`).href=entry.prefix+data.path.replace(/^\//,'');
    if(changed&&$('#sync-navigation').checked&&!entry.mirroring){
      mirroredRoutes=mirroredRoutes.filter(t=>performance.now()-t<2000);
      if(mirroredRoutes.length>5){$('#sync-navigation').checked=false;previewNote='Navigation paths differ. Synchronization paused.';}
      else for(const other of frames)if(other!==entry&&other.path!==data.path){other.path=data.path;other.mirroring=true;mirroredRoutes.push(performance.now());send(other,{type:'websitebench-navigate',path:data.path});}
    }
    entry.mirroring=false;
    const ready=frames.every(f=>f.ready),errors=frames.filter(f=>f.status>=400).map(f=>`${f.role} HTTP ${f.status}`).join(' · ');message(ready?[(previewNote||`Interactive · ${frames.map(f=>f.path).every(p=>p===entry.path)?entry.path:frames.map(f=>`${f.role}: ${f.path}`).join(' · ')}`),errors].filter(Boolean).join(' · '):'Loading websites…');
    if(ready&&frames.every(f=>f.path===entry.path)){$('#comparison-route').value=entry.path;updateURL();}
  });
  function screenshots(){
    document.querySelectorAll('[data-preview-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewMode==='screenshot')));
    clearFrames();const task=catalog.tasks.find(t=>t.id===selection.task),view=task.views?.find(v=>v.id===$('#state-picker').value)||task.views?.[0];
    const media=view?.models?.[selection.model];
    // Only use the screenshot if it is bound to this exact archived context.
    const matches=selection.task==='medium'&&selection.model==='qwen'&&selection.record?.context==='200k-max';
    if(!view?.reference||!media||!matches){empty('No matching screenshots for this recorded context.',Boolean(selection.record?.code));return;}
    $('#comparison-empty').hidden=true;$('.comparison-stage').hidden=false;
    for(const [role,image] of [['reference',view.reference],['candidate',media]]){
      const img=document.createElement('img');img.src=image.image;img.alt=`${selection.taskName} · ${role} · ${view.label}`;img.loading='lazy';img.width=view.viewport.width;img.height=view.viewport.height;
      img.addEventListener('error',()=>message('The recorded screenshot is unavailable.'));
      $(`#${role}-preview`).appendChild(img);
    }
    message('Recorded screenshots · 200K context');
  }
  async function showComparison(reset=false){
    controller?.abort();controller=new AbortController();const signal=controller.signal,captured=version;
    clearFrames();previewNote='';$('#reset-preview').disabled=true;$('#state-control').hidden=true;$('#preview-mode-control').hidden=true;
    if(mode==='screenshot'){screenshots();return;}
    empty('Starting the archived websites…');message('Only the selected reference and model website are loaded.');
    try {
      let first=true,result;
      do{
        const response=await fetch(api('task-replay',{id:selection.record?.id||`reference-${selection.task}`,client,...(reset&&first?{reset:'1'}:{})}),{signal,cache:'no-store'});
        if(!response.ok)throw Error('The interactive service is not connected.');
        result=await response.json();serviceAvailable=true;first=false;
        if(captured!==version||panel!=='website')return;
        if(['preparing','busy'].includes(result.status)){$('#comparison-empty-message').textContent=result.message;await pause(1000,signal);}
      }while(['preparing','busy'].includes(result.status));
      if(!['ready','partial'].includes(result.status))throw Error(result.message||'This archived website could not be started.');
      if(!result.services?.reference||!Object.entries(result.services).every(([role,path])=>['reference','candidate'].includes(role)&&serviceURL(path)))throw Error('Invalid replay response.');
      $('#comparison-empty').hidden=true;$('.comparison-stage').hidden=false;$('#reset-preview').disabled=false;
      document.querySelectorAll('[data-preview-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewMode==='interactive')));
      const path=$('#comparison-route').value||'/';
      for(const role of ['reference','candidate']){
        if(result.services[role])installFrame(role,result.services[role],path,result.fallback_services?.[role]);
        else{const target=$(`#${role}-preview`),note=document.createElement('p');note.textContent=result.message||'This archived model website is unavailable.';target.classList.add('replay-unavailable');target.appendChild(note);
          if(selection.record){const link=document.createElement('button');link.type='button';link.className='text-link';link.textContent='View trajectory →';link.addEventListener('click',()=>setPanel('trajectory'));target.appendChild(link);}
          previewNote='Reference interactive · model replay unavailable';}
      }
      $('#reference-version').textContent=result.reference_revision?`Local snapshot · ${result.reference_revision}`:'Local reference snapshot';
      if(selection.task==='medium'&&selection.model==='qwen'&&selection.record.context==='200k-max')$('#preview-mode-control').hidden=false;
      message('Loading websites…');
    }catch(error){if(error.name==='AbortError'||captured!==version)return;serviceAvailable=false;
      if(selection.task==='medium'&&selection.model==='qwen'&&selection.record.context==='200k-max'){
        screenshots();$('#preview-mode-control').hidden=false;$('#state-control').hidden=false;message('Recorded screenshots · interactive service unavailable.');
      }else{empty(error.message,true);message('Trajectory browsing remains available.');}
    }
  }
  function chooseContext(preferred){
    const task=catalog.tasks.find(t=>t.id===taskPicker.value),model=catalog.models.find(m=>m.id===modelPicker.value);
    const runs=task.models[model.id]?.runs||[];
    contextPicker.replaceChildren(...runs.map(r=>option(r.id,contextLabel(r.context))));
    if(runs.some(r=>r.id===preferred))contextPicker.value=preferred;
    else if(runs.some(r=>r.id===chosenContexts.get(`${task.id}/${model.id}`)))contextPicker.value=chosenContexts.get(`${task.id}/${model.id}`);
    else if(selection?.record){const same=runs.find(r=>r.context===selection.record.context);if(same)contextPicker.value=same.id;}
    $('#context-control').hidden=runs.length<=1;
  }
  function render(changed=true){
    ++version;controller?.abort();clearFrames();
    const previousTask=selection?.task,previousView=$('#state-picker').value||params.get('state')||catalog.tasks.find(t=>t.id===taskPicker.value)?.views?.find(v=>v.route===params.get('path'))?.id;
    const task=catalog.tasks.find(t=>t.id===taskPicker.value),model=catalog.models.find(m=>m.id===modelPicker.value);
    if(!task||!model)return;
    const record=task.models[model.id]?.runs.find(r=>r.id===contextPicker.value)||null;
    selection={task:task.id,taskName:task.name,model:model.id,modelName:model.name,record,runID:record?.run_id||record?.id,traceBase};
    if(record)chosenContexts.set(`${task.id}/${model.id}`,record.id);
    $('#explorer-task-name').textContent=task.name;$('#explorer-task-position').textContent=`${catalog.tasks.indexOf(task)+1} / ${catalog.tasks.length}`;
    $('#candidate-model-name').textContent=model.name+(record?` · ${contextLabel(record.context)}`:'');
    $('#previous-task').disabled=catalog.tasks.indexOf(task)===0;$('#next-task').disabled=catalog.tasks.indexOf(task)===catalog.tasks.length-1;
    const summary=$('#task-record-summary');summary.replaceChildren();
    if(record){
      const text=document.createElement('span');text.textContent=`Recorded run · ${contextLabel(record.context)}`;summary.appendChild(text);
      const scores=[...new Set(record.scores.map(s=>s.value))];
      if(scores.length===1){const score=document.createElement('span');score.className='task-score';score.textContent=`Published: ${scores[0]} tests${record.score_note?' · '+record.score_note:''}`;score.title=record.scores.map(s=>`${s.source}!${s.cell} · ${s.context}`).join('\n')+(record.score_note?'\nThe published score is for a repaired candidate; this replay uses the archived unrepaired website.':'');summary.appendChild(score);}
      const source=document.createElement('a');source.href=record.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Source ↗';summary.appendChild(source);
      for(const [field,label] of [['website_artifact','Website code ↓'],['reference_artifact','Reference code ↓']]){
        const artifact=record[field];if(!artifact?.url)continue;
        const link=document.createElement('a');link.href=artifact.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;link.title=`Saved project · ${artifact.files} files · run ${artifact.selected_run}`;summary.appendChild(link);
      }
    }else summary.textContent='No recorded context available';
    $('#state-picker').replaceChildren(...(task.views||[]).map(v=>option(v.id,v.label)));
    if((!previousTask||previousTask===task.id)&&task.views?.some(v=>v.id===previousView))$('#state-picker').value=previousView;
    if(changed){if(previousTask!==task.id)$('#comparison-route').value='/';const url=new URL(location.href);for(const key of ['step','trace_run','trajectory_agent','trace','state'])url.searchParams.delete(key);history.replaceState(null,'',url);}
    setPanel(panel);
  }
  async function load(){
    try{
      const [response,configuration]=await Promise.all([fetch('data/task-materials.json'),fetch('data/viewer-config.json').then(r=>r.ok?r.json():{}).catch(()=>({}))]);if(!response.ok)throw Error('Task catalog unavailable.');catalog=await response.json();
      if(configuration.trace_base){const url=new URL(configuration.trace_base,location.href);if(url.protocol==='https:'||url.origin===location.origin)traceBase=url.href.replace(/\/?$/,'/');}
      taskPicker.replaceChildren(...catalog.tasks.map(t=>option(t.id,t.name)));
      modelPicker.replaceChildren(...catalog.models.map(m=>option(m.id,m.name)));
      taskPicker.value=catalog.tasks.some(t=>t.id===params.get('task'))?params.get('task'):'medium';
      const initialModel=params.get('model');modelPicker.value=catalog.models.some(m=>m.id===initialModel)?initialModel:'qwen';
      chooseContext(params.get('context'));
      // Preserve the already paired 200K example unless a context was specified.
      if(!params.get('context')&&taskPicker.value==='medium'&&modelPicker.value==='qwen'){
        const r=catalog.tasks.find(t=>t.id==='medium').models.qwen.runs.find(r=>r.context==='200k-max');if(r)contextPicker.value=r.id;
      }
      const initialTask=catalog.tasks.find(t=>t.id===taskPicker.value),initialPath=params.get('path')||initialTask.views?.find(v=>v.id===params.get('state'))?.route;
      if(initialPath&&/^\/(?!\/)/.test(initialPath)&&!initialPath.includes('\\')&&initialPath.length<1800)$('#comparison-route').value=initialPath;
      taskPicker.addEventListener('change',()=>{chooseContext();render();});modelPicker.addEventListener('change',()=>{chooseContext();render();});contextPicker.addEventListener('change',()=>render());
      render(false);
      if(initialModel&&!catalog.models.some(m=>m.id===initialModel)||params.get('context')&&selection.record?.id!==params.get('context')){
        const notice=$('#task-selection-notice');notice.hidden=false;notice.textContent='The requested model or recording is unavailable in this snapshot. The selectors show the current selection.';
        [taskPicker,modelPicker,contextPicker].forEach(picker=>picker.addEventListener('change',()=>{notice.hidden=true;}));
      }
    }catch(error){empty(error.message);taskPicker.disabled=modelPicker.disabled=true;}
  }
  document.querySelectorAll('[data-task-panel]').forEach((button,i)=>{
    button.addEventListener('click',()=>setPanel(button.dataset.taskPanel));
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...document.querySelectorAll('[data-task-panel]')];const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+1)%buttons.length;buttons[next].focus();buttons[next].click();});
  });
  $('#comparison-route-form').addEventListener('submit',event=>{event.preventDefault();const path=$('#comparison-route').value.trim();if(!/^\/(?!\/)/.test(path)||path.includes('\\')||path.length>1800){message('Enter a local page path, such as /about.');return;}for(const entry of frames){entry.mirroring=true;send(entry,{type:'websitebench-navigate',path});}});
  $('#comparison-layout').value=params.get('layout')==='side'?'side':'stacked';
  function layout(){const value=$('#comparison-layout').value;$('.comparison-stage').dataset.layout=value;const url=new URL(location.href);if(value==='side')url.searchParams.set('layout',value);else url.searchParams.delete('layout');history.replaceState(null,'',url);}
  $('#comparison-layout').addEventListener('change',layout);layout();
  $('#reset-preview').addEventListener('click',()=>showComparison(true));$('#start-preview').addEventListener('click',()=>{mode='interactive';updateURL();showComparison(true);});
  $('#open-task-trace').addEventListener('click',()=>setPanel('trajectory'));
  document.querySelectorAll('[data-preview-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.previewMode;document.querySelectorAll('[data-preview-mode]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));updateURL();showComparison();}));
  $('#state-picker').addEventListener('change',()=>{const view=catalog.tasks.find(t=>t.id===selection.task).views.find(v=>v.id===$('#state-picker').value);if(view)$('#comparison-route').value=view.route;updateURL();screenshots();});
  for(const [id,delta] of [['previous-task',-1],['next-task',1]])$(`#${id}`).addEventListener('click',()=>{taskPicker.selectedIndex+=delta;chooseContext();render();});
  let checkingConnection=false;
  async function keepAlive(){
    if(checkingConnection||document.hidden||panel!=='website'||!frames.length||!selection)return;
    checkingConnection=true;const own=version;
    try{const response=await fetch(api('task-replay',{id:selection.record?.id||`reference-${selection.task}`,client}),{cache:'no-store'});
      if(!response.ok)return;const result=await response.json();if(own!==version||panel!=='website')return;
      if(['preparing','busy'].includes(result.status)||frames.some(entry=>![result.services?.[entry.role],result.fallback_services?.[entry.role]].includes(entry.prefix)))showComparison();
    }catch(_){}finally{checkingConnection=false;}
  }
  const heartbeat=setInterval(keepAlive,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)keepAlive();});
  addEventListener('pagehide',()=>{clearInterval(heartbeat);controller?.abort();clearFrames();});
  load();
})();
