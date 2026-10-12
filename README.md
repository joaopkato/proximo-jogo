# Próximo jogo

Biblioteca pessoal de jogos com avaliações, prioridades, sorteio e atualização de previsões por exportação/importação com o ChatGPT, sem API de IA.

Site: https://joaopkato.github.io/proximo-jogo/

## Começar

Abra o site e importe seu arquivo privado `biblioteca-inicial.json`. Os dados ficam no navegador: não envie sua biblioteca, seus backups nem suas avaliações para este repositório público. Faça backups JSON regularmente.

- Adicione títulos, um por linha.
- Registre notas de 0 a 100 e comentários sobre os jogos que jogar.
- Use **Atualizar com ChatGPT** para exportar um lote, levar o pedido ao ChatGPT e importar o JSON da resposta. Não há conexão automática nem cobrança de API. Novas avaliações marcam previsões anteriores para recalibração.
- Sorteie entre jogos não avaliados que atendam aos filtros.
- Exporte a fila em Markdown e a biblioteca completa em JSON.

## Google Drive

A sincronização é opcional e requer configurar um cliente Google OAuth e o Google Picker em **Conexões & backup**. A conexão do Drive no ChatGPT/Codex não é compartilhada com este site.

1. Em um projeto Google Cloud, habilite **Google Drive API** e **Google Picker API**.
2. Configure o consentimento OAuth e inclua sua conta como usuário de teste, quando aplicável.
3. Crie um cliente OAuth Web com origem autorizada `https://joaopkato.github.io`.
4. Crie uma chave pública do Picker, restrita às APIs Picker/Drive e aos sites `https://joaopkato.github.io/*` e `https://docs.google.com/*`.
5. Informe o ID do cliente, a chave do Picker e o número do projeto no site. Não informe segredo OAuth nem chave OpenAI.
6. Conecte sua conta, escolha o arquivo `prioridade-biblioteca-steam.md` pelo seletor Google e confirme o destino. Confira sua biblioteca antes de sincronizar.
7. Ative o envio automático. Alterações atualizam o mesmo arquivo, sem mudar link ou permissões.

O envio automático funciona somente com a página aberta, online e autorizada. Tokens expiram e podem exigir reconexão. Alterações externas no Drive bloqueiam a sobrescrita até conferência. O Markdown contém a fila, não é um backup completo das avaliações.

## Privacidade

Nenhum rastreador ou servidor de dados próprio. O armazenamento local não é criptografado e não sincroniza automaticamente entre dispositivos. Transfira backups JSON para continuar em outro navegador. Limpar os dados do navegador sem backup pode apagar sua biblioteca. Projetos no mesmo domínio GitHub Pages compartilham a origem; mantenha apenas código confiável nesse domínio.

## Hospedagem

Este repositório contém os arquivos estáticos na raiz. Em **Settings → Pages**, use **Deploy from a branch → main → /(root)**. Para executar localmente: `python3 -m http.server 4173 --bind 127.0.0.1` e abra `http://127.0.0.1:4173`.

Previsões são hipóteses de afinidade, não garantias nem probabilidades calibradas. Respostas desconhecidas ou antigas são recusadas; notas não são inventadas pela página.

[Documentação do Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)
