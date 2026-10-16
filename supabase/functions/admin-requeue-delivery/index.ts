import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":Deno.env.get("STORE_ORIGIN")??"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Método não permitido"},405);
 const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"Autenticação necessária"},401);
 const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const userClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"",{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userErr}=await userClient.auth.getUser();if(userErr||!user)return json({error:"Sessão inválida"},401);
 const admin=createClient(url,service);const {data:grant,error:grantErr}=await admin.from("store_admins").select("user_id").eq("user_id",user.id).maybeSingle();if(grantErr||!grant)return json({error:"Acesso administrativo não autorizado"},403);
 let body:any;try{body=await req.json()}catch{return json({error:"JSON inválido"},400)}const id=String(body.job_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"ID da entrega inválido"},400);
 const {data:job,error}=await admin.from("delivery_jobs").select("id,order_id,status").eq("id",id).maybeSingle();if(error||!job)return json({error:"Entrega não encontrada"},404);if(job.status!=="failed")return json({error:"Somente entregas com falha podem ser reenfileiradas."},409);
 const {error:updateErr}=await admin.from("delivery_jobs").update({status:"pending",last_error:null,updated_at:new Date().toISOString()}).eq("id",id).eq("status","failed");if(updateErr)return json({error:"Não foi possível reenfileirar a entrega."},500);
 await admin.from("store_orders").update({status:"delivery_pending",updated_at:new Date().toISOString()}).eq("id",job.order_id);
 return json({ok:true,status:"pending",message:"Entrega voltou à fila. A confirmação real depende do recurso do servidor FiveM."});
});