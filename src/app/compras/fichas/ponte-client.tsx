"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { decidePonte, getPonte, searchFichas, type PonteData, type PonteRow, type FichaOption } from "./actions";
import "./ponte.css";
const money = (v: number) => Number(v).toLocaleString("pt-BR", {style:"currency",currency:"BRL",maximumFractionDigits:0});
const pct = (a: number,b: number) => b ? 100*a/b : 0;
export default function PonteClient({units}:{units:{id:string;name:string}[]}) {
  const [unit,setUnit]=useState(units.find(u=>u.name==="Meet & Eat")?.id ?? units[0]?.id ?? "");
  const [status,setStatus]=useState("pendente");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [data,setData]=useState<PonteData|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState<string|null>(null);
  const request=useRef(0);
  useEffect(()=>{
    const id=++request.current;
    if(!unit){setLoading(false);return;}
    setLoading(true);setError("");
    const timer=setTimeout(()=>{getPonte(unit,status,search,page).then(d=>{if(id===request.current)setData(d);}).catch(e=>{if(id===request.current)setError(e.message);}).finally(()=>{if(id===request.current)setLoading(false);});},200);
    return ()=>{clearTimeout(timer);request.current++;};
  },[unit,status,search,page,revision]);
  async function decide(row:PonteRow,next:string,ficha:string|null){
    setBusy(row.id);setError("");
    try{await decidePonte({id:row.id,unitId:unit,status:next,fichaId:ficha,version:row.atualizado_em});setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar.");}
    finally{setBusy(null);}
  }
  return <main className="ponte-page">
    <Link href="/compras/prisma">← Prisma de Compras</Link>
    <header><p className="ponte-eyebrow">COMPRAS · QUALIDADE DA BASE</p><h1>O que vendemos.<br/>A ficha que explica o custo.</h1><p>Confirme os pares por casa, começando pela maior receita. Custo e ficha vêm do Everest; quantidade e receita, do Lorean.</p></header>
    <div className="ponte-toolbar"><label>Casa<select value={unit} onChange={e=>{setUnit(e.target.value);setPage(0);setData(null);}}>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Buscar produto<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Nome registrado na venda"/></label></div>
    {data&&<section className="ponte-coverage" aria-label="Cobertura da receita"><div><strong>{pct(data.resolvida,data.total).toFixed(1)}%</strong><span> da receita revisada · meta 90%</span></div><progress max={100} value={pct(data.resolvida,data.total)} aria-label="Receita revisada"/><p>{pct(data.confirmada,data.total).toFixed(1)}% com ficha confirmada · {money(data.total)} de receita em 12 meses · {data.pendentes} pendentes</p><small>“Sem ficha” resolve a fila, mas não entra no cálculo de consumo teórico. A classificação de âncoras permanece provisória enquanto a cobertura for insuficiente.</small></section>}
    <nav className="ponte-tabs" aria-label="Situação dos pares">{[["pendente","Pendentes"],["confirmado","Confirmados"],["sem_ficha","Sem ficha"],["rejeitado","Rejeitados"]].map(([value,label])=><button key={value} aria-pressed={status===value} onClick={()=>{setStatus(value!);setPage(0);}}>{label}</button>)}</nav>
    {error&&<p role="alert" className="ponte-error">{error}</p>}
    {loading?<p role="status">Carregando a fila…</p>:!data?.rows.length?<p>Nenhum produto nesta seleção.</p>:<div>{data.rows.map(row=><PonteCard key={row.id+row.atualizado_em} row={row} unit={unit} disabled={busy!==null} onDecide={(next,ficha)=>decide(row,next,ficha)} />)}</div>}
    <footer className="ponte-toolbar"><button disabled={loading||page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} · {data?.count??0} produtos</span><button disabled={loading||(page+1)*40>=(data?.count??0)} onClick={()=>setPage(p=>p+1)}>Próxima</button></footer>
  </main>;
}
function PonteCard({row,unit,disabled,onDecide}:{row:PonteRow;unit:string;disabled:boolean;onDecide:(status:string,ficha:string|null)=>Promise<void>}){
  const [selected,setSelected]=useState(row.ficha_id??"");
  const [term,setTerm]=useState("");
  const [options,setOptions]=useState<FichaOption[]>([]);
  const [error,setError]=useState("");
  const [searching,setSearching]=useState(false);
  async function find(){setSearching(true);setError("");try{setOptions(await searchFichas(unit,term));}catch(e){setError(e instanceof Error?e.message:"Falha na busca.");}finally{setSearching(false);}}
  const choices=new Map((row.sugestoes??[]).map(s=>[s.ficha_id,{id:s.ficha_id,label:`${s.nome} · ${(100*s.similaridade).toFixed(0)}% de semelhança`} ]));
  for(const o of options)choices.set(o.ficha_id,{id:o.ficha_id,label:o.descricao});
  if(row.ficha_id&&!choices.has(row.ficha_id))choices.set(row.ficha_id,{id:row.ficha_id,label:"Ficha confirmada manualmente"});
  return <article className="ponte-card"><div className="ponte-card-head"><div><h2>{row.nome_venda_original||row.nome_venda}</h2><p>{Number(row.qtd_12m).toLocaleString("pt-BR")} vendidos · {row.origem==="manual"?"Revisão humana":"Sugestão automática"}</p></div><strong>{money(row.receita_12m)}</strong></div>
    <label>Ficha do Everest<select value={selected} disabled={disabled} onChange={e=>setSelected(e.target.value)}><option value="">Escolha uma ficha</option>{[...choices.values()].map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    <details><summary>Buscar outra ficha desta casa</summary><div className="ponte-search"><input aria-label={`Buscar ficha para ${row.nome_venda}`} placeholder="Nome da ficha" value={term} onChange={e=>setTerm(e.target.value)}/><button onClick={find} disabled={searching||disabled}>{searching?"Buscando…":"Buscar"}</button></div>{options.length>0&&<p>{options.length} opções adicionadas ao seletor acima.</p>}{error&&<p role="alert">{error}</p>}</details>
    <div className="ponte-actions">{row.status==="pendente"?<><button className="ponte-primary" disabled={disabled||!selected} onClick={()=>onDecide("confirmado",selected)}>Confirmar ficha</button><button disabled={disabled} onClick={()=>onDecide("sem_ficha",null)}>Sem ficha</button><button disabled={disabled} onClick={()=>onDecide("rejeitado",null)}>Rejeitar</button></>:<button disabled={disabled} onClick={()=>onDecide("pendente",null)}>Desfazer e revisar</button>}</div>
  </article>;
}
