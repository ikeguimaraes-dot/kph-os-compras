'use client';
import {ArrowUpRight,Factory,Truck,Warehouse,GitBranch} from 'lucide-react';
import {houseColors,houseShare,num,stamp,type TwinNetwork,type TwinHouse,type ScaleBasis,type RouteMode} from './model';
const money=(n:number)=>'R$ '+num(n,2);
export default function NetworkPanel({network,houses,facility,basis,mode,onSelect}:{network:TwinNetwork;houses:TwinHouse[];facility:string|null;basis:ScaleBasis;mode:RouteMode;onSelect:(id:string)=>void}){
 const supplier=network.suppliers.find(s=>s.id===facility);
 const metric=basis==='itemssold'?'itemssold':'revenue';
 const total=network.comparison.reduce((s,h)=>s+h[metric],0);
 const start=network.period.from.split('-').reverse().slice(0,2).join('/');const end=network.period.to.split('-').reverse().slice(0,2).join('/');
 return <>
  <div className="atlas-panel-top"><span className="atlas-eyebrow">{supplier?'ORIGEM DO ABASTECIMENTO':facility==='factory'?'O CENTRO DA TRANSFORMAÇÃO':'O PESO DE CADA CASA'}</span><span className="atlas-panel-symbol">{supplier?<Truck size={18}/>:facility==='factory'?<Factory size={18}/>:<GitBranch size={18}/>}</span></div>
  {supplier?<>
   <h2>{supplier.label}</h2><p className="atlas-panel-description">{supplier.name}</p>
   <div className="atlas-data-badge"><span className="atlas-live-dot"/> NOTAS EVEREST <span>{start} — {end}/26</span></div>
   <div className="atlas-item-kpi"><span>Compra registrada neste recorte</span><strong className="atlas-money">{money(supplier.spend)}</strong></div>
   <div className="atlas-mini-stats"><div><strong>{num(supplier.kg/1000,2)}<small> t</small></strong><span>linhas convertidas em KG</span></div><div><strong>{supplier.invoices}</strong><span>notas identificadas</span></div></div>
   <div className="atlas-section-title">Destino nas notas <span>{supplier.houses.length} CASAS</span></div>
   <div className="atlas-supplier-destinations">{supplier.houses.map(link=><button key={link.unit_id} onClick={()=>onSelect(link.unit_id)}><span>{houses.find(h=>h.id===link.unit_id)?.name}<small>{link.invoices} notas · {num(link.kg)} KG</small></span><b>{money(link.spend)}</b><ArrowUpRight size={13}/></button>)}</div>
   <div className="atlas-section-title">Volumes por unidade</div><div className="atlas-unit-volumes">{supplier.volumes.map(v=><span key={v.unit}><strong>{num(v.quantity)}</strong>{v.unit}</span>)}</div>
   <p className="atlas-small-note">KG, litros e unidades ficam separados. Conversões conforme referências de nota marcadas válidas na base. Cadastro agrupado pela raiz do CNPJ.</p>
   <div className="atlas-quiet-callout"><p><strong>{mode==='fabrica'?'Passagem pela fábrica: cenário':'Fornecedor e casa: vínculo documental'}</strong><span>Notas comprovam a relação comercial. Caminho, veículos e frequência são uma animação, sem rastreamento de entrega.</span></p></div>
  </>:facility==='factory'?<>
   <h2>Onde o insumo<br/>vira operação.</h2><p className="atlas-panel-description">Fábrica KPH. Recebimento, conservação, transformação e expedição em um único corte.</p>
   <span className="atlas-chip">FLUXO CONCEITUAL · SEM TELEMETRIA</span>
   <div className="atlas-factory-stages">{[{title:'01 / Receber',text:'Docas para matéria-prima e conferência das notas.',Icon:Truck},{title:'02 / Preservar',text:'Estoque seco e câmaras frias para organizar a reserva.',Icon:Warehouse},{title:'03 / Transformar',text:'Bancadas, cocção e esteira de produção.',Icon:Factory},{title:'04 / Distribuir',text:'Expedição das bases para cada casa.',Icon:GitBranch}].map(({title,text,Icon})=><div key={title}><Icon size={20}/><p><strong>{title}</strong><span>{text}</span></p></div>)}</div>
   <div className="atlas-quiet-callout"><p><strong>Próxima conexão: produção central</strong><span>Unidade ERP, ordens e transferências da fábrica ainda não estão vinculadas neste Atlas. Não atribuí faturamento, estoque nem capacidade a ela.</span></p></div>
   <p className="atlas-small-note">“Via fábrica” mostra como a cadeia pode ser visualizada. “Relações nas notas” conecta fornecedores às casas documentadas, sem supor trânsito pela central.</p>
  </>:<>
   <h2>O tamanho<br/>do que acontece.</h2><p className="atlas-panel-description">A área de cada casa na maquete acompanha sua participação. Troque receita por itens vendidos.</p>
   <div className="atlas-item-kpi"><span>{metric==='revenue'?'Receita bruta':'Itens vendidos'} · dias comparáveis</span><strong className="atlas-money">{metric==='revenue'?money(total):num(total,0)}</strong><p>{network.commonDays} dias comuns na base comparável<br/>{start} a {end}/{network.period.to.slice(0,4)} · dias não consecutivos</p></div>
   <div className="atlas-share-stack" aria-label={metric==='revenue'?'Participação na receita bruta':'Participação nos itens vendidos'}>{houses.map((h,i)=><i key={h.id} style={{width:`${(houseShare(network,h.id,metric)??0)*100}%`,background:houseColors[i]}}/>)}</div>
   <div className="atlas-revenue-list">{houses.map((h,i)=>{const row=network.comparison.find(r=>r.id===h.id);return <button key={h.id} onClick={()=>onSelect(h.id)}><span className="atlas-revenue-dot" style={{background:houseColors[i]}}/><span>{h.name}<small>{metric==='revenue'?money(row?.revenue??0):`${num(row?.itemssold,0)} itens vendidos`}</small></span><strong>{num((houseShare(network,h.id,metric)??0)*100)}<small>%</small></strong></button>;})}</div>
   <p className="atlas-small-note">Lorean: mesmos dias, sem dias suspeitos, turnos sobrepostos ou turnos sem detalhamento de produtos. Receita bruta observada, não faturamento contábil. A área representa participação, não metragem real.</p>
   <div className="atlas-section-title">Quem abastece o grupo <span>RECORTE</span></div>
   <div className="atlas-supplier-links">{network.suppliers.map(s=><button key={s.id} onClick={()=>onSelect(s.id)}><Truck size={14}/><span>{s.label}</span><ArrowUpRight size={13}/></button>)}</div>
   <p className="atlas-small-note">WEW e Guidara + os dois maiores volumes em KG entre os demais fornecedores nas referências consultadas. Compras: janela de {network.period.days} dias.</p>
  </>}
  <div className="atlas-data-badge"><span className="atlas-live-dot"/> CAPTURA LOCAL <span>{stamp(network.capturedAt)}</span></div>
 </>;
}
