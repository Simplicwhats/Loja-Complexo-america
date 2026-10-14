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
