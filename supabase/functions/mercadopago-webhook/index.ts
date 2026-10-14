import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-signature, x-request-id","Access-Control-Allow-Methods":"POST, GET, OPTIONS","Content-Type":"application/json"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
function parseSignature(value:string){const out:Record<string,string>={};for(const part of value.split(",")){const [k,v]=part.trim().split("=");if(k&&v)out[k]=v;}return out;}
async function verifySignature(req:Request,secret:string,paymentId:string){const sig=parseSignature(req.headers.get("x-signature")||"");const requestId=req.headers.get("x-request-id")||"";if(!sig.ts||!sig.v1||!requestId||!paymentId)return false;const manifest=`id:${paymentId.toLowerCase()};request-id:${requestId};ts:${sig.ts};`;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(manifest)));const digest=[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");if(digest.length!==sig.v1.length)return false;let diff=0;for(let i=0;i<digest.length;i++)diff|=digest.charCodeAt(i)^sig.v1.charCodeAt(i);return diff===0;}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST"&&req.method!=="GET")return json({error:"Método não permitido"},405);
  const url=new URL(req.url);let paymentId=url.searchParams.get("data.id")||url.searchParams.get("id")||"";let body:any={};if(req.method==="POST"){body=await req.json().catch(()=>({}));paymentId=paymentId||String(body?.data?.id||body?.id||"");}
  if(!paymentId)return json({received:true,ignored:true});const token=Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"),secret=Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");if(!token||!secret)return json({error:"Webhook não configurado"},503);
  if(!await verifySignature(req,secret,paymentId))return json({error:"Assinatura inválida"},401);
  const mpRes=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${token}`}});const payment:any=await mpRes.json().catch(()=>({}));if(!mpRes.ok)return json({error:"Não foi possível consultar pagamento no provedor"},502);
  const orderId=String(payment.external_reference||payment.metadata?.order_id||"");if(!orderId)return json({received:true,ignored:true});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);const {data:order,error}=await admin.from("store_orders").select("id,amount,status,fivem_id,items,provider_payment_id").eq("id",orderId).maybeSingle();if(error||!order)return json({error:"Pedido não encontrado"},404);
  if(String(order.provider_payment_id||payment.id)!==String(payment.id))return json({error:"ID do pagamento não corresponde ao pedido"},409);
  const approved=payment.status==="approved"&&Number(payment.transaction_amount)===Number(order.amount)&&payment.currency_id==="BRL";
  if(approved){
    if(order.status!=="paid"&&order.status!=="delivery_pending"&&order.status!=="delivered"){
      const {error:jobError}=await admin.from("delivery_jobs").upsert({order_id:order.id,fivem_id:order.fivem_id,items:order.items,status:"pending",updated_at:new Date().toISOString()},{onConflict:"order_id",ignoreDuplicates:true});if(jobError)return json({error:"Pagamento aprovado, mas fila de entrega não pôde ser criada"},500);
      await admin.from("store_orders").update({status:"delivery_pending",provider_status:"approved",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",order.id);
    }
  }else if(["rejected","cancelled","refunded","charged_back"].includes(String(payment.status))){await admin.from("store_orders").update({status:payment.status==="refunded"?"refunded":"failed",provider_status:String(payment.status),updated_at:new Date().toISOString()}).eq("id",order.id);}
  return json({received:true});
});
