# Checklist de ativação

- [ ] Executar `sql/schema.sql` no Supabase.
- [ ] Ativar Discord em Supabase Auth e cadastrar o callback OAuth no Developer Portal do Discord.
- [ ] Colocar a chave pública anon/publishable no `config.js`.
- [ ] Configurar os secrets do Mercado Pago, webhook, URL da loja e URL do FiveM no Supabase.
- [ ] Fazer deploy das quatro Edge Functions.
- [ ] Configurar o webhook de pagamentos no Mercado Pago e testar em sandbox.
- [ ] Verificar que `dynamic.json` é acessível na URL configurada.
- [ ] Integrar `delivery_jobs` ao framework real do servidor FiveM.
- [ ] Testar no GitHub Pages e só então trocar para credenciais de produção.


## Painel administrativo
1. Execute `sql/admin-panel.sql` no Supabase depois de `sql/schema.sql`.
2. Publique `admin.html` e `admin.js` na mesma pasta pública que `index.html` e `config.js`.
3. Entre em `admin.html` com a conta Discord autorizada em `store_admins`.
4. Faça deploy da função `admin-requeue-delivery`.
5. O painel não concede itens diretamente no FiveM; para isso ainda é necessário integrar o worker ao framework da cidade.
