"use client";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { blockKey, costLabel, dishKey, isCritical, type MapBlock, type MapEdge, type MapSupplier } from "@/lib/compras/prisma-mapa";

const date = (s: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "Sem registro";
const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const clamp = (z: number) => Math.max(.5, Math.min(2, z));
type Props = { edges: MapEdge[]; allEdges: MapEdge[]; blocks: MapBlock[]; supplier: MapSupplier;
  units: { id: string; name: string }[]; names: Map<string, string>; today: string;
  reRoot: (root: string) => void; openSupplier: (root: string) => void; };
type Camera = { x: number; y: number; z: number };
export default function Mindmap(props: Props) {
  const { edges, allEdges, blocks, supplier, units, names, today, reRoot, openSupplier } = props;
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState<Camera>({ x: 20, y: 30, z: .75 });
  const [inverted, setInverted] = useState<MapEdge | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ camera: Camera; x: number; y: number; distance: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (inverted) dialog.current?.showModal(); }, [inverted]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      const node = (event.target as Element).closest<HTMLElement>(".mindmap-item,.mindmap-dish");
      if (!event.ctrlKey && node && node.scrollHeight > node.clientHeight) return;
      event.preventDefault();
      const bounds = el.getBoundingClientRect(), px = event.clientX - bounds.left, py = event.clientY - bounds.top;
      setCamera(c => { const z = clamp(c.z * Math.exp(-event.deltaY * .002)); return { z, x: px - (px - c.x) * z / c.z, y: py - (py - c.y) * z / c.z }; });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function startGesture() {
    const pts = [...pointers.current.values()];
    if (!pts.length) { gesture.current = null; return; }
    const a = pts[0]!, b = pts[1] ?? a;
    gesture.current = { camera, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as Element).closest("button,a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); startGesture();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()], a = pts[0]!, b = pts[1] ?? a, g = gesture.current;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const z = g.distance && pts.length > 1 ? clamp(g.camera.z * Math.hypot(a.x - b.x, a.y - b.y) / g.distance) : g.camera.z;
    const rect = e.currentTarget.getBoundingClientRect();
    setCamera({ z, x: x - rect.left - (g.x - rect.left - g.camera.x) * z / g.camera.z,
      y: y - rect.top - (g.y - rect.top - g.camera.y) * z / g.camera.z });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId); startGesture();
  }
  const items = new Map<string, MapEdge[]>();
  for (const edge of edges) {
    const key = `${edge.unit_id}:${edge.insumo_id}`;
    const list = items.get(key) ?? [];
    if (!list.some(e => dishKey(e) === dishKey(edge))) list.push(edge);
    items.set(key, list);
  }
  const layout = [...items].reduce<{ key: string; list: MapEdge[]; y: number; height: number }[]>((rows, [key, list]) => {
    const last = rows.at(-1), y = last ? last.y + last.height + 40 : 0;
    rows.push({ key, list, y, height: Math.max(300, closed.has(key) ? 300 : list.length * 210) }); return rows;
  }, []);
  const canvasHeight = (layout.at(-1)?.y ?? 0) + (layout.at(-1)?.height ?? 300);
  function ingredientInfo(e: MapEdge) {
    const old = e.ultima_compra && (Date.parse(today) - Date.parse(e.ultima_compra)) / 86400000 > 45;
    return <>
      <small>{units.find(u => u.id === e.unit_id)?.name} · INSUMO</small>
      <strong>{e.insumo}</strong>
      <span className={`map-badge ${Number(e.reserva) ? "neutral" : "amber"}`} title="Outros fornecedores unificados do item em 12m no grupo + alternativas homologadas. Fonte: v_mapa_insumo.">{Number(e.reserva) ? `${e.reserva} reservas` : "Sem reserva"}</span>
      <span className={old ? "amber" : ""} title="Maior data de compra Everest nesta casa; alerta após 45 dias.">{old ? "⚠ " : ""}Última compra {date(e.ultima_compra)}</span>
      <span>Principal 90d: {e.principal_90d ? names.get(e.principal_90d) ?? e.principal_90d : "Sem compra recente"}</span>
      {e.fornecedor_trocou && <span className="map-badge purple" title={`Principal por quantidade em 90d difere de 12m. Anual: ${names.get(e.principal_12m ?? "") ?? e.principal_12m}. Fonte: v_mapa_share.`}>Fornecedor trocou</span>}
    </>;
  }
  return <div className="mindmap-desktop">
    <div className="mindmap-tools"><p>Arraste o fundo · role ou pince para ampliar · clique no insumo para recolher · duplo clique no prato para inverter.</p>
      <button aria-label="Diminuir zoom" onClick={() => setCamera(c => ({ ...c, z: clamp(c.z - .1) }))}>−</button>
      <output aria-label="Zoom">{Math.round(camera.z * 100)}%</output>
      <button aria-label="Aumentar zoom" onClick={() => setCamera(c => ({ ...c, z: clamp(c.z + .1) }))}>+</button>
      <button onClick={() => setCamera({ x: 20, y: 30, z: .75 })}>Centralizar</button></div>
    <div className="mindmap-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Canvas de dependências. Setas movem; mais e menos ampliam." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        const dirs: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
        if (dirs[e.key]) { e.preventDefault(); const [x, y] = dirs[e.key]!; setCamera(c => ({ ...c, x: c.x + x, y: c.y + y })); }
        if (e.key === "+" || e.key === "-") { e.preventDefault(); setCamera(c => ({ ...c, z: clamp(c.z + (e.key === "+" ? .1 : -.1)) })); }
      }}>
      <div className="mindmap-stage" style={{ width: 1300, height: canvasHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
        <svg width="1300" height={canvasHeight} className="mindmap-links" aria-hidden="true">
          {layout.map(branch => <g key={branch.key}>
            <path d={`M260 140 C320 140 340 ${branch.y + 150} 400 ${branch.y + 150}`} stroke="#b5a0df" strokeWidth="2" fill="none"/>
            {!closed.has(branch.key) && branch.list.map((e, index) => <path key={dishKey(e)} d={`M720 ${branch.y + 150} C800 ${branch.y + 150} 820 ${branch.y + index * 210 + 90} 900 ${branch.y + index * 210 + 90}`} fill="none"
              stroke={blocks.some(b => blockKey(b) === dishKey(e)) ? "#ed7778" : "#89b893"} strokeWidth={e.peso_custo === null ? 2 : Math.max(.5, Number(e.peso_custo) * 30)} strokeDasharray={e.peso_custo === null ? "5 5" : undefined}/>)}</g>)}
        </svg>
        <button className="mindmap-node mindmap-root" style={{ left: 0, top: 60 }} onClick={() => openSupplier(supplier.raiz_cnpj)}><small>FORNECEDOR</small><strong>{supplier.nome}</strong>
          <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`Vencido ${money(supplier.vencido)} de ${money(supplier.em_aberto)} em aberto`}><title>Títulos ativos Everest: vencido / em aberto. Fonte: v_mapa_fornecedor.</title><circle cx="22" cy="22" r="18" fill="none" stroke="#584768" strokeWidth="5"/><circle cx="22" cy="22" r="18" fill="none" stroke="#ed7778" strokeWidth="5" pathLength="1" strokeDasharray={`${Number(supplier.em_aberto) > 0 ? Math.min(1, Number(supplier.vencido) / Number(supplier.em_aberto)) : 0} 1`} transform="rotate(-90 22 22)"/></svg>
          <span>Abrir ficha e crédito ↗</span></button>
        {layout.map(branch => {
          const e = branch.list[0]!, alternatives = [...new Set(allEdges.filter(a => a.unit_id === e.unit_id && a.insumo_id === e.insumo_id && a.raiz_cnpj && a.raiz_cnpj !== supplier.raiz_cnpj).map(a => a.raiz_cnpj!))];
          return <div key={branch.key}>
            <div className="mindmap-node mindmap-item" style={{ left: 400, top: branch.y, height: 300 }}>
              <button aria-expanded={!closed.has(branch.key)} onClick={() => setClosed(current => { const next = new Set(current); if (next.has(branch.key)) next.delete(branch.key); else next.add(branch.key); return next; })}>
                {ingredientInfo(e)}<span title="Quantidade de pratos distintos neste ramo.">{closed.has(branch.key) ? `(+${branch.list.length} pratos)` : `Recolher · ${branch.list.length} pratos`}</span>
              </button>
              {!!alternatives.length && <div className="mindmap-alternatives"><small>Outros fornecedores · duplo clique ou Enter para re-enraizar</small>{alternatives.map(root => <button key={root} onDoubleClick={() => reRoot(root)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); reRoot(root); } }}>{names.get(root) ?? root}</button>)}</div>}
            </div>
            {!closed.has(branch.key) && branch.list.map((d, index) => {
              const records = blocks.filter(b => blockKey(b) === dishKey(d));
              return <button key={dishKey(d)} className={`mindmap-node mindmap-dish ${records.length ? "blocked" : ""}`} style={{ left: 900, top: branch.y + index * 210 }} onDoubleClick={() => setInverted(d)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setInverted(d); } }}>
                <strong>{d.prato}</strong><span title="Receita Lorean em 12m / semanas da janela. Média histórica, prévia.">{money(d.receita_semana)} / semana</span>
                <span title="Custo do insumo / custo completo da ficha Everest. Preço de compra; fallback para custo histórico da mesma casa. Ligação tracejada quando indeterminado.">{costLabel(d)}{isCritical(d) ? " · crítico" : ""}</span>
                {!!records.length && <span className="map-badge red" title="Registros abertos de abastecimento_86; não comprova causa.">86 desde {date(records.map(r => r.inicio).sort()[0] ?? null)} · {records.length} registros</span>}
              </button>;
            })}
          </div>;
        })}
      </div>
      {!layout.length && <p className="map-empty">Sem dependências deste fornecedor para os filtros selecionados.</p>}
    </div>
    {inverted && <dialog ref={dialog} className="map-drawer" style={{ "--map-sans": "inherit", "--map-serif": "Georgia" } as CSSProperties} onClose={() => setInverted(null)}>
      <button className="map-close" aria-label="Fechar visão invertida" onClick={() => dialog.current?.close()}>×</button><small>VISÃO INVERTIDA · PRATO → INSUMO → FORNECEDOR</small><h2>{inverted.prato}</h2>
      {[...new Map(allEdges.filter(e => dishKey(e) === dishKey(inverted)).map(e => [e.insumo_id, e])).values()].map(e => <section key={e.insumo_id}>
        <h3>{e.insumo}</h3><p>{costLabel(e)}</p><p>{Number(e.reserva) ? `${e.reserva} reservas` : "Sem reserva"} · última compra {date(e.ultima_compra)}</p>
        {[...new Set(allEdges.filter(a => dishKey(a) === dishKey(e) && a.insumo_id === e.insumo_id && a.raiz_cnpj).map(a => a.raiz_cnpj!))].map(root => <button className="map-primary" key={root} onDoubleClick={() => { dialog.current?.close(); reRoot(root); }} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); dialog.current?.close(); reRoot(root); } }}>{names.get(root) ?? root} · re-enraizar ↗</button>)}
        {!e.raiz_cnpj && <p>Sem fornecedor identificado</p>}
      </section>)}
    </dialog>}
  </div>;
}
