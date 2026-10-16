# Complexo América RP — loja v2

Versão baseada no HTML existente, com identidade azul/vermelha e sem simular autenticação, pagamento, entrega ou população do servidor.

## O que está incluído
- `index.html`, `styles` inline e `app.js`: loja responsiva, produtos existentes, carrinho, FAQ, botão de conectar e checkout que exige backend configurado.
- `config.js`: URL Supabase existente e espaço para a chave pública anon/publishable.
- `sql/schema.sql`: pedidos e fila de entrega com RLS.
- `admin.html` + `admin.js`: painel separado, com produtos, preços, categorias, pedidos e fila de entregas.
- `sql/admin-panel.sql`: tabelas/RLS do catálogo, permissões de administrador e produtos iniciais.
- `supabase/functions/admin-requeue-delivery`: reenvia para a fila apenas entregas que falharam, com verificação de administrador.
- `supabase/functions/create-payment`: valida produtos/preços no backend e cria PIX real no Mercado Pago.
- `supabase/functions/mercadopago-webhook`: valida assinatura do webhook e consulta pagamento diretamente no Mercado Pago antes de colocar pedido na fila.
- `supabase/functions/payment-status`: permite ao cliente consultar apenas seu pedido.
- `supabase/functions/server-status`: busca `dynamic.json` do FiveM e retorna dados reais; se falhar, a página mostra status indisponível em vez de inventar números.

## Antes de publicar: itens obrigatórios
**O projeto é um scaffold de integração, não pode receber pagamentos até você completar a configuração e testar em modo sandbox.** Não existem credenciais do Mercado Pago/Discord no HTML fornecido e não foram inventadas.

### 1. Supabase
1. Abra o projeto `kgidkxaqvgcqiqwqxvut` no Supabase.
2. Execute `sql/schema.sql` no SQL Editor.
3. Em Authentication > Providers, habilite Discord e informe Client ID e Client Secret da aplicação Discord. Configure o callback do Supabase mostrado no painel do provider.
4. Execute `sql/admin-panel.sql` no SQL Editor para criar o catálogo e o painel administrativo. A migração tenta autorizar `Complexo@gmail.com` se essa conta já existir em `auth.users`. Se ainda não existir, entre uma vez com essa conta e execute novamente o INSERT de autorização no final do SQL. Se o e-mail da conta Discord for diferente, ajuste o e-mail no comando antes de executar.
5. Publique também `admin.html` e `admin.js` junto da loja. O painel fica em `/admin.html`; a URL não substitui as permissões RLS.
4. Em Authentication > URL Configuration, adicione a URL publicada no GitHub Pages em Site URL/Redirect URLs.
5. Copie a chave `anon`/publishable para `config.js`. Ela pode ficar no frontend apenas porque as tabelas têm RLS; **nunca use `service_role` no frontend**.

### 2. Deploy das Edge Functions
Instale e autentique o Supabase CLI. A partir desta pasta, confirme o `project_id` em `supabase/config.toml` e execute:

```bash
supabase login
supabase link --project-ref kgidkxaqvgcqiqwqxvut
supabase functions deploy create-payment --no-verify-jwt
supabase functions deploy payment-status --no-verify-jwt
supabase functions deploy admin-requeue-delivery --no-verify-jwt
supabase functions deploy server-status --no-verify-jwt
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

O JWT é validado dentro das funções protegidas. O webhook não usa login do comprador, mas valida a assinatura do Mercado Pago.

### 3. Segredos do backend
No painel Supabase > Edge Functions > Secrets, configure:
- `MERCADOPAGO_ACCESS_TOKEN`: Access Token do Mercado Pago. Comece com credenciais de teste.
- `MERCADOPAGO_WEBHOOK_SECRET`: segredo de assinatura que o painel de notificações/webhooks do Mercado Pago fornece.
- `STORE_ORIGIN`: URL exata do site publicado, por exemplo `https://usuario.github.io/repositorio`.
- `FIVEM_SERVER_URL`: base pública do endpoint do servidor FiveM que responda `dynamic.json`. O valor padrão `https://cpx.complexoamerica.com.br` precisa ser verificado com a hospedagem.

As Edge Functions recebem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no runtime do Supabase. Nunca copie a service role para arquivos do site, repositório ou recurso público.

### 4. Mercado Pago PIX e webhook
1. Crie/seleciona uma aplicação em Mercado Pago Developers e use credenciais de teste.
2. Configure a URL de notificações como `https://kgidkxaqvgcqiqwqxvut.supabase.co/functions/v1/mercadopago-webhook` e selecione eventos de pagamentos.
3. Copie o segredo de assinatura de webhook para `MERCADOPAGO_WEBHOOK_SECRET`.
4. Teste pagamentos de ponta a ponta em sandbox antes de trocar para credenciais de produção.

O backend valida o valor pelo catálogo de produtos no servidor; o preço enviado pelo navegador é ignorado. A confirmação não depende de clicar em um botão: depende do webhook assinado e da consulta do pagamento na API do Mercado Pago.

### 5. Contagem real do FiveM
A função consulta `FIVEM_SERVER_URL/dynamic.json`. O host usado anteriormente no botão de conexão (`cpx.complexoamerica.com.br`) pode ser um hostname de conexão e não necessariamente expor `dynamic.json`. Se a contagem ficar indisponível, confirme com a hospedagem o endpoint HTTP público correto e atualize o segredo `FIVEM_SERVER_URL`. A interface nunca gera números aleatórios.

### 6. Painel administrativo
- Acesse `https://SEU-SITE/admin.html` e entre pelo Discord autorizado.
- O painel permite criar/editar categorias, criar/editar/ativar/ocultar produtos e alterar preços; consulta todos os pedidos e a fila de entregas.
- Reenfileirar é permitido apenas para jobs com falha. Não existe ação para marcar manualmente uma entrega como concluída.
- As alterações do catálogo passam a aparecer na loja quando o catálogo do Supabase está acessível. O checkout valida o preço atual no backend.

### 7. Entrega no jogo
Depois de um pagamento aprovado, a função grava uma linha em `delivery_jobs` e marca o pedido `delivery_pending`. **A entrega dentro do FiveM ainda precisa ser ligada ao framework e aos comandos reais da sua cidade.** Não foi criada uma entrega fictícia, porque não sabemos se a cidade usa vRP, QBCore, ESX ou um framework próprio. Para completar, será necessário integrar um worker/recurso server-side com o inventário, VIPs e sistema de passaporte reais.

### 7. Catálogo
Os nomes e preços no `create-payment/index.ts` devem corresponder exatamente aos produtos ativos na loja. Antes de vender, revise os preços e benefícios e mantenha o catálogo do HTML sincronizado com o catálogo do backend.

## Avisos de segurança
- Nunca comite tokens do Mercado Pago, client secret Discord, Supabase service role ou segredos do webhook.
- Configure limites de taxa/abuso e alertas no Supabase antes de produção.
- O fluxo de pagamento e webhook precisa ser testado em sandbox. Não anuncie entrega automática até conectar e testar o worker do servidor.
- O login OAuth do Discord só funcionará após configurar o provider no painel do Supabase.
