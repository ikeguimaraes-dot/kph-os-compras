import {authenticateApi} from '@kph/auth/api';
import {getAutomation} from '@/lib/compras/automacao-actions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Access-Control-Allow-Origin':'https://kph-os.vercel.app','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Credentials':'true','Cache-Control':'no-store','Vary':'Origin'};
export async function OPTIONS(){return new Response(null,{status:204,headers});}
export async function GET(request:Request){
 if(!await authenticateApi())return Response.json({error:'Autenticação necessária'},{status:401,headers});
 const unit=new URL(request.url).searchParams.get('casa');
 try{return Response.json(await getAutomation(unit),{headers});}
 catch{return Response.json({error:'Não foi possível consultar as casas autorizadas.'},{status:400,headers});}
}
