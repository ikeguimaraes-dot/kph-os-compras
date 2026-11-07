'use client';
import {useState,type ReactNode} from 'react';
import type {AtlasOrder} from '@/lib/atlas/model';
import {Tags,Users,ArrowRight,ArrowUpRight,Box,Check,ChevronLeft,ChevronRight,Clock3,Compass,Expand,Factory,GitBranch,Layers3,Minus,Moon,MoveUpRight,Package,Pause,Play,Plus,RotateCcw,Search,ShieldCheck,Sun,Truck,Warehouse,X} from 'lucide-react';
import Scene from './Scene';
import NetworkPanel from './NetworkPanel';
import ActivityPanel from './ActivityPanel';
import {houseColors,houseShare,num,projectedConsumption,stamp,stockUsable,visualZone,zones,type TwinData,type TwinItem,type Layer,type Zone,type ScaleBasis,type RouteMode} from './model';
import './atlas.css';

const days=['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const chain=['Fornecedor','Recebimento','Estoque','Produção','Venda'];
export default function DigitalTwin({data,embedded=false,version='V.03',initialOverview=false,initialHouse,operationalOrders,onOperationalSelect,operationalPanel}:{data:TwinData;embedded?:boolean;version?:string;initialOverview?:boolean;initialHouse?:string;operationalOrders?:AtlasOrder[];onOperationalSelect?:(id:string)=>void;operationalPanel?:ReactNode}){
 const houses=[...data.houses].sort((a,b)=>['Meet & Eat','Frêneze','Madonna SP Itaim','Match Point'].indexOf(a.name)-['Meet & Eat','Frêneze','Madonna SP Itaim','Match Point'].indexOf(b.name));
 const [weekday,setWeekday]=useState(6);
 const [showLabels,setShowLabels]=useState(false);
 const [basis,setBasis]=useState<ScaleBasis>('revenue');
 const [routeMode,setRouteMode]=useState<RouteMode>(operationalOrders?'pedidos':'fabrica');
 const [facility,setFacility]=useState<string|null>(null);
 const [speed,setSpeed]=useState(1);
 const [houseId,setHouseId]=useState<string|null>(initialHouse??(initialOverview?null:houses[0]?.id??null));
 const [zone,setZone]=useState<Zone|null>(initialOverview?null:'salao');
 const [layer,setLayer]=useState<Layer>('operacao');
 const [night,setNight]=useState(false);
 const [animate,setAnimate]=useState(true);
 const [reset,setReset]=useState(0);
 const [zoom,setZoom]=useState(0);
 const [immersive,setImmersive]=useState(false);
 const [help,setHelp]=useState(false);
 const [query,setQuery]=useState('');
 const [item,setItem]=useState<TwinItem|null>(null);
 const [future,setFuture]=useState(0);
 const [chainStep,setChainStep]=useState(2);
 const house=houses.find(h=>h.id===houseId)??null;
 const area=zones.find(z=>z.id===zone);
 const count=houses.reduce((s,h)=>s+h.itemCount,0);
 const matched=(house?.items??[]).filter(i=>(!zone||['recebimento','salao'].includes(zone)||visualZone(i)===zone)&&i.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
 const choose=(id:string)=>{
  onOperationalSelect?.(id);
  if(id.startsWith('order:')){setFacility(id);setHouseId(null);setItem(null);return;}
  if(id==='factory'||data.network?.suppliers.some(s=>s.id===id)){setFacility(id);setHouseId(null);setZone(null);setItem(null);return;}
  setFacility(null);
  if(houses.some(h=>h.id===id)){setHouseId(id);setZone(null);setItem(null);setQuery('');}
  else{setZone(id as Zone);setItem(null);setQuery('');}
 };
 const overview=()=>{onOperationalSelect?.('group');setFacility(null);setHouseId(null);setZone(null);setItem(null);setQuery('');setFuture(0);};
 const forecast=item?projectedConsumption(item,data.capturedAt,future):null;
 const usable=item?stockUsable(item,data.capturedAt):false;
 const sampleValid=(house?.items??[]).filter(i=>stockUsable(i,data.capturedAt)).length;
 return <section aria-label="Atlas" className={`atlas atlas-v3 ${embedded?'atlas-embedded':''} ${!house?'atlas-network':''} ${night?'atlas-night':''} ${immersive?'atlas-immersive':''}`}>
  <header className="atlas-header">
   <button className="atlas-wordmark" onClick={overview} aria-label="GHOST Atlas — visão do grupo"><span className="atlas-orbit"><i/><b/></span>ghost<span className="atlas-wordmark-divider"/> <span className="atlas-product">ATLAS<span>OPERAÇÃO EM PERSPECTIVA</span></span></button>
   <div className="atlas-header-center"><span className="atlas-live-dot"/> {operationalOrders?'OPERAÇÃO + HISTÓRICO':embedded?'LEITURA HISTÓRICA':'LABORATÓRIO LOCAL'} <span className="atlas-version">{version}</span></div>
   <div className="atlas-header-actions"><button className="atlas-text-button" onClick={()=>setHelp(true)}>Como explorar <ArrowUpRight size={14}/></button></div>
  </header>
  <div className="atlas-workspace">
   <nav className="atlas-rail" aria-label="Modos de exploração">
    <button title="Visão do grupo" aria-label="Visão do grupo" className={!house?'active':''} onClick={overview}><Compass size={21}/></button>
    <span className="rail-divider"/>
    <button title="Operação" aria-label="Camada operação" className={layer==='operacao'?'active':''} onClick={()=>setLayer('operacao')}><Factory size={21}/></button>
    <button title="Estoques" aria-label="Camada estoques" className={layer==='estoque'?'active':''} onClick={()=>{setLayer('estoque');if(house)setZone('estoque');}}><Warehouse size={21}/></button>
    <button title="Fluxo logístico" aria-label="Camada fluxo logístico" className={layer==='fluxo'?'active':''} onClick={()=>setLayer('fluxo')}><GitBranch size={21}/></button>
    <div className="atlas-rail-bottom"><button title={night?'Luz do dia':'Luz noturna'} aria-label="Alternar iluminação" onClick={()=>setNight(!night)}>{night?<Sun size={19}/>:<Moon size={19}/>}</button><span className="atlas-rail-brand">KPH</span></div>
   </nav>
   <aside className="atlas-left">
    <div className="atlas-eyebrow"><span className="atlas-tiny-line"/>{house?'DENTRO DA OPERAÇÃO':'UM NOVO PONTO DE VISTA'}</div>
    {house?<><button className="atlas-back" onClick={overview}><ChevronLeft size={14}/> Todas as casas</button><h1>{house.name=== 'Madonna SP Itaim'?'Madonna':house.name}<em>em serviço.</em></h1></>:<h1>Seu grupo,<em>em movimento.</em></h1>}
    <p className="atlas-intro">{house?'Gente à mesa. Cozinha em atividade. Cada etapa da operação acontecendo diante de você.':'Do primeiro recebimento ao último prato. Veja como tudo se conecta.'}</p>
    <div className="atlas-overview-stat"><div><strong>{num(house?.itemCount??count,0)}</strong><span>insumos e bases</span></div><div><strong>{house?'06':String(houses.length).padStart(2,'0')}</strong><span>{house?'ambientes':'casas conectadas'}</span></div></div>
    <div className="atlas-list-heading">{house?'EXPLORE OS AMBIENTES':'ESCOLHA UMA CASA'}<span>{house?'06':String(houses.length).padStart(2,'0')}</span></div>
    <div className="atlas-destinations">{house?zones.map((z,i)=><button className={zone===z.id?'selected':''} key={z.id} onClick={()=>choose(z.id)}><span className="atlas-number">0{i+1}</span><span>{z.name}<small>{z.subtitle}</small></span><ChevronRight size={15}/></button>):houses.map((h,i)=><button key={h.id} onClick={()=>choose(h.id)}><span className="atlas-house-color" style={{background:houseColors[i]}}><Factory size={16}/></span><span>{h.name}<small>{data.network?`${num((houseShare(data.network,h.id,basis==='equal'?'revenue':basis)??0)*100)}% · ${basis==='itemssold'?'itens vendidos':'receita bruta'}`:`${h.itemCount} insumos e bases`}</small></span><ArrowUpRight size={15}/></button>)}</div>
    {!house&&data.network&&<><div className="atlas-list-heading atlas-network-heading">ORIGEM E TRANSFORMAÇÃO</div><div className="atlas-network-links"><button className={facility==='factory'?'selected':''} onClick={()=>choose('factory')}><Factory size={17}/><span>Fábrica KPH<small>Produção central · cenário</small></span><ArrowUpRight size={14}/></button>{data.network.suppliers.map(s=><button className={facility===s.id?'selected':''} key={s.id} onClick={()=>choose(s.id)}><Truck size={15}/><span>{s.label}<small>{s.purchaseOnly?`R$ ${num(s.spend,0)} · compras`:`${num(s.kg/1000,2)} t · linhas em KG`}</small></span><ArrowUpRight size={14}/></button>)}</div>{facility&&<button className="atlas-clear-filter" onClick={()=>setFacility(null)}>Mostrar todos os fluxos <X size={12}/></button>}</>}
    <div className="atlas-source-note"><ShieldCheck size={17}/><p><strong>Números reais. Espaço ilustrativo.</strong><span>Everest + Lorean · {stamp(data.capturedAt)}<br/>A maquete não reproduz a planta física.</span></p></div>
   </aside>
   <section className="atlas-stage" aria-label="Exploração tridimensional">
    <div className="atlas-scene-top"><div className="atlas-breadcrumb"><span>GRUPO KPH</span><span>/</span><strong>{house?.name??(facility==='factory'?'FÁBRICA KPH':data.network?.suppliers.find(s=>s.id===facility)?.label??'ECOSSISTEMA')}</strong></div><button className="atlas-icon-button" onClick={()=>setImmersive(!immersive)} aria-label={immersive?'Mostrar painéis':'Ampliar maquete'}>{immersive?<X size={18}/>:<Expand size={18}/>}</button></div>
    <div className="atlas-scene-caption"><span className="atlas-corner"/><span>03 — {house?'CORTE OPERACIONAL':'VISÃO DO GRUPO'}<small>{house?'Selecione um ambiente para ver seus dados':'Fornecedor → fábrica → casa. Explore cada conexão.'}</small></span></div>
    {!house&&data.network&&<div className="atlas-network-controls"><label>ÁREA DAS CASAS<select aria-label="Proporção das casas" value={basis} onChange={e=>setBasis(e.target.value as ScaleBasis)}><option value="revenue">Receita bruta</option><option value="itemssold">Itens vendidos</option><option value="equal">Mesmo tamanho</option></select></label><label>FLUXO<select aria-label="Fonte do fluxo" value={routeMode} onChange={e=>setRouteMode(e.target.value as RouteMode)}>{operationalOrders&&<option value="pedidos">Pedidos reais</option>}<option value="fabrica">Via fábrica · cenário</option><option value="documentado">Relações nas notas</option></select></label></div>}
    <div className="atlas-life-controls"><div className="atlas-house-switch"><button onClick={overview} className={!house?'active':''}>Grupo</button>{houses.map(h=><button key={h.id} onClick={()=>choose(h.id)} className={house?.id===h.id?'active':''}>{h.name.replace(' SP Itaim','')}</button>)}</div><div className="atlas-day-switch"><span><Users size={12}/> DIA ILUSTRADO</span>{days.slice(1).map((d,i)=><button key={d} aria-label={`Movimento de ${d}`} aria-pressed={weekday===i+1} onClick={()=>setWeekday(i+1)}>{d}</button>)}</div></div>
    <Scene orders={operationalOrders} activity={data.activity} weekday={weekday} showLabels={showLabels} network={data.network} basis={basis} routeMode={routeMode} facility={facility} speed={speed} houses={houses} house={house} zone={zone} layer={layer} night={night} animate={animate} reset={reset} zoom={zoom} onSelect={choose}/>
    <div className="atlas-scene-bottom">
     <div className="atlas-layer-control" role="group" aria-label="Camadas da maquete">{([{id:'operacao',name:'Operação',Icon:Layers3},{id:'estoque',name:'Estoques',Icon:Box},{id:'fluxo',name:'Fluxos',Icon:Truck}] as const).map(l=><button key={l.id} className={layer===l.id?'active':''} onClick={()=>setLayer(l.id)}><l.Icon size={15}/>{l.name}</button>)}</div>
     <div className="atlas-camera-tools"><button onClick={()=>setShowLabels(!showLabels)} aria-label={showLabels?'Ocultar rótulos':'Mostrar rótulos'} aria-pressed={showLabels} title="Rótulos da maquete"><Tags size={15}/></button><button className="atlas-speed" aria-label="Velocidade da animação" onClick={()=>setSpeed(speed===1?2:speed===2?.5:1)}>{speed}×</button><button onClick={()=>setAnimate(!animate)} title={animate?'Pausar movimento ilustrativo':'Animar fluxo'} aria-label={animate?'Pausar movimento':'Animar fluxo'}>{animate?<Pause size={16}/>:<Play size={16}/>}</button><button onClick={()=>setReset(reset+1)} title="Reposicionar câmera" aria-label="Reposicionar câmera"><RotateCcw size={16}/></button><button onClick={()=>setZoom(zoom-1)} aria-label="Afastar"><Minus size={16}/></button><button onClick={()=>setZoom(zoom+1)} aria-label="Aproximar"><Plus size={16}/></button></div>
    </div>
    <div className="atlas-scene-help"><span>ARRASTE PARA GIRAR · ROLE PARA APROXIMAR</span><span>{layer==='fluxo'?'ROTAS E VEÍCULOS ILUSTRATIVOS':'MODELO ESPACIAL CONCEITUAL'}</span></div>
    {!house&&data.network?<div className="atlas-timeline atlas-network-legend"><div><span className="atlas-flow-symbol">{routeMode==='fabrica'?'┄':'━'}</span><strong>{routeMode==='pedidos'?'Cada caminhão, um pedido cadastrado.':routeMode==='fabrica'?'Da matéria-prima à mesa.':'Conexões comprovadas nas notas.'}</strong><span className="atlas-chip">{animate?'EM MOVIMENTO':'PAUSADO'}</span></div><p>{routeMode==='pedidos'?'Clique nos caminhões. Etapas simbólicas; pedidos sem destino/fornecedor comprovado ficam estacionados.':routeMode==='fabrica'?'Fornecedores → fábrica → casas. Percurso conceitual; produção e transferências da central ainda não vinculadas.':'Os destinos vêm das notas do Everest. Estradas e deslocamentos são ilustrativos; não representam rastreamento físico.'}</p><small>CAMINHÕES COM MARCAS · SEM GPS OU PRAZO INFERIDO · {data.network.commonDays} DIAS COMUNS PARA COMPARAR VENDAS</small></div>:<div className="atlas-timeline"><div className="atlas-timeline-heading"><span><Clock3 size={15}/>{future===0?'Posição da leitura':'Explorar o próximo período'}</span><strong>{future===0?stamp(data.capturedAt):`+${future} ${future===1?'dia':'dias'} · cenário`}</strong></div><div className="atlas-timeline-track"><input aria-label="Horizonte de projeção em dias" type="range" min="0" max="7" step="1" value={future} onChange={e=>setFuture(Number(e.target.value))}/><div><span>LEITURA</span><span>+1 DIA</span><span>+3 DIAS</span><span>+5 DIAS</span><span>+7 DIAS</span></div></div><p>{future?'Selecione um insumo. Projeção de consumo pela média do mesmo dia da semana, sem novas entradas.':'Snapshot consultado no banco. Não é monitoramento em tempo real.'}</p></div>}
   </section>
   <aside className="atlas-right">
    {operationalPanel&&!item?operationalPanel:!house&&data.network?<NetworkPanel network={data.network} houses={houses} facility={facility} basis={basis} mode={routeMode} onSelect={choose}/>:item?<>
     <button className="atlas-back" onClick={()=>setItem(null)}><ChevronLeft size={14}/> Voltar aos insumos</button>
     <div className="atlas-eyebrow">RASTREABILIDADE DO INSUMO</div><h2 className="atlas-item-title">{item.name.replace(/ - (KG|UN|LT)$/,'')}</h2><span className="atlas-chip">{house?.name} · {item.unit}</span>
     <div className="atlas-item-kpi"><span>Saldo ERP registrado</span><strong>{num(item.stock)}<small>{item.unit}</small></strong><p>{stamp(item.stockAt)}<br/><span className={usable?'atlas-good':'atlas-warn'}>{usable?'Utilizável na data da captura':'Não utilizável como posição atual'}</span></p></div>
     {future>0&&<div className="atlas-projection"><span>CONSUMO EM {future} {future===1?'DIA':'DIAS'}</span><strong>{num(forecast)} <small>{item.unit}</small></strong><p>{forecast===null?'Amostra insuficiente para projetar todos os dias.':usable?`Saldo teórico restante: ${num(item.stock!-forecast)} ${item.unit}. Não inclui entregas futuras.`:'Há previsão de consumo, mas o saldo não permite projetar cobertura.'}</p></div>}
     <div className="atlas-section-title">Consumo por dia da semana <span>EVEREST</span></div>
     <div className="atlas-bars">{[1,2,3,4,5,6,7].map(d=>{const m=item.means.find(m=>m.dow===d);const max=Math.max(1,...item.means.map(m=>m.quantity??0));return <div key={d} title={`${days[d]}: ${num(m?.quantity)} ${item.unit}, ${m?.samples??0} dias observados`}><span>{num(m?.quantity,0)}</span><div><i style={{height:m?.quantity==null?3:Math.max(4,m.quantity/max*65)}} className={(m?.samples??0)<4?'thin':''}/></div><small>{days[d]}</small></div>;})}</div>
     <p className="atlas-small-note">Barras claras: menos de 4 observações. Ausência de dado não é consumo zero.</p>
     <div className="atlas-section-title">O caminho deste insumo</div><div className="atlas-chain">{chain.map((s,i)=><button key={s} className={chainStep===i?'active':''} onClick={()=>setChainStep(i)}><span>0{i+1}</span>{s}</button>)}</div>
     <div className="atlas-chain-detail">{chainStep===0||chainStep===1?<>{item.references.length?item.references.map((r,i)=><div key={i}><strong>{r.supplier??'Fornecedor identificado na nota'}</strong><p>NF {r.invoice} · {r.date}<br/>R$ {num(r.price,2)} / {r.stock_unit}<br/>1 {r.purchase_unit} = {num(r.factor,3)} {r.stock_unit}</p><span className={r.consistent?'atlas-good':'atlas-warn'}>{r.consistent?'Conversão consistente':'Conversão a conciliar'}</span></div>):<p>Sem referência de nota nesta amostra.</p>}</>:chainStep===2?<p>{item.stockAt?`Saldo registrado em ${stamp(item.stockAt)}. `:'Sem posição registrada. '}Localização dentro da maquete é ilustrativa; depósito físico não está mapeado nesta V3.</p>:chainStep===3?<p>O consumo vem das baixas da integração PDV no Everest. O percurso visual não comprova uma ordem de produção.</p>:<p>Vendas Lorean são usadas na conciliação dos dias. A ligação deste insumo com cada prato ainda não está exibida neste protótipo.</p>}</div>
    </>:house?<>
     <ActivityPanel activity={data.activity} house={house} weekday={weekday} onDay={setWeekday} onSalon={()=>setZone('salao')}/>
     <div className="atlas-panel-top"><span className="atlas-eyebrow">{area?'AMBIENTE SELECIONADO':'PANORAMA DA CASA'}</span><span className="atlas-panel-symbol"><Warehouse size={18}/></span></div>
     <h2>{area?.name??'Por trás da operação.'}</h2><p className="atlas-panel-description">{area?.subtitle??'Da origem do insumo ao consumo da casa.'}</p>
     <div className="atlas-data-badge"><span className="atlas-live-dot"/> LEITURA REAL <span>{stamp(house.snapshotAt)}</span></div>
     <div className="atlas-mini-stats"><div><strong>{house.itemCount}</strong><span>insumos / bases</span></div><div><strong>{house.coverage.dias_conciliados}<small>/{house.coverage.dias_vendas}</small></strong><span>dias conciliados</span></div></div>
     <div className="atlas-quiet-callout"><span className="atlas-warning-dot"/><p><strong>{sampleValid} de {house.items.length} saldos utilizáveis</strong><span>Na amostra exibida, na data da captura. Sem inferir 85 ou 86.</span></p></div>
     <div className="atlas-section-title">Explore os insumos <span>AMOSTRA · {house.items.length}</span></div>
     <label className="atlas-search"><Search size={15}/><input aria-label="Buscar insumo na amostra" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nesta amostra"/></label>
     {zone&&<button className="atlas-clear-filter" onClick={()=>setZone(null)}>Todas as áreas <X size={12}/></button>}
     <div className="atlas-items-list">{matched.length?matched.map(i=><button key={i.id} onClick={()=>{setItem(i);setZone(visualZone(i));setChainStep(2);}}><span className="atlas-item-icon"><Package size={17}/></span><span>{i.name.replace(/ - (KG|UN|LT)$/,'')}<small>{visualZone(i)==='cozinha'?'Base de produção':'Insumo'} · {i.unit}</small></span><ArrowUpRight size={14}/></button>):<div className="atlas-empty">Nenhum insumo nesta amostra e filtro.<button onClick={()=>{setZone(null);setQuery('');}}>Ver toda a amostra <ArrowRight size={14}/></button></div>}</div>
     <p className="atlas-small-note">Distribuição por ambiente apenas visual. Não equivale a endereço de estoque cadastrado.</p>
    </>:<>
     <div className="atlas-panel-top"><span className="atlas-eyebrow">INTELIGÊNCIA OPERACIONAL</span><span className="atlas-panel-symbol"><GitBranch size={18}/></span></div>
     <h2>Tudo começa<br/>com uma conexão.</h2><p className="atlas-panel-description">{houses.length} casas autorizadas. Uma visão para acompanhar o caminho dos insumos.</p>
     <div className="atlas-data-badge"><span className="atlas-live-dot"/> SNAPSHOT REAL <span>{stamp(data.capturedAt)}</span></div>
     <div className="atlas-route-card"><div className="atlas-route-line"/><div><span className="atlas-route-icon"><Truck size={18}/></span><p><strong>Receber</strong><small>Notas e fornecedores Everest</small></p><Check size={13}/></div><div><span className="atlas-route-icon"><Warehouse size={18}/></span><p><strong>Armazenar</strong><small>Saldos com data de leitura</small></p><Check size={13}/></div><div><span className="atlas-route-icon"><Factory size={18}/></span><p><strong>Transformar</strong><small>Consumo pela integração PDV</small></p><Check size={13}/></div><div><span className="atlas-route-icon"><ArrowUpRight size={18}/></span><p><strong>Servir</strong><small>Dias conciliados com vendas</small></p><Check size={13}/></div></div>
     <div className="atlas-section-title">Cobertura de leitura <span>DIAS</span></div>
     <div className="atlas-coverage">{houses.map((h,i)=><button key={h.id} onClick={()=>choose(h.id)}><span>{h.name}<b>{h.coverage.dias_conciliados}<small> / {h.coverage.dias_vendas}</small></b></span><i><b style={{width:`${h.coverage.dias_conciliados/Math.max(1,h.coverage.dias_vendas)*100}%`,background:houseColors[i]}}/></i></button>)}</div>
     <div className="atlas-next-step"><span>COMECE POR AQUI</span><button onClick={()=>choose(houses[0]!.id)}>Entre em {houses[0]?.name} <MoveUpRight size={17}/></button><p>Clique em um ambiente, escolha um insumo e veja sua origem.</p></div>
    </>}
   </aside>
  </div>
  <footer className="atlas-footer"><span><span className="atlas-live-dot"/> ATLAS · GHOST / KPH</span><span>ESPAÇO ILUSTRATIVO · DADOS REAIS EM SNAPSHOT · SEM TELEMETRIA AO VIVO</span><button onClick={()=>setHelp(true)}>Sobre o Atlas <ArrowUpRight size={12}/></button></footer>
  {help&&<div className="atlas-modal-backdrop" onClick={()=>setHelp(false)}><section role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==='Escape')setHelp(false);if(e.key==='Tab'){const targets=e.currentTarget.querySelectorAll<HTMLButtonElement>('button');const first=targets[0],last=targets[targets.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}} aria-label="Como explorar o Atlas" className="atlas-modal" onClick={e=>e.stopPropagation()}><button autoFocus className="atlas-modal-close" onClick={()=>setHelp(false)} aria-label="Fechar instruções"><X size={21}/></button><span className="atlas-eyebrow">BEM-VINDO AO ATLAS</span><h2>Uma outra forma<br/>de ver a operação.</h2><p>Explore o grupo em 3D. Entre em uma casa, selecione um ambiente e abra um insumo para conferir sua origem.</p><ol><li><strong>Gire e aproxime.</strong> Arraste a maquete e use a roda do mouse. Os botões laterais também navegam pelas casas e áreas.</li><li><strong>Troque de camada.</strong> Operação mostra os ambientes; Estoques destaca as reservas; Fluxos ilustra o caminho do abastecimento.</li><li><strong>Explore o tempo.</strong> Selecione um insumo e avance de 1 a 7 dias para estimar consumo quando houver amostra suficiente.</li></ol><div className="atlas-modal-note">Dados reais consultados em {stamp(data.capturedAt)}. A planta, as pessoas, o atendimento, os móveis, as rotas e os veículos são ilustrativos. O seletor semanal usa clientes históricos, sem estimar ocupação ao vivo. Projeções não incluem novas entradas. Nenhuma compra ou alteração no banco é executada aqui.</div><button className="atlas-primary" onClick={()=>setHelp(false)}>Explorar a operação <ArrowRight size={16}/></button></section></div>}
 </section>;
}
