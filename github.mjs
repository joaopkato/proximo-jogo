import {validateLibrary} from './core.mjs';

export const REPOSITORY='joaopkato/proximo-jogo';
export const BRANCH='main';
export const FILE='biblioteca.json';
export const FILE_URL=`https://github.com/${REPOSITORY}/blob/${BRANCH}/${FILE}`;
const API=`https://api.github.com/repos/${REPOSITORY}/contents/${FILE}`;
const MAX_BYTES=15_000_000;
const validSha=s=>typeof s==='string' && /^[a-f0-9]{40}$/.test(s);

// Explicit allow-list: never publish extra fields from imported backups or UI state.
export function publicLibrary(input) {
  const d=validateLibrary(input);
  return {schemaVersion:1,revision:d.revision,profileVersion:d.profileVersion,profile:d.profile,
    games:d.games.map(g=>({id:g.id,title:g.title,rating:g.rating,comment:g.comment,prediction:g.prediction===null?null:{score:g.prediction.score,confidence:g.prediction.confidence,reason:g.prediction.reason,sources:[...g.prediction.sources],profileVersion:g.prediction.profileVersion}})),
    requests:d.requests.map(r=>({id:r.id,profileVersion:r.profileVersion,ids:[...r.ids]}))};
}
export const comparable=input=>JSON.stringify({...publicLibrary(input),revision:0});
export async function fingerprint(input) {
  const bytes=new TextEncoder().encode(comparable(input));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function reconcile({localHash,remoteHash,baseHash,baseSha,remoteSha,hasLocal}) {
  if(!hasLocal || localHash===remoteHash || (baseHash && localHash===baseHash))return 'remote';
  if(baseSha && remoteSha===baseSha)return 'local';
  return 'conflict';
}
export function encodeUTF8(text) {
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export const decodeUTF8=text=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));
export class GitHubLibrary {
  #token='';
  constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.busy=false;}
  get connected(){return !!this.#token;}
  connect(token){if(typeof token!=='string'||!/^github_pat_[A-Za-z0-9_]+$/.test(token.trim()))throw new Error('Informe um fine-grained token do GitHub. Ele começa com github_pat_.');this.#token=token.trim();}
  disconnect(){this.#token='';}
  async request(url,options={}) {
    let result;
    try {result=await this.fetcher(url,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(this.#token?{Authorization:`Bearer ${this.#token}`} : {}),...options.headers}});}
    catch {throw new Error(options.method==='PUT'?'Não foi possível confirmar o envio. Confira o GitHub antes de tentar novamente; sua cópia local foi preservada.':'Não foi possível consultar o GitHub. Sua cópia local continua disponível.');}
    if(!result.ok){
      if(result.status===401)this.disconnect();
      const error=new Error(({401:'Token inválido ou expirado. Conecte novamente.',403:'GitHub recusou o acesso: confira Contents: Read and write, validade do token e limite de requisições.',404:'biblioteca.json não encontrado ou token sem acesso ao repositório.',409:'Conflito: a biblioteca mudou no GitHub. Releia a versão remota antes de salvar.',422:'GitHub recusou a gravação. Releia a biblioteca e confira as regras da branch.'})[result.status]||`GitHub indisponível (HTTP ${result.status}). Sua cópia local foi preservada.`);
      error.status=result.status;throw error;
    }
    return result;
  }
  async read(){
    const meta=await (await this.request(`${API}?ref=${BRANCH}`)).json();
    if(meta.type!=='file'||!validSha(meta.sha)||meta.size>MAX_BYTES)throw new Error('Arquivo remoto inválido ou acima de 15 MB.');
    let text;
    if(meta.encoding==='base64' && typeof meta.content==='string')text=decodeUTF8(meta.content);
    else {
      // Read immutable blob, not the branch again: content and version must agree.
      const blob=await (await this.request(`https://api.github.com/repos/${REPOSITORY}/git/blobs/${meta.sha}`)).json();
      if(blob.sha!==meta.sha || blob.encoding!=='base64' || typeof blob.content!=='string')throw new Error('Não foi possível validar o conteúdo remoto.');
      text=decodeUTF8(blob.content);
    }
    if(new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('Biblioteca acima de 15 MB.');
    return {sha:meta.sha,data:publicLibrary(JSON.parse(text))};
  }
  async save(data,sha){
    if(!this.connected)throw new Error('Conecte seu token em Dados & GitHub para salvar.');
    if(!validSha(sha))throw new Error('Leia a biblioteca do GitHub antes de salvar.');
    if(this.busy)throw new Error('Já existe um envio em andamento.');
    const snapshot=publicLibrary(data),text=JSON.stringify(snapshot)+'\n';
    if(new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('Biblioteca acima de 15 MB; nada foi enviado.');
    this.busy=true;
    try {
      // GitHub rejects a stale SHA atomically. No force or blind retry.
      const result=await (await this.request(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Atualizar biblioteca pessoal pelo Próximo jogo',branch:BRANCH,sha,content:encodeUTF8(text)})})).json();
      if(!validSha(result.content?.sha))throw new Error('Envio sem confirmação válida. Releia o GitHub; sua cópia local foi preservada.');
      return {sha:result.content.sha,data:snapshot};
    }finally{this.busy=false;}
  }
}
