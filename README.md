# Próximo jogo / edição 02

Biblioteca pessoal estática, hospedada em https://joaopkato.github.io/proximo-jogo/.

## Uso

- Adicione títulos, avalie jogos de 0 a 100 e registre comentários.
- Use os filtros para explorar a fila ou deixe o sorteio escolher.
- Em **Atualizar com ChatGPT**, baixe um pedido único com todos os jogos selecionados.
- Anexe o Markdown ao ChatGPT e envie: “Execute o pedido anexado para todos os jogos e entregue um único arquivo previsoes.json para download, seguindo o formato especificado.”
- Importe o JSON devolvido. Não há divisão em lotes nem limite de 40 jogos.
- O pedido inclui perfil e avaliações pessoais: revise antes de compartilhar.

## Dados e segurança

Sem integração com Google Drive, OAuth ou API de IA. Dados ficam no navegador, na chave original proximo-jogo.library.v1. Atualizar a página preserva a biblioteca existente. A configuração antiga do Google é removida localmente; nenhum arquivo remoto é apagado e a autorização da conta não é revogada automaticamente.

**Dados & backup → Exportar backup JSON** guarda jogos, notas, comentários e previsões. O Markdown contém apenas a fila. Dados não passam automaticamente entre navegadores ou dispositivos. Limpar o armazenamento sem backup pode apagá-los.

## Pedido único

O escopo padrão inclui novos e desatualizados. Uma avaliação ou mudança de perfil marca as previsões para recalibração. A opção “Todos” reavalia a fila inteira.

Gerar outro pedido substitui os anteriores após confirmação, sem alterar notas. A resposta usa índices curtos, notas, confiança, justificativas e fontes. Respostas incompletas, inválidas, duplicadas ou baseadas em um perfil antigo são recusadas atomicamente. O formato antigo com IDs continua aceito para pedidos existentes, desde que completo.

Um único pedido não remove os limites de contexto/saída do ChatGPT. O comando solicita um arquivo para download e não promete conclusão automática de análises grandes. Nenhuma nota é inventada pelo aplicativo para preencher lacunas.

## Desenvolvimento e publicação

Aplicativo sem build ou dependências. Requer Node.js 22+ para testes:

```sh
node --test tests/*.test.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

Publique somente o conteúdo de site/ na raiz do repositório. GitHub Pages: main, /(root). Não publique backups privados. Os testes ficam fora da pasta pública.

Visual editorial inspirado em fichários e revistas: papel, tinta, vermelho e ficha amarela. Sem fontes externas ou rastreadores.
