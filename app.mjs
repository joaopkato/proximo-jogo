import {emptyLibrary,validateLibrary,normalize,unplayed,sorted,needsPrediction,addGames,rateGame,createRequest,importPredictions,parseJSON,markdown,randomGame} from './core.mjs';
import {DriveSync} from './drive.mjs';
const $=id=>document.getElementById(id), KEY='proximo-jogo.library.v1', CONFIG='proximo-jogo.google.v1';
let data=emptyLibrary(), raw=null, config={}, view='backlog', page=0, shown=[], toastTimer, syncTimer, drive, fatal=false;
const PAGE_SIZE=30;
const promptPreview=document.createElement('details');promptPreview.hidden=true;promptPreview.innerHTML='<summary>Ver ou copiar o pedido exportado</summary><label for="prompt-preview">Pedido completo para o ChatGPT</label><textarea id="prompt-preview" rows="8" readonly></textarea>';$('request-status').after(promptPreview);
function toast(message,error=false) { const el=$('toast'); (document.querySelector('dialog[open]')||document.body).append(el);el.textContent=message;el.className=error?'error':'';el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,error?14000:6500); }
const guard=fn=>async event=>{try{await fn(event);}catch(error){toast(error.message||'Não foi possível concluir. Seus dados anteriores foram preservados.',true);}};
function download(name,text,type='application/json') { const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000); }
function saveConfig() { localStorage.setItem(CONFIG,JSON.stringify(config)); }
function dialog(id) { $('toast').hidden=true;$(id).showModal(); }
function close(id) { if($('toast').parentElement===$(id))document.body.append($('toast'));$(id).close(); }
for(const el of document.querySelectorAll('[data-close]')) el.onclick=()=>close(el.closest('dialog').id);
for(const el of document.querySelectorAll('dialog')) el.addEventListener('close',()=>{if($('toast').parentElement===el)document.body.append($('toast'));});
try {
  raw=localStorage.getItem(KEY); if(raw) data=validateLibrary(JSON.parse(raw));
  config=JSON.parse(localStorage.getItem(CONFIG)||'{}');
} catch(error) { fatal=true;toast('Não foi possível ler seus dados locais. Eles não foram apagados. Exporte o backup para recuperação antes de importar uma biblioteca válida.',true); }
drive=new DriveSync(config);
async function commit(transform,{allowRecovery=false}={}) {
  if(fatal&&!allowRecovery)throw new Error('Os dados locais precisam ser recuperados. Use Conexões & backup.');
  const operation=async()=>{
    const current=localStorage.getItem(KEY);
    if(current!==raw) {raw=current;data=current?validateLibrary(JSON.parse(current)):emptyLibrary();render();throw new Error('Outra aba alterou a biblioteca. Os dados foram recarregados; repita sua ação.');}
    const next=transform(structuredClone(data));next.revision=Math.max(data.revision,next.revision)+1;validateLibrary(next);
    const changedMarkdown=markdown(data)!==markdown(next);
    const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);raw=serialized;data=next;fatal=false;
    config.dirty=!!config.dirty||changedMarkdown;saveConfig();render();if(changedMarkdown)scheduleSync();
  };
  if(navigator.locks)await navigator.locks.request(KEY,operation);else await operation();
}
window.addEventListener('storage',event=>{if(event.key===KEY && event.newValue!==raw){try{data=event.newValue?validateLibrary(JSON.parse(event.newValue)):emptyLibrary();raw=event.newValue;render();toast('Biblioteca atualizada em outra aba.');}catch{fatal=true;toast('Outra aba gravou dados inválidos. Edições foram pausadas.',true);}}if(event.key===CONFIG){try{config=JSON.parse(event.newValue||'{}');drive.config=config;renderDrive();}catch{}}});
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
  renderDrive();
}
function renderDrive(message,error=false) {
  const connected=drive?.connected();
  $('drive-dot').className=`status-dot ${error?'error':connected?'connected':''}`;
  $('drive-status').textContent=message || (fatal?'Atenção: armazenamento local precisa de recuperação':connected?(config.fileId?(config.dirty?'Salvo localmente · alterações pendentes no Drive':`Drive atualizado${config.lastSync?' · '+new Date(config.lastSync).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}`):'Google conectado · selecione seu arquivo .md'):(config.fileId?'Salvo localmente · reconecte o Drive para sincronizar':'Salvo neste navegador · Drive não conectado'));
  $('drive-target').textContent=config.fileId?`Destino: ${config.fileName || config.fileId}${config.lastSync?' · último envio '+new Date(config.lastSync).toLocaleString('pt-BR'):''}`:'Nenhum arquivo autorizado.';
  $('choose-drive').disabled=!connected;$('auto-sync').checked=!!config.autoSync;
}
function scheduleSync() {clearTimeout(syncTimer);if(config.autoSync && config.dirty && drive.connected() && config.fileId)syncTimer=setTimeout(()=>syncDrive().catch(e=>{renderDrive(e.message,true);toast(e.message,true);}),1800);}
async function syncDrive() {
  if(!data.games.length)throw new Error('Importe ou adicione jogos antes de substituir o arquivo no Drive.');
  if(!drive.connected() || !config.fileId){if(!$('settings-dialog').open)openSettings();throw new Error('Conecte o Google e selecione o arquivo .md antes de sincronizar.');}
  if(drive.busy){scheduleSync();return;}
  const revision=data.revision, syncingDrive=drive, destination=config.fileId;renderDrive('Enviando Markdown para o Drive…');
  try {
    const result=await drive.sync(markdown(data),config.remoteVersion);
    if(drive!==syncingDrive || config.fileId!==destination)throw new Error('O envio terminou no destino anterior, mas a conexão mudou. Confira o arquivo antes de sincronizar o novo destino.');
    config.remoteVersion=result.version;config.lastSync=new Date().toISOString();config.dirty=data.revision!==revision;saveConfig();renderDrive();
    if(config.dirty)scheduleSync();
  }catch(error){config.dirty=true;saveConfig();renderDrive(error.message,true);throw error;}
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
function openSettings() {$('google-client').value=config.clientId||'';$('google-key').value=config.apiKey||'';$('google-project').value=config.projectNumber||'';$('oauth-origin').textContent=location.origin;renderDrive();dialog('settings-dialog');}
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
  if((data.games.length||fatal)&&!confirm(`Substituir sua biblioteca local de ${data.games.length} registros por ${incoming.games.length} registros? Um backup anterior será baixado. A sincronização automática será pausada até você conferir os dados.`))return;
  if(data.games.length||fatal)download('biblioteca-antes-da-importacao.json',fatal&&raw?raw:JSON.stringify(data,null,2));
  config.autoSync=false;saveConfig();await commit(()=>incoming,{allowRecovery:true});page=0;render();toast(`${incoming.games.length} registros importados. Drive automático pausado; confira antes de ativar.`);
});
$('export-ai').onclick=guard(async()=>{let batch;await commit(current=>{batch=createRequest(current,$('ai-scope').value);return batch.data;});$('prompt-preview').value=batch.prompt;promptPreview.hidden=false;download(`pedido-chatgpt-${batch.request.id.slice(0,8)}.md`,batch.prompt,'text/markdown;charset=utf-8');toast(`Pedido com ${batch.count} jogos exportado. ${batch.remaining} ainda disponíveis para outros lotes.`);});
async function importAI(text) {let result;await commit(current=>{result=importPredictions(current,text);return result.data;});$('ai-response').value='';toast(`${result.updated} previsões atualizadas.${result.remaining?' Restam '+result.remaining+' jogos neste pedido.':''}`);}
$('import-ai').onclick=guard(()=>importAI($('ai-response').value));$('upload-ai').onclick=()=>$('ai-file').click();
$('ai-file').onchange=guard(async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>15_000_000)throw new Error('Limite: 15 MB.');await importAI(await file.text());});
$('clear-requests').onclick=guard(async()=>{if(!data.requests.length)return;if(!confirm('Descartar os pedidos em andamento? Respostas desses pedidos não poderão mais ser importadas. Nenhuma nota atual será alterada.'))return;await commit(current=>{current.requests=[];return current;});toast('Pedidos descartados. Você pode exportar novos lotes.');});
$('google-config').onsubmit=guard(async event=>{
  event.preventDefault();drive.disconnect();config={...config,clientId:$('google-client').value.trim(),apiKey:$('google-key').value.trim(),projectNumber:$('google-project').value.trim(),autoSync:false};saveConfig();drive=new DriveSync(config);
  $('connect-drive').disabled=true;renderDrive('Preparando conexão Google…');await drive.load();$('connect-drive').disabled=false;renderDrive('Google preparado · clique em Conectar Google Drive');toast('Configuração salva. Clique em Conectar Google Drive.');
});
$('connect-drive').onclick=guard(async()=>{await drive.authorize();renderDrive();toast('Google conectado. Selecione o arquivo Markdown, se ainda não selecionou.');scheduleSync();});
$('choose-drive').onclick=guard(async()=>{
  // Native HTML dialogs are modal top-layer elements; close before Google's iframe picker.
  close('settings-dialog');let doc;
  try{doc=await drive.chooseFile();}catch(error){openSettings();throw error;}
  const meta=await drive.metadata(doc.id);
  if(!meta.name.endsWith('.md')||meta.mimeType.startsWith('application/vnd.google-apps.')||meta.trashed||!meta.capabilities?.canEdit)throw new Error('Escolha um arquivo .md editável.');
  if(!confirm(`Autorizar a substituição do conteúdo de "${meta.name}" pela fila desta biblioteca? O link e as permissões serão preservados. O arquivo não será alterado até você sincronizar ou ativar o envio automático.`)){openSettings();return;}
  config.fileId=doc.id;config.fileName=meta.name;config.remoteVersion=meta.version;config.dirty=true;config.lastSync=null;saveConfig();drive.config=config;openSettings();scheduleSync();
});
$('disconnect-drive').onclick=guard(()=>{drive.disconnect();config.autoSync=false;saveConfig();clearTimeout(syncTimer);renderDrive();toast('Google desconectado. Seus dados locais foram mantidos.');});
$('auto-sync').onchange=guard(event=>{config.autoSync=event.target.checked;saveConfig();scheduleSync();renderDrive();if(config.autoSync&&!drive.connected())toast('Sincronização automática ativada, mas aguardando conexão Google.');});
$('sync-button').onclick=guard(syncDrive);
window.addEventListener('online',scheduleSync);window.addEventListener('focus',()=>{renderDrive();scheduleSync();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderDrive();scheduleSync();}});
render();
if(config.clientId&&config.apiKey&&config.projectNumber)drive.load().then(()=>{$('connect-drive').disabled=false;}).catch(error=>renderDrive(error.message,true));
