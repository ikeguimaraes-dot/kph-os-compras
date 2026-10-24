import Link from 'next/link';
import { comprasAccess } from '@/lib/compras/everest-access';
import '../planejamento.css';
import { consolidateConsumption } from '@/lib/compras/consumo-consolidado';
export const dynamic='force-dynamic';
type Unit={id:string;name:string;d4:number;d8:number;d12:number;atualizado_em:string|null;documentos:number;ultimo_pdv?:string|null};
type Item={unit_id:string;item:number;nome:string;unidade:string;subgrupo?:string|null;q4:number|null;q8:number|null;q12:number|null;w4:number|null;w8:number|null;w12:number|null;pendencias:number};
type Data={as_of:string;units:Unit[];items:Item[]};
const fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const value=(v:number|null)=>v===null?'A confirmar':fmt.format(v);
export default async function ConsumoPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams;
 const {db,unitIds}=await comprasAccess(typeof q.casa==='string'&&q.casa?q.casa:null);
 const {data:raw,error}=await db.rpc('compras_consumo_everest',{p_unit_ids:unitIds});
 if(error||!raw||!Array.isArray(raw.units)||!Array.isArray(raw.items))return <main><h1>Consumo registrado no Everest</h1><p>Consulta temporariamente indisponível. Não utilizar zero como consumo.</p><Link href="/compras">Voltar</Link></main>;
 const data=raw as Data;
 const term=typeof q.q==='string'?q.q.trim().toLocaleLowerCase('pt-BR'):'';
 const consolidated=q.visao==='grupo';
 const source=consolidated?consolidateConsumption(data.units,data.items):data.items;
 const category=typeof q.tipo==='string'?q.tipo:'materiais';
 const classified=source.filter(i=>category==='todos'||(category==='materiais'?/^MP[AB]\./.test(i.subgrupo??''):category==='producao'?i.subgrupo==='PRODUCAO':!/^MP[AB]\./.test(i.subgrupo??'')&&i.subgrupo!=='PRODUCAO'));
 const items=classified.filter(i=>!term||`${i.nome} ${i.item}`.toLocaleLowerCase('pt-BR').includes(term));
 const page=Math.max(1,Math.min(Math.ceil(items.length/60)||1,Number.parseInt(String(q.p??'1'),10)||1));
 const href=(p:number)=>'/compras/consumo?'+new URLSearchParams({q:term,tipo:category,visao:consolidated?'grupo':'casas',casa:typeof q.casa==='string'?q.casa:'',p:String(p)});
 return <main style={{maxWidth:1100,margin:'0 auto',padding:16}}>
  <Link href="/compras">← Compras</Link> · <Link href="/compras/estoque/everest">Estoque por depósito</Link>
  <h1 style={{fontSize:28,margin:'18px 0 8px'}}>Consumo registrado no Everest</h1>
  <p>Baixas registradas pela integração do PDV, separadas pela classificação do catálogo Everest. Documentos cancelados e transferências ficam fora do consumo exibido.</p>
  <div className="plan-notice">Comparação histórica de 4, 8 e 12 semanas até o dia anterior a {data.as_of.split('-').reverse().join('/')}. Estas médias não corrigem os dias de 86 e não são previsão de vendas nem quantidade líquida de compra. A importação completa comprova a leitura da API; a conferência de todos os turnos do PDV continua necessária.</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,margin:'18px 0'}}>
   {data.units.map(u=><article key={u.id} style={{border:'1px solid var(--border, #888)',borderRadius:12,padding:16}}>
    <h2>{u.name}</h2><p>Períodos importados: {u.d4}/28 · {u.d8}/56 · {u.d12}/84 dias</p>
    <small>{u.documentos} documentos no período, incluindo outros tipos e cancelados.</small>
    <p>{u.atualizado_em?'Última janela recebida: '+new Date(u.atualizado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Aguardando importação'}</p>
    <p>Última baixa PDV recebida: {u.ultimo_pdv?u.ultimo_pdv.split('-').reverse().join('/'):'A confirmar'}</p>
    <Link href={'/compras/consumo?casa='+u.id}>Ver esta casa</Link>
   </article>)}
  </div>
  <p><Link href="/compras/consumo?visao=grupo">Consolidado das casas autorizadas</Link> · <Link href="/compras/consumo">Detalhar por casa</Link></p>
  {consolidated&&<p>Itens somados por código Everest e unidade de medida. A média consolidada só aparece com cobertura completa das {data.units.length} casas desta consulta.</p>}
  <form method="get" style={{display:'flex',gap:12,flexWrap:'wrap',margin:'18px 0'}}>
   <input type="hidden" name="visao" value={consolidated?"grupo":"casas"}/>
   <input type="hidden" name="casa" value={typeof q.casa==='string'?q.casa:''}/>
   <label>Catálogo <select name="tipo" defaultValue={category} style={{padding:8}}><option value="materiais">Matérias-primas e bebidas (MPA/MPB)</option><option value="producao">Produção interna</option><option value="outros">Venda e demais classificações</option><option value="todos">Todos os lançamentos</option></select></label>
   <label>Buscar item <input name="q" defaultValue={term} placeholder="Nome ou código" style={{padding:8,border:'1px solid #888',borderRadius:6}}/></label>
   <button type="submit" style={{padding:8,border:'1px solid #888',borderRadius:6}}>Buscar</button>
   <Link href="/compras/consumo">Todas as casas</Link>
  </form>
  <p>{source.length-classified.length} itens de outras classificações fora deste filtro. Pratos vendidos e preparações não viram compras de ingredientes automaticamente.</p>
  {!items.length&&<p>Nenhum item neste filtro. Confira a cobertura acima; histórico ausente não equivale a consumo zero.</p>}
  <p>{items.length} combinações de casa, ingrediente e unidade · página {page}</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
   {items.slice((page-1)*60,page*60).map(i=><article key={`${i.unit_id}:${i.item}:${i.unidade}`} style={{border:'1px solid var(--border, #888)',borderRadius:12,padding:16}}>
    <small>{consolidated?'Consolidado das casas desta consulta':data.units.find(u=>u.id===i.unit_id)?.name} · Item {i.item} · {i.subgrupo??'Classificação pendente'}</small><h2>{i.nome}</h2>
    <p>Média semanal registrada ({i.unidade})</p>
    <p>4 semanas: <strong>{value(i.w4)}</strong></p><p>8 semanas: <strong>{value(i.w8)}</strong></p><p>12 semanas: <strong>{value(i.w12)}</strong></p>
    <small>Total válido recebido em até 12 semanas: {value(i.q12)} {i.unidade}</small>
    {i.pendencias>0&&<p>{i.pendencias} lançamentos exigem validar unidade, sinal ou tipo da baixa.</p>}
    <p>Quantidade a comprar: <strong>A confirmar</strong></p>
   </article>)}
  </div>
  <nav style={{display:'flex',gap:24,marginTop:20}} aria-label="Paginação">{page>1&&<Link href={href(page-1)}>← Anterior</Link>}{page*60<items.length&&<Link href={href(page+1)}>Próxima →</Link>}</nav>
 </main>;
}
