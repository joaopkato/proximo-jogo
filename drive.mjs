// OAuth access tokens remain in memory. No OpenAI API, server, client secret or refresh token.
export class DriveSync {
  constructor(config, fetcher=globalThis.fetch.bind(globalThis)) { this.config=config; this.fetcher=fetcher; this.token=null; this.expires=0; this.busy=false; }
  connected() { return !!this.token && Date.now()<this.expires-30000; }
  async load() {
    const script=src=>new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>{el.remove();reject(new Error('Não foi possível carregar a conexão Google. Verifique rede e bloqueadores.'));};document.head.append(el);});
    if (!globalThis.google?.accounts?.oauth2) await script('https://accounts.google.com/gsi/client');
    if (!globalThis.gapi) await script('https://apis.google.com/js/api.js');
    if (!globalThis.google?.picker) await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:reject,timeout:10000,ontimeout:()=>reject(new Error('O seletor do Drive demorou demais.'))}));
    this.client=google.accounts.oauth2.initTokenClient({client_id:this.config.clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:()=>{}});
  }
  authorize() {
    if (!this.client) return Promise.reject(new Error('Prepare a conexão Google primeiro.'));
    return new Promise((resolve,reject)=>{
      this.client.callback=r=>{if(r.error || !r.access_token){reject(new Error('Autorização Google não concluída.'));return;} this.token=r.access_token;this.expires=Date.now()+Number(r.expires_in)*1000;resolve();};
      this.client.error_callback=()=>reject(new Error('Login cancelado ou janela bloqueada. Tente conectar novamente.'));
      this.client.requestAccessToken({prompt:''});
    });
  }
  chooseFile() {
    if (!this.connected()) return Promise.reject(new Error('Conecte sua conta Google primeiro.'));
    return new Promise((resolve,reject)=>{
      new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMode(google.picker.DocsViewMode.LIST))
        .setOAuthToken(this.token).setDeveloperKey(this.config.apiKey).setAppId(this.config.projectNumber)
        .setOrigin(location.origin).setTitle('Escolha prioridade-biblioteca-steam.md')
        .setCallback(data=>{if(data.action===google.picker.Action.PICKED)resolve(data.docs[0]);else if(data.action===google.picker.Action.CANCEL)reject(new Error('Nenhum arquivo selecionado.'));})
        .build().setVisible(true);
    });
  }
  async request(url, options={}) {
    if (!this.connected()) throw new Error('Reconecte o Google Drive: a autorização expirou. As alterações continuam salvas localmente.');
    const r=await this.fetcher(url,{...options,signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${this.token}`,...options.headers}});
    if (!r.ok) {
      if (r.status===401) this.token=null;
      const messages={401:'Autorização expirada. Reconecte o Google.',403:'Sem acesso ao arquivo. Selecione-o pelo seletor Google e confira as APIs do projeto.',404:'Arquivo não encontrado ou não autorizado.',412:'O arquivo mudou no Drive. Sincronização interrompida para evitar sobrescrever outra edição.'};
      throw new Error(messages[r.status] || `Drive indisponível (HTTP ${r.status}). Tente sincronizar novamente.`);
    }
    return r;
  }
  async metadata(id) { return (await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,version,trashed,capabilities(canEdit)`)).json(); }
  async sync(text, expectedVersion) {
    if(this.busy) throw new Error('Uma sincronização já está em andamento.');
    this.busy=true;
    try {
      const id=this.config.fileId; if (!id) throw new Error('Selecione o arquivo .md no Drive.');
      const meta=await this.metadata(id);
      if(meta.trashed || !meta.capabilities?.canEdit || !meta.name.endsWith('.md') || meta.mimeType.startsWith('application/vnd.google-apps.')) throw new Error('O destino deve ser um arquivo .md editável, não um Google Doc.');
      if (expectedVersion && meta.version!==expectedVersion) throw new Error('O arquivo foi alterado fora desta página. Confira o Drive e selecione o arquivo novamente antes de substituir.');
      // Obtain the media ETag for conditional upload. Also verify version after reading it.
      const current=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
      const etag=current.headers.get('ETag');
      await current.text();
      if (!etag) throw new Error('O Drive não expôs o controle de versão necessário. Nenhum arquivo foi sobrescrito; exporte o Markdown manualmente.');
      const checked=await this.metadata(id);
      if(checked.version!==meta.version) throw new Error('O arquivo mudou durante a leitura. Tente novamente após conferir o Drive.');
      const r=await this.request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,version,modifiedTime`,{method:'PATCH',headers:{'Content-Type':'text/markdown; charset=utf-8','If-Match':etag},body:text});
      return await r.json();
    } finally {this.busy=false;}
  }
  disconnect() { if(this.token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token,()=>{});this.token=null;this.expires=0; }
}
