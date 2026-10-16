/* Configuração pública do frontend. A chave anon/publishable pode ser pública SOMENTE com RLS correta. Nunca coloque service_role ou token do Mercado Pago aqui. */
window.COMPLEXO_CONFIG = {
  SUPABASE_URL: "https://kgidkxaqvgcqiqwqxvut.supabase.co",
  SUPABASE_ANON_KEY: "COLE_AQUI_SUA_CHAVE_ANON_OU_PUBLISHABLE_DO_SUPABASE",
  FUNCTIONS_BASE_URL: "https://kgidkxaqvgcqiqwqxvut.supabase.co/functions/v1",
  SERVER_STATUS_FUNCTION: "server-status",
  CREATE_PAYMENT_FUNCTION: "create-payment",
  PAYMENT_STATUS_FUNCTION: "payment-status",
  ADMIN_REQUEUE_FUNCTION: "admin-requeue-delivery"
};
