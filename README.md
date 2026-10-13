# Próximo jogo / edição 03

Biblioteca pessoal em https://joaopkato.github.io/proximo-jogo/.

## Biblioteca pública no GitHub

O arquivo biblioteca.json guarda jogos, perfil, notas, comentários, previsões e pedidos de IA. Qualquer pessoa pode lê-lo. Ao abrir o site, ele consulta a versão atual pela API do GitHub; uma cópia local permite continuar sem conexão.

Abra **Dados & GitHub** para conectar seu token e clicar em **Salvar no GitHub**. O envio é explícito, não automático. A interface diferencia mudanças locais, consulta remota e conflitos. Visitantes sem token podem explorar e editar sua própria cópia local, mas não publicar.

### Token pessoal com acesso restrito

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Proprietário: joaopkato. Escolha uma validade curta.
3. Only select repositories → proximo-jogo.
4. Repository permissions → **Contents: Read and write**. Metadata de leitura é automático. Não habilite Workflows.
5. Gere e cole o token no campo do aplicativo. Não o envie ao ChatGPT, não o coloque em arquivos, comentários ou no repositório.

O token permite editar o conteúdo de todo o repositório selecionado, não apenas o JSON. É mantido apenas na memória da aba, nunca em localStorage, sessionStorage, URL ou backups. O campo é limpo após conectar. Recarregar ou fechar exige informar novamente. “Esquecer token” não revoga a credencial; revogue nas configurações do GitHub se necessário.

## Conflitos e recuperação

O envio contém o SHA da versão consultada. Se o arquivo mudou remotamente, o GitHub recusa a gravação; não há repetição forçada. Se local e remoto divergirem, nada é descartado automaticamente. As opções de resolução substituem uma cópia inteira após confirmação e oferecem backup da cópia substituída; não mesclam avaliações.

A cópia local antiga é preservada na primeira migração se diferir do JSON público. Em outro dispositivo sem dados locais, a biblioteca é carregada automaticamente. Se não houver mudanças locais desde a última sincronização, uma versão remota nova pode ser adotada ao consultar/reabrir.

Uma interrupção de rede durante o envio pode deixar o resultado incerto. Consulte o GitHub antes de reenviar. Limites de API, token expirado e regras da branch podem impedir envio, sem apagar dados locais. O salvamento é limitado a 15 MB. O GitHub Pages pode demorar a refletir commits, mas o aplicativo lê os dados diretamente pela API.

A publicação é pública e permanece no histórico Git. Remover uma nota do JSON atual não a apaga de commits anteriores ou de cópias de terceiros.

## Uso

- Adicione jogos, avalie de 0 a 100, registre comentários e sorteie entre os jogos filtrados.
- Em Atualizar com ChatGPT, baixe um pedido único, anexe-o e envie o comando mostrado.
- Importe o arquivo previsoes.json e salve no GitHub para levar o resultado a outros dispositivos.
- Salve também pedidos exportados no GitHub se quiser importar suas respostas em outro dispositivo.
- Respostas incompletas ou com perfil obsoleto são recusadas atomicamente. Um pedido único não elimina os limites do ChatGPT.
- Exportar backup JSON preserva a biblioteca completa; Markdown exporta a fila.
- Sem Google Drive, rastreadores ou API de IA.

## Desenvolvimento

O pacote local contém site/ e tests/. Requer Node.js 22+:

```sh
node --test tests/*.test.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

O repositório publicado contém somente os arquivos de site/ na raiz. Para servi-lo diretamente, omita --directory site. GitHub Pages: main / raiz. A biblioteca pública foi autorizada pelo proprietário; credenciais e outros backups não devem ser publicados.

[GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents) · [Fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
