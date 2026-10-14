/* Configuração pública do frontend. A chave anon/publishable pode ser pública SOMENTE com RLS correta. Nunca coloque service_role ou token do Mercado Pago aqui. */
window.COMPLEXO_CONFIG = {
  SUPABASE_URL: "https://wsljlvbmqifgdfqznwgi.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzbGpsdmJtcWlmZ2RmcXpud2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTI2ODUsImV4cCI6MjEwNzU2ODY4NX0.RCw4hFlZHONWcSCOJg-SBojVV_dQcVZv1WWYhQpMTjE",
  FUNCTIONS_BASE_URL: "https://kgidkxaqvgcqiqwqxvut.supabase.co/functions/v1",
  SERVER_STATUS_FUNCTION: "server-status",
  CREATE_PAYMENT_FUNCTION: "create-payment",
  PAYMENT_STATUS_FUNCTION: "payment-status"
};
