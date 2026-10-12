import {emptyLibrary,validateLibrary,normalize,unplayed,sorted,needsPrediction,addGames,rateGame,createRequest,importPredictions,parseJSON,markdown,randomGame} from './core.mjs';
const $=id=>document.getElementById(id), KEY='proximo-jogo.library.v1';
let data=emptyLibrary(), raw=null, view='backlog', page=0, shown=[], toastTimer, fatal=false;
const PAGE_SIZE=30;
const promptPreview=document.createElement('details');promptPreview.hidden=true;promptPreview.innerHTML='<summary>Ver ou copiar o pedido exportado</summary><label for="prompt-preview">Pedido completo para o ChatGPT</label><textarea id="prompt-preview" rows="8" readonly></textarea>';$('request-status').after(promptPreview);
function toast(message,error=false) { const el=$('toast'); (document.querySelector('dialog[open]')||document.body).append(el);el.textContent=message;el.className=error?'error':'';el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,error?14000:6500); }
const guard=fn=>async event=>{try{await fn(event);}catch(error){toast(error.message||'Não foi possível concluir. Seus dados anteriores foram preservados.',true);}};
function download(name,text,type='application/json') { const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000); }
function dialog(id) { $('toast').hidden=true;$(id).showModal(); }
function close(id) { if($('toast').parentElement===$(id))document.body.append($('toast'));$(id).close(); }
for(const el of document.querySelectorAll('[data-close]')) el.onclick=()=>close(el.closest('dialog').id);
for(const el of document.querySelectorAll('dialog')) el.addEventListener('close',()=>{if($('toast').parentElement===el)document.body.append($('toast'));});
try {
  raw=localStorage.getItem(KEY); if(raw) data=validateLibrary(JSON.parse(raw));
  localStorage.removeItem('proximo-jogo.google.v1');
} catch(error) { fatal=true;toast('Não foi possível ler seus dados locais. Eles não foram apagados. Exporte o backup para recuperação antes de importar uma biblioteca válida.',true); }
async function commit(transform,{allowRecovery=false}={}) {
  if(fatal&&!allowRecovery)throw new Error('Os dados locais precisam ser recuperados. Use Dados & backup.');
  const operation=async()=>{
    const current=localStorage.getItem(KEY);
    if(current!==raw) {raw=current;data=current?validateLibrary(JSON.parse(current)):emptyLibrary();render();throw new Error('Outra aba alterou a biblioteca. Os dados foram recarregados; repita sua ação.');}
    const next=transform(structuredClone(data));next.revision=Math.max(data.revision,next.revision)+1;validateLibrary(next);
    const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);raw=serialized;data=next;fatal=false;
    render();
  };
  if(navigator.locks)await navigator.locks.request(KEY,operation);else await operation();
}
window.addEventListener('storage',event=>{if(event.key===KEY && event.newValue!==raw){try{data=event.newValue?validateLibrary(JSON.parse(event.newValue)):emptyLibrary();raw=event.newValue;render();toast('Biblioteca atualizada em outra aba.');}catch{fatal=true;toast('Outra aba gravou dados inválidos. Edições foram pausadas.',true);}}});
function render() {
  const backlog=unplayed(data), rated=data.games.filter(g=>g.rating!==null);
  $('stat-backlog').textContent=backlog.length.toLocaleString('pt-BR');$('stat-rated').textContent=rated.length.toLocaleString('pt-BR');
  $('stat-top').textContent=backlog.filter(g=>(g.prediction?.score??-1)>=90).length.toLocaleString('pt-BR');$('stat-pending').textContent=backlog.filter(g=>needsPrediction(data,g)).length.toLocaleString('pt-BR');
  $('welcome').hidden=data.games.length>0;
  const search=normalize($('search').value), min=Number($('min-score').value);
  const pool=view==='rated'?rated:view==='pending'?backlog.filter(g=>needsPrediction(data,g)):backlog;
  shown=sorted(pool.filter(g=>normalize(g.title).includes(search) && (!min || (g.prediction?.score??-1)>=min)));
  if(view==='rated')shown.sort((a,b)=>b.rating-a.rating||a.title.localeCompare(b.title,'pt-BR'));
  page=Math.min(page,Math.max(0,Math.ceil(shown.length/PAGE_SIZE)-1));
  $('games').replaceChildren();
  for(const game of shown.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)) {
    const tr=document.createElement('tr');
    const score=game.rating!==null&&view==='rated'?game.rating:game.prediction?.score;
    const badge=document.createElement('span');badge.className=`score ${score==null?'unknown':score>=90?'':score>=70?'mid':'low'}`;badge.textContent=score??'—';badge.title=view==='rated'?'Sua nota':'Estimativa de afinidade';
    const title=document.createElement('button');title.className='game-title';title.textContent=game.title;title.onclick=()=>showDetail(game,false);
    const status=document.createElement('span');status.className='status-label';
    if(game.rating!==null){status.textContent=`Sua nota: ${game.rating}/100`;}
    else if(!game.prediction){status.textContent='Sem previsão';status.classList.add('stale');}
    else if(needsPrediction(data,game)){status.textContent='Recalibração pendente';status.classList.add('stale');}
    else if(game.prediction.score===null){status.textContent='Identificação incerta';}
    else {status.textContent='Na sua fila';}
    const action=document.createElement('button');action.className='row-action';action.textContent=game.rating===null?'Avaliar ↗':'Editar nota';action.setAttribute('aria-label',`${game.rating===null?'Avaliar':'Editar nota de'} ${game.title}`);action.onclick=()=>openRating(game);
    for(const child of [badge,title,status,action]){const td=document.createElement('td');td.append(child);tr.append(td);}$('games').append(tr);
  }
  $('empty').hidden=shown.length>0;
  $('list-summary').textContent=`${shown.length.toLocaleString('pt-BR')} ${view==='rated'?'avaliações · maiores notas pessoais primeiro':'entradas · maior prioridade primeiro'}${view!=='rated'?' · previsões não são garantias':''}`;
  $('page-label').textContent=`Página ${page+1} de ${Math.max(1,Math.ceil(shown.length/PAGE_SIZE))}`;$('previous').disabled=page===0;$('next').disabled=(page+1)*PAGE_SIZE>=shown.length;
  $('random-button').disabled=backlog.length===0;
  const requests=data.requests.filter(r=>r.profileVersion===data.profileVersion);
  $('request-status').textContent=`${requests.length} pedidos em andamento · ${requests.reduce((n,r)=>n+r.ids.length,0)} jogos aguardando resposta.`;
  $('local-status').textContent=fatal?'Armazenamento precisa de recuperação. Abra Dados & backup.':'Salvo neste navegador · faça backups para guardar suas avaliações.';
}
function openRating(game) { $('rating-id').value=game.id;$('rating-game').textContent=game.title;$('rating-score').value=game.rating??'';$('rating-comment').value=game.comment;dialog('rating-dialog'); }
function showDetail(game,random) {
  $('detail-title').textContent=random?'O acaso escolheu':'Sobre esta escolha';$('detail-label').textContent=random?'SORTEIO UNIFORME · FILTROS ATUAIS':'PREVISÃO DE PREFERÊNCIA';
  $('detail-game').textContent=game.title;$('detail-score').textContent=game.prediction?.score==null?'Sem estimativa':`${game.prediction.score} / 100`;
  $('detail-reason').textContent=game.prediction?.reason||'Ainda não há uma justificativa. Exporte um pedido para o ChatGPT avaliar este jogo.';
  $('detail-confidence').textContent=`Confiança: ${game.prediction?.confidence||'não informada'}.${needsPrediction(data,game)?' Previsão pendente ou baseada em avaliações anteriores.':''}${game.rating!==null?' Sua nota: '+game.rating+'/100. '+game.comment:''}`;
  $('detail-sources').replaceChildren();for(const url of game.prediction?.sources||[]){if(!/^https?:\/\//.test(url))continue;const li=document.createElement('li'),a=document.createElement('a');a.textContent=url;a.href=url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);$('detail-sources').append(li);}
  $('detail-rate').onclick=()=>{close('detail-dialog');openRating(game);};$('detail-random').hidden=!random;if(!$('detail-dialog').open)dialog('detail-dialog');
}
function draw() { const min=Number($('min-score').value),search=normalize($('search').value);const pool=unplayed(data).filter(g=>normalize(g.title).includes(search)&&(!min||(g.prediction?.score??-1)>=min)&&(view!=='pending'||needsPrediction(data,g)));const game=randomGame(pool);if(!game)throw new Error('Nenhum jogo não avaliado atende aos filtros atuais.');showDetail(game,true); }
function openSettings() {dialog('settings-dialog');}
$('add-button').onclick=()=>dialog('add-dialog');$('ai-button').onclick=()=>dialog('ai-dialog');$('settings-button').onclick=openSettings;
$('profile-button').onclick=()=>{$('profile-text').value=data.profile;dialog('profile-dialog');};
$('random-button').onclick=guard(draw);$('detail-random').onclick=guard(draw);
$('add-form').onsubmit=guard(async event=>{event.preventDefault();let result;await commit(current=>{result=addGames(current,$('new-titles').value);return result.data;});close('add-dialog');$('new-titles').value='';toast(`${result.added} jogos adicionados. ${result.duplicates} títulos já existentes ignorados.`);});
$('rating-form').onsubmit=guard(async event=>{event.preventDefault();await commit(current=>rateGame(current,$('rating-id').value,Number($('rating-score').value),$('rating-comment').value.trim()));close('rating-dialog');toast('Avaliação salva. O próximo pedido ao ChatGPT usará seu novo feedback.');});
$('profile-form').onsubmit=guard(async event=>{event.preventDefault();await commit(current=>{const profile=$('profile-text').value.trim();if(profile!==current.profile){current.profile=profile;current.profileVersion++;}return current;});close('profile-dialog');toast('Perfil salvo.');});
for(const button of document.querySelectorAll('[data-view]')) button.onclick=()=>{view=button.dataset.view;page=0;for(const tab of document.querySelectorAll('[data-view]')){tab.classList.toggle('active',tab===button);tab.setAttribute('aria-pressed',String(tab===button));}render();};
$('search').oninput=()=>{page=0;render();};$('min-score').onchange=()=>{page=0;render();};$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('md-button').onclick=()=>download('prioridade-biblioteca-steam.md',markdown(data),'text/markdown;charset=utf-8');
$('export-backup').onclick=()=>download(`biblioteca-backup-${new Date().toISOString().slice(0,10)}.json`,fatal&&raw?raw:JSON.stringify(data,null,2));
for(const id of ['import-backup','welcome-import'])$(id).onclick=()=>$('backup-file').click();
$('backup-file').onchange=guard(async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>15_000_000)throw new Error('Limite de arquivo: 15 MB.');
  const incoming=validateLibrary(parseJSON(await file.text()));
  if((data.games.length||fatal)&&!confirm(`Substituir sua biblioteca local de ${data.games.length} registros por ${incoming.games.length} registros? Um backup anterior será baixado.`))return;
  if(data.games.length||fatal)download('biblioteca-antes-da-importacao.json',fatal&&raw?raw:JSON.stringify(data,null,2));
  await commit(()=>incoming,{allowRecovery:true});page=0;render();toast(`${incoming.games.length} registros importados.`);
});
$('export-ai').onclick=guard(async()=>{if(data.requests.length&&!confirm('Gerar um novo pedido único? Respostas dos pedidos anteriores deixarão de ser aceitas. Suas notas e previsões serão preservadas.'))return;let batch;await commit(current=>{batch=createRequest(current,$('ai-scope').value);return batch.data;});$('prompt-preview').value=batch.prompt;promptPreview.hidden=false;download(`pedido-chatgpt-${batch.request.id.slice(0,8)}.md`,batch.prompt,'text/markdown;charset=utf-8');toast(`Pedido único com ${batch.count} jogos exportado. Anexe ao ChatGPT e envie o comando indicado.`);});
async function importAI(text) {let result;await commit(current=>{result=importPredictions(current,text);return result.data;});$('ai-response').value='';toast(`${result.updated} previsões atualizadas.${result.remaining?' Restam '+result.remaining+' jogos neste pedido.':''}`);}
$('import-ai').onclick=guard(()=>importAI($('ai-response').value));$('upload-ai').onclick=()=>$('ai-file').click();
$('ai-file').onchange=guard(async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>15_000_000)throw new Error('Limite: 15 MB.');await importAI(await file.text());});
$('clear-requests').onclick=guard(async()=>{if(!data.requests.length)return;if(!confirm('Descartar os pedidos em andamento? Respostas desses pedidos não poderão mais ser importadas. Nenhuma nota atual será alterada.'))return;await commit(current=>{current.requests=[];return current;});toast('Pedido descartado. Você pode gerar outro.');});
render();
