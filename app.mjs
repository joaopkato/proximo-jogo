import {emptyLibrary,validateLibrary,normalize,unplayed,sorted,needsPrediction,addGames,rateGame,createRequest,importPredictions,parseJSON,markdown,randomGame} from './core.mjs';
import {GitHubLibrary,publicLibrary,comparable,fingerprint,reconcile,FILE_URL} from './github.mjs';
const cloud=new GitHubLibrary(), META='proximo-jogo.github.base.v1';
let base={}, cloudBusy=false, cloudMessage='Consultando biblioteca pública…', conflict=false, remoteKnown=false, dirty=true;
try {const m=JSON.parse(localStorage.getItem(META)||'{}');if(/^[a-f0-9]{40}$/.test(m.sha)&&/^[a-f0-9]{64}$/.test(m.hash))base={sha:m.sha,hash:m.hash};}catch{}
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
  if(fatal&&!allowRecovery)throw new Error('Os dados locais precisam ser recuperados. Use Dados & GitHub.');
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
  refreshCloudStatus();
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

function rememberBase(sha,hash){base={sha,hash};localStorage.setItem(META,JSON.stringify(base));}
async function refreshCloudStatus(){
  const snapshot=data;
  let hash;try{hash=await fingerprint(snapshot);}catch{return;}
  if(snapshot!==data)return;
  dirty=hash!==base.hash;
  const message=fatal?'Dados locais precisam de recuperação. Exporte seu backup.':cloudBusy?'Consultando ou salvando no GitHub…':conflict?'Conflito: cópias local e GitHub diferentes. Abra Dados & GitHub.':cloudMessage||(!remoteKnown?'GitHub não verificado. Sua cópia local foi preservada.':dirty?'Alterações locais ainda não publicadas no GitHub.':'Biblioteca igual à última versão consultada no GitHub.');
  $('local-status').textContent=message;
  $('github-status').textContent=message;
  $('github-auth').textContent=cloud.connected?'Token disponível nesta aba; permissão de escrita será verificada no envio.':'Leitura pública · conecte um token para escrever.';
  $('github-conflict').hidden=!conflict;
  for(const id of ['github-save','github-refresh','github-local','github-remote','token-submit'])$(id).disabled=cloudBusy||fatal;
  $('github-save').disabled=cloudBusy||fatal||conflict||!remoteKnown||!dirty;
  $('github-disconnect').disabled=!cloud.connected||cloudBusy;
}
async function cloudOperation(fn){
  if(cloudBusy)throw new Error('Aguarde a operação do GitHub em andamento.');
  cloudBusy=true;cloudMessage='';refreshCloudStatus();
  try{await fn();}
  catch(error){cloudMessage=error.message;if(error.status===409||error.status===422){conflict=true;remoteKnown=false;}throw error;}
  finally{cloudBusy=false;refreshCloudStatus();}
}
async function readCloud(mode='auto'){
  await cloudOperation(async()=>{
    const remote=await cloud.read();
    if(fatal)throw new Error('Recupere ou exporte seus dados locais antes de carregar o GitHub.');
    const capturedRaw=raw, snapshot=data;
    const [localHash,remoteHash]=await Promise.all([fingerprint(snapshot),fingerprint(remote.data)]);
    if(raw!==capturedRaw||localStorage.getItem(KEY)!==capturedRaw)throw new Error('Outra edição ocorreu durante a consulta. Tente novamente.');
    const decision=reconcile({localHash,remoteHash,baseHash:base.hash,baseSha:base.sha,remoteSha:remote.sha,hasLocal:!!raw});
    if(mode==='remote'){
      if(localHash!==remoteHash&&!confirm('Substituir sua cópia local pela biblioteca atual do GitHub? Suas mudanças locais não serão mescladas. Um backup local será baixado.'))return;
      if(localHash!==remoteHash)download('biblioteca-local-antes-do-github.json',JSON.stringify(publicLibrary(snapshot),null,2));
    }else if(decision==='conflict'){
      conflict=true;remoteKnown=false;return;
    }
    if(mode==='remote'||decision==='remote'){
      if(localHash!==remoteHash || !raw)await commit(current=>{
        if(comparable(current)!==comparable(snapshot))throw new Error('A biblioteca mudou durante a consulta. Tente novamente.');
        return remote.data;
      });
      rememberBase(remote.sha,remoteHash);conflict=false;remoteKnown=true;
    }else{remoteKnown=true;conflict=false;}
  });
}
async function saveCloud(replace=false){
  if(!cloud.connected){openSettings();throw new Error('Informe o token em Dados & GitHub. Nunca publique o token.');}
  await cloudOperation(async()=>{
    if(fatal||localStorage.getItem(KEY)!==raw)throw new Error('Os dados locais mudaram ou precisam de recuperação. Recarregue antes de salvar.');
    let sha=base.sha;
    if(replace){
      const remote=await cloud.read();sha=remote.sha;
      if(!confirm('Publicar sua cópia LOCAL inteira no lugar da versão do GitHub? Isso substitui também notas e comentários remotos, sem mesclar. Uma cópia remota será baixada; o histórico Git continua disponível.'))return;
      download('biblioteca-github-antes-da-substituicao.json',JSON.stringify(remote.data,null,2));
    }else if(conflict||!remoteKnown)throw new Error('Leia a versão do GitHub e resolva qualquer conflito antes de salvar.');
    const snapshot=publicLibrary(data), capturedRaw=raw;
    if(!snapshot.games.length)throw new Error('A biblioteca está vazia. Salvamento remoto bloqueado para evitar apagar o catálogo.');
    if(!replace&&!confirm('Publicar jogos, perfil, notas, comentários, previsões e pedidos de IA em biblioteca.json? O conteúdo será público e ficará no histórico do GitHub.'))return;
    if(localStorage.getItem(KEY)!==capturedRaw)throw new Error('Outra aba alterou a biblioteca. Recarregue antes de enviar.');
    const result=await cloud.save(snapshot,sha);
    rememberBase(result.sha,await fingerprint(snapshot));remoteKnown=true;conflict=false;cloudMessage='';
    toast('Biblioteca salva no GitHub.'+(comparable(data)!==comparable(snapshot)?' Há novas alterações locais ainda não enviadas.':''));
  });
}
$('github-token-form').onsubmit=guard(async event=>{
  event.preventDefault();
  const field=$('github-token');try{cloud.connect(field.value);}finally{field.value='';}
  await readCloud();toast('Token mantido somente nesta aba. Use Salvar no GitHub para publicar.');
});
$('github-disconnect').onclick=()=>{cloud.disconnect();$('github-token').value='';refreshCloudStatus();toast('Token removido da memória desta aba.');};
$('github-save').onclick=guard(()=>saveCloud());
$('github-refresh').onclick=guard(()=>readCloud());
$('github-remote').onclick=guard(()=>readCloud('remote'));
$('github-local').onclick=guard(()=>saveCloud(true));
$('view-json').onclick=guard(()=>{$('json-preview').value=JSON.stringify(publicLibrary(data));$('json-preview').hidden=false;});
window.addEventListener('pagehide',()=>{cloud.disconnect();$('github-token').value='';});
window.addEventListener('pageshow',()=>refreshCloudStatus());
window.addEventListener('beforeunload',event=>{if(dirty&&data.games.length){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===META){remoteKnown=false;cloudMessage='Outra aba salvou no GitHub. Consulte a versão remota antes de enviar.';refreshCloudStatus();}});
render();
readCloud().catch(()=>{});
