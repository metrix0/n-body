import { initialState, maxError, stats } from './kernel.js';
import { Pool } from './pool.js';
import { Universe } from './visual.js';
const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const integer=v=>Number(v).toLocaleString('pt-BR');
const seqView=new Universe($('canvas-seq'));
const parView=new Universe($('canvas-par'),true);
let seqState,parState,seqPool,parPool,running=false,busy=false,epoch=0,steps=0;
let liveSamples=[];
let activePools=[],nativeData=null,localResult=null;
const hardware=navigator.hardwareConcurrency||2;
$('workers').value=String(Math.min(4,hardware>=4?4:hardware>=2?2:1));
$('workers').title=hardware+' processadores lógicos informados pelo navegador; este valor não garante núcleos exclusivos.';
function status(message,error=false){$('browser-status').textContent=message;$('browser-status').classList.toggle('error',error);}
function lock(value){for(const id of ['bodies','workers','play','reset','benchmark'])$(id).disabled=value;$('cancel').hidden=!value;}
function stop(){
  running=false;epoch++;
  seqPool?.close();parPool?.close();seqPool=parPool=null;
  $('play').textContent='Iniciar simulação ↗';
}
function reset(){
  stop();steps=0;liveSamples=[];
  $('current-speedup').textContent='—×';
  seqView.zoom=parView.zoom=1;
  $('canvas-seq').dataset.zoom=$('canvas-par').dataset.zoom='1';
  seqState=initialState(Number($('bodies').value));parState=seqState.slice();
  seqView.set(seqState);parView.set(parState,Number($('workers').value));
  $('seq-steps').textContent=$('par-steps').textContent='0';
  $('seq-time').textContent=$('par-time').textContent='— ms';
  $('live-equality').textContent='Estados iniciais iguais';
  $('par-engine').textContent=$('workers').value+' WORKERS';
}
async function frame(token){
  if(!running||epoch!==token)return;
  try{
    const measure=async(pool,state)=>{
      const start=performance.now();const out=await pool.step(state);
      return {out,ms:performance.now()-start};
    };
    let a,b;
    if(steps%2){b=await measure(parPool,parState);a=await measure(seqPool,seqState);}
    else{a=await measure(seqPool,seqState);b=await measure(parPool,parState);}
    if(!running||epoch!==token)return;
    seqState=a.out;parState=b.out;steps++;
    liveSamples.push([a.ms,b.ms]);
    if(liveSamples.length>20)liveSamples.shift();
    if(liveSamples.length>1){
      const totals=liveSamples.slice(1).reduce((sum,pair)=>[sum[0]+pair[0],sum[1]+pair[1]],[0,0]);
      $('current-speedup').textContent=fmt(totals[0]/totals[1])+'×';
    }
    seqView.set(seqState);parView.set(parState);
    $('seq-time').textContent=fmt(a.ms,1)+' ms';$('par-time').textContent=fmt(b.ms,1)+' ms';
    $('seq-steps').textContent=$('par-steps').textContent=integer(steps);
    const error=maxError(seqState,parState);
    $('live-equality').textContent=error===0?'✓ Resultados idênticos':'Erro máximo: '+error.toExponential(2);
    if(error!==0)throw new Error('As duas simulações divergiram. Reinicie para comparar novamente.');
    if(steps>=300){stop();status('300 passos concluídos com estados idênticos. Reinicie para outro experimento.');return;}
    requestAnimationFrame(()=>frame(token));
  }catch(error){
    if(epoch!==token)return;
    stop();status(error.message,true);
  }
}
$('play').addEventListener('click',()=>{
  if(running){stop();return;}
  if(!window.Worker){status('Este navegador não oferece suporte a Web Workers.',true);return;}
  running=true;const token=++epoch;
  seqPool=new Pool(1);parPool=new Pool(Number($('workers').value));
  $('play').textContent='Pausar simulação Ⅱ';
  status('Simulação em execução.');
  frame(token);
});
for(const id of ['bodies','workers'])$(id).addEventListener('change',reset);
$('reset').addEventListener('click',reset);
for(const [id,three] of [['view3d',true],['view2d',false]])$(id).addEventListener('click',()=>{
  seqView.three=parView.three=three;
  $('view3d').classList.toggle('selected',three);$('view2d').classList.toggle('selected',!three);
  $('view3d').setAttribute('aria-pressed',String(three));$('view2d').setAttribute('aria-pressed',String(!three));
  seqView.draw();parView.draw();
});
for(const [id,other] of [['canvas-seq',parView],['canvas-par',seqView]])$(id).addEventListener('zoom',({detail})=>{
  other.zoom=detail;other.canvas.dataset.zoom=String(detail);other.draw();
});
for(const [id,other] of [['canvas-seq',parView],['canvas-par',seqView]])$(id).addEventListener('orbit',({detail})=>{
  other.yaw=detail.yaw;other.pitch=detail.pitch;seqView.draw();parView.draw();
});
$('cancel').addEventListener('click',()=>{
  epoch++;for(const pool of activePools)pool.close();activePools=[];
  status('Medição cancelada. Nenhum resultado parcial foi publicado.');
});
$('benchmark').addEventListener('click',async()=>{
  if(busy)return;
  stop();busy=true;lock(true);$('browser-results').hidden=true;
  const token=++epoch,n=Number($('bodies').value),p=Number($('workers').value),repeats=5,iterations=10;
  const source=initialState(n),pools=[new Pool(1),new Pool(p)];
  activePools=pools;
  const samples=[[],[]];
  let worstError=0;
  try{
    const once=async(index)=>{
      let state=source.slice();const start=performance.now();
      for(let i=0;i<iterations;i++){if(epoch!==token)throw new Error('cancelled');state=await pools[index].step(state);}
      return {state,ms:performance.now()-start};
    };
    status('Aquecendo os workers…');
    await once(0);await once(1);
    let final;
    for(let trial=0;trial<repeats;trial++){
      status('Repetição '+(trial+1)+' de '+repeats+' · '+integer(n)+' corpos · '+iterations+' passos…');
      const result=[];
      for(const index of trial%2?[1,0]:[0,1]){result[index]=await once(index);samples[index].push(result[index].ms);}
      const error=maxError(result[0].state,result[1].state);
      if(error!==0)throw new Error('A validação encontrou estados diferentes; resultado descartado.');
      worstError=Math.max(worstError,error);final=result;
    }
    if(epoch!==token)return;
    const seq=stats(samples[0]),par=stats(samples[1]),speedup=seq.mean/par.mean;
    localResult={engine:'JavaScript Web Workers (não OpenMP)',generated_at:new Date().toISOString(),n,workers:p,logical_cpus:hardware,steps:iterations,repeats,seq,parallel:par,speedup,efficiency:speedup/p,max_error:worstError,samples:{sequential:samples[0],parallel:samples[1]},timing:'Elapsed per 10 steps; includes worker communication, excludes worker creation, after warmup.',user_agent:navigator.userAgent};
    seqState=final[0].state;parState=final[1].state;steps=iterations;
    seqView.set(seqState);parView.set(parState,p);
    $('seq-steps').textContent=$('par-steps').textContent=String(steps);
    $('seq-time').textContent=fmt(seq.mean/iterations,1)+' ms';$('par-time').textContent=fmt(par.mean/iterations,1)+' ms';
    $('live-equality').textContent='✓ Resultados idênticos';
    $('current-speedup').textContent=fmt(speedup)+'×';
    const root=$('browser-results');root.replaceChildren();root.hidden=false;
    for(const [label,value] of [['Sequencial · média ± desvio',fmt(seq.mean)+' ± '+fmt(seq.stddev)+' ms'],['Paralelo · média ± desvio',fmt(par.mean)+' ± '+fmt(par.stddev)+' ms'],['Speedup',fmt(speedup)+'×'],['Eficiência',fmt(100*speedup/p,1)+'%']]){
      const cell=document.createElement('div'),name=document.createElement('span'),v=document.createElement('strong');name.textContent=label;v.textContent=value;cell.append(name,v);root.append(cell);
    }
    const detail=document.createElement('p');
    detail.textContent=(speedup>1?'O paralelo reduziu o tempo médio em '+fmt((1-1/speedup)*100,1)+'%.':'O sequencial foi mais rápido nesta configuração; comunicação e sincronização também têm custo.')+' Estados finais idênticos nas cinco repetições. ';
    const download=document.createElement('button');download.className='secondary';download.textContent='Exportar JSON ↓';download.id='download-local';
    download.addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(localResult,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='n-body-browser-benchmark.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    detail.append(download);root.append(detail);
    status('Medição concluída: cinco repetições válidas.');
  }catch(error){if(epoch===token)status(error.message,true);}
  finally{for(const pool of pools)pool.close();activePools=[];busy=false;lock(false);}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(running)stop();
    if(busy){epoch++;for(const pool of activePools)pool.close();status('Medição interrompida porque a aba ficou em segundo plano. Execute novamente com a aba visível.');}
  }
});
window.addEventListener('pagehide',()=>{stop();for(const pool of activePools)pool.close();});
reset();

const palette=['#7e9fff','#70e2bf','#e6b985','#c89aee'];
function make(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function renderTable(){
  const body=$('native-table');body.replaceChildren();
  const selected=$('table-size').value;
  for(const row of nativeData.rows.filter(r=>selected==='all'||r.n===Number(selected))){
    const tr=make('tr',undefined,row.mode==='sequential'?'baseline':'');
    const values=[integer(row.n),row.mode==='sequential'?'C sequencial':'C + OpenMP',String(row.threads),fmt(row.mean*1000,3)+' ± '+fmt(row.stddev*1000,3)+' ms',fmt(row.speedup)+'×',fmt(row.efficiency*100,1)+'%'];
    values.forEach((value,i)=>{const td=make('td',value);if(i===2&&row.oversubscribed){const tag=make('span','*','oversub');tag.title='Mais threads que CPUs disponíveis';td.append(tag);}tr.append(td);});
    body.append(tr);
  }
}
function renderChart(){
  const metric=$('chart-metric').value,root=$('chart');
  root.classList.remove('chart-empty');root.replaceChildren();
  const ns=[...new Set(nativeData.rows.map(r=>r.n))],ps=[...new Set(nativeData.rows.filter(r=>r.mode==='openmp').map(r=>r.threads))].sort((a,b)=>a-b);
  const rows=nativeData.rows.filter(r=>r.mode==='openmp');
  const value=r=>metric==='mean'?r.mean:metric==='efficiency'?r.efficiency*100:r.speedup;
  const maximum=Math.max(...rows.map(value),metric==='speedup'?1:0)*1.15;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 680 270');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Gráfico de '+$('chart-metric').selectedOptions[0].textContent+' por número de threads; valores exatos na tabela abaixo');
  function element(tag,attrs,text){const node=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;svg.append(node);return node;}
  const x=p=>55+ps.indexOf(p)*595/Math.max(1,ps.length-1),y=v=>220-v/maximum*190;
  for(let i=0;i<5;i++){const v=i/4*maximum;element('line',{x1:55,x2:650,y1:y(v),y2:y(v),stroke:'#253248','stroke-width':.7});element('text',{x:45,y:y(v)+4,fill:'#758ba9','font-size':10,'text-anchor':'end'},fmt(v,metric==='mean'?2:1));}
  for(const p of ps)element('text',{x:x(p),y:242,fill:'#8d9db6','font-size':10,'text-anchor':'middle'},p);
  element('text',{x:350,y:264,fill:'#6f82a0','font-size':9,'text-anchor':'middle'},'THREADS');
  if(metric==='speedup')element('line',{x1:55,x2:650,y1:y(1),y2:y(1),stroke:'#b6c5df','stroke-dasharray':'4 4',opacity:.4});
  ns.forEach((n,index)=>{
    const series=rows.filter(r=>r.n===n).sort((a,b)=>a.threads-b.threads),color=palette[index%palette.length];
    element('polyline',{points:series.map(r=>x(r.threads)+','+y(value(r))).join(' '),fill:'none',stroke:color,'stroke-width':2});
    for(const row of series){
      const c=element('circle',{cx:x(row.threads),cy:y(value(row)),r:3.8,fill:color});
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent='N='+n+', p='+row.threads+': '+fmt(value(row),3);c.append(title);
    }
  });
  let chartZoom=1,originX=0,originY=0;
  svg.addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=svg.getBoundingClientRect(),old=chartZoom;
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect.height:1);
    chartZoom=Math.max(1,Math.min(8,old*Math.exp(-delta*0.002)));
    const px=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    const py=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    originX=Math.max(0,Math.min(680-680/chartZoom,originX+px*(680/old-680/chartZoom)));
    originY=Math.max(0,Math.min(270-270/chartZoom,originY+py*(270/old-270/chartZoom)));
    svg.setAttribute('viewBox',[originX,originY,680/chartZoom,270/chartZoom].join(' '));
  },{passive:false});
  root.append(svg);$('chart-legend').replaceChildren();
  ns.forEach((n,i)=>{const item=make('span'),dot=make('i');dot.style.backgroundColor=palette[i%palette.length];item.append(dot,document.createTextNode('N = '+integer(n)));$('chart-legend').append(item);});
}
$('chart-metric').addEventListener('change',()=>{if(nativeData)renderChart();});
$('table-size').addEventListener('change',()=>{if(nativeData)renderTable();});
async function loadNative(){
  try{
    const [response,validationResponse]=await Promise.all([fetch('./data/benchmark.json'),fetch('./data/validation.json')]);
    if(!response.ok||!validationResponse.ok)throw new Error('Dados ainda indisponíveis.');
    const data=await response.json(),validation=await validationResponse.json();
    if(data.schema!==1||!Array.isArray(data.rows)||data.rows.length===0||data.rows.some(r=>!Number.isFinite(r.mean)||r.mean<=0||r.repeats<5))throw new Error('Dados de benchmark inválidos.');
    nativeData=data;
    const best=data.rows.filter(r=>r.mode==='openmp').reduce((a,b)=>a.speedup>b.speedup?a:b);
    const baseline=data.rows.find(r=>r.mode==='sequential'&&r.n===best.n);
    $('best-speedup').textContent=fmt(best.speedup)+'×';
    $('best-detail').textContent=integer(best.n)+' corpos · '+best.threads+' threads';
    $('time-saved').textContent=fmt((1-1/best.speedup)*100,1)+'%';
    $('saved-detail').textContent=fmt(baseline.mean*1000,1)+' → '+fmt(best.mean*1000,1)+' ms';
    $('native-validation').textContent=validation.reference==='byte-for-byte'?'Idêntico':'Conferido';
    $('validation-detail').textContent=validation.passed+' verificações automatizadas';
    $('native-repeats').textContent=String(data.methodology.repeats);
    $('native-status').textContent='Medições reais · '+data.environment.cpu+' · '+data.environment.affinity_cpus+' CPUs lógicas disponíveis · runner compartilhado. * indica mais threads que CPUs disponíveis.';
    for(const n of [...new Set(data.rows.map(r=>r.n))]){const option=make('option',integer(n)+' corpos');option.value=String(n);$('table-size').append(option);}
    renderTable();renderChart();
    const dl=make('dl');
    for(const [key,value] of [['CPU',data.environment.cpu],['CPUs / afinidade',data.environment.logical_cpus+' / '+data.environment.affinity_cpus],['Quota de CPU',data.environment.cpu_quota??'Não informada'],['Memória',data.environment.memory],['Sistema',data.environment.os],['Compilador',data.environment.compiler],['Flags',data.environment.flags],['Afinidade OpenMP',JSON.stringify(data.environment.binding)],['Commit medido',data.source_commit],['Data',new Date(data.generated_at).toLocaleString('pt-BR')],['Validação',data.methodology.validation]]){
      dl.append(make('dt',key),make('dd',String(value)));
    }
    $('environment').replaceChildren(dl);
    const note=make('p','Tempos do kernel, sem leitura/escrita e alocação. As configurações OpenMP incluem criação da equipe e sincronização. Arquivos brutos, dispersão e casos sem ganho permanecem publicados.');
    $('environment').append(note);
  }catch(error){$('native-status').textContent='Benchmarks nativos indisponíveis nesta versão. A simulação e a medição do navegador continuam disponíveis. Consulte o relatório no repositório.';}
}
loadNative();
