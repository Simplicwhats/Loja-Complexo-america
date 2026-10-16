import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": Deno.env.get("STORE_ORIGIN") ?? "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); if(req.method!=="POST")return json({error:"Método não permitido"},405);
  const mpToken=Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"); if(!mpToken)return json({error:"Pagamento não configurado no backend. Nenhuma cobrança foi criada."},503);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader=req.headers.get("Authorization")||""; if(!authHeader.startsWith("Bearer "))return json({error:"Faça login com Discord para comprar."},401);
  const userClient=createClient(supabaseUrl,Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"",{global:{headers:{Authorization:authHeader}}});
  const {data:{user},error:userErr}=await userClient.auth.getUser(); if(userErr||!user)return json({error:"Sessão inválida. Entre novamente com Discord."},401);
  let body:any;try{body=await req.json()}catch{return json({error:"JSON inválido"},400)}
  const fivemId=String(body.fivem_id||"");const email=String(body.payer_email||"").trim().toLowerCase();const rawItems=body.items;
  if(!/^[0-9]{1,12}$/.test(fivemId))return json({error:"Passaporte FiveM inválido"},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"E-mail de pagamento inválido"},400);
  if(!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>20)return json({error:"Carrinho inválido"},400);
  const items=[];let amount=0;
  const admin=createClient(supabaseUrl,serviceKey);
  const requestedNames=[...new Set(rawItems.map((item:any)=>String(item?.name||"")))];
  if(requestedNames.some((n:string)=>!n))return json({error:"Produto inválido no carrinho"},400);
  const {data:dbProducts,error:catalogError}=await admin.from("store_products").select("name,price,product_type,active").in("name",requestedNames);
  if(catalogError)return json({error:"Não foi possível validar o catálogo no servidor."},503);
  const byName=new Map((dbProducts||[]).map((p:any)=>[p.name,p]));
  for(const item of rawItems){const name=String(item?.name||"");const product:any=byName.get(name);if(!product||!product.active||String(item?.type)!==product.product_type)return json({error:`Produto indisponível ou inválido: ${name}`},400);items.push({name,type:product.product_type,unit_price:Number(product.price),quantity:1});amount+=Number(product.price);}
  const {data:order,error:insertError}=await admin.from("store_orders").insert({user_id:user.id,fivem_id:fivemId,payer_email:email,items,amount,status:"pending",provider:"mercadopago"}).select("id,amount").single();
  if(insertError||!order)return json({error:"Não foi possível registrar o pedido. Nenhuma cobrança foi criada."},500);
  const idempotency=crypto.randomUUID();const origin=Deno.env.get("STORE_ORIGIN")||"https://example.invalid";const webhookUrl=`${supabaseUrl}/functions/v1/mercadopago-webhook`;
  const mpPayload={transaction_amount:Number(amount.toFixed(2)),description:`Complexo América RP — pedido ${order.id}`,payment_method_id:"pix",external_reference:order.id,payer:{email},notification_url:webhookUrl,metadata:{order_id:order.id,user_id:user.id,fivem_id:fivemId}};
  let mpResponse:Response;try{mpResponse=await fetch("https://api.mercadopago.com/v1/payments",{method:"POST",headers:{Authorization:`Bearer ${mpToken}`,"Content-Type":"application/json","X-Idempotency-Key":idempotency},body:JSON.stringify(mpPayload)});}catch{await admin.from("store_orders").update({status:"failed",provider_status:"creation_network_error"}).eq("id",order.id);return json({error:"Não foi possível conectar ao provedor de pagamento."},502)}
  const payment:any=await mpResponse.json().catch(()=>({}));if(!mpResponse.ok||!payment.id||!payment.point_of_interaction?.transaction_data?.qr_code){await admin.from("store_orders").update({status:"failed",provider_status:String(payment.message||payment.error||"creation_failed").slice(0,200)}).eq("id",order.id);return json({error:"O provedor recusou a criação do PIX. Nenhuma cobrança utilizável foi criada."},502)}
  const {error:updateError}=await admin.from("store_orders").update({provider_payment_id:String(payment.id),provider_status:String(payment.status||"pending")}).eq("id",order.id);
  if(updateError)return json({error:"Pagamento criado, mas não foi possível registrar a referência. Contate o suporte antes de tentar novamente.",order_id:order.id},500);
  return json({order_id:order.id,amount:Number(amount.toFixed(2)),qr_code:payment.point_of_interaction.transaction_data.qr_code,qr_code_base64:payment.point_of_interaction.transaction_data.qr_code_base64||null,provider_status:payment.status},201);
});
