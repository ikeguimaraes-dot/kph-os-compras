export const runtime="nodejs";
const headers={"Access-Control-Allow-Origin":"https://kph-os.vercel.app","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
export async function OPTIONS(){return new Response(null,{status:204,headers});}
export async function POST(){return Response.json({error:"Importação descontinuada. Fichas e custos vêm da API do Everest, sincronizada pelo Financeiro."},{status:410,headers});}
