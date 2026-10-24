import Link from 'next/link';
import { comprasAccess } from '@/lib/compras/everest-access';
import '../../planejamento.css';

export const dynamic = 'force-dynamic';
type Item = { id_item: number; id_embalagem: number; ds_item: string; sg_unidademedida: string; qt_estoque: number };
const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const date = (s: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s));
// Request-time server data; this route is explicitly dynamic.
async function requestTime() { return Date.now(); }

export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const observedAt = await requestTime();
  const { db, unitIds, units } = await comprasAccess();
  const [{ data: depots, error }, { data: snapshots, error: snapshotError }] = await Promise.all([
    db.from('everest_estoque_depositos').select('*').in('unit_id', unitIds).eq('ativo', true).order('nome'),
    db.from('everest_estoque_saldos').select('unit_id,empresa,deposito,total,negativos,iniciado_em,concluido_em').in('unit_id', unitIds),
  ]);
  if (error || snapshotError) return <main><h1>Estoque Everest</h1><p>Não foi possível consultar os saldos. Tente novamente. Ausência de leitura não significa estoque zero.</p><Link href="/compras">Voltar às compras</Link></main>;
  const key = (r: { unit_id: string; empresa: number; deposito: number }) => `${r.unit_id}:${r.empresa}:${r.deposito}`;
  const selected = depots?.find(d => key(d) === query.deposito) ?? depots?.[0];
  let snapshot = snapshots?.find(s => selected && key(s) === key(selected));
  let items: Item[] | null = null;
  if (selected && snapshot) {
    const { data, error: detailError } = await db.from('everest_estoque_saldos').select('*').eq('unit_id', selected.unit_id).eq('empresa', selected.empresa).eq('deposito', selected.deposito).single();
    if (!detailError && Array.isArray(data?.registros)) { items = data.registros as Item[]; snapshot = data; }
  }
  const term = typeof query.q === 'string' ? query.q.trim().toLocaleLowerCase('pt-BR') : '';
  const filtered = items?.filter(r => (!term || `${r.ds_item} ${r.id_item}`.toLocaleLowerCase('pt-BR').includes(term)) && (query.filtro !== 'negativos' || r.qt_estoque < 0) && (query.filtro !== 'nao_zero' || r.qt_estoque !== 0)) ?? [];
  const page = Math.max(1, Math.min(Math.ceil(filtered.length / 100) || 1, Number.parseInt(String(query.p ?? '1'), 10) || 1));
  const href = (p: number) => `/compras/estoque/everest?${new URLSearchParams({ deposito: selected ? key(selected) : '', q: term, filtro: typeof query.filtro === 'string' ? query.filtro : '', p: String(p) })}`;
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
    <Link href="/compras">← Compras e planejamento</Link> · <Link href="/compras/estoque">Inventários e mín/máx</Link>
    <h1 style={{ fontSize: 28, margin: '18px 0 8px' }}>Estoque por casa e depósito</h1>
    <p>Saldo informado pelo Everest, com leitura completa de cada depósito. Quantidade utilizável e compra líquida ainda dependem de conciliação.</p>
    <div className="plan-notice">Atualização programada a cada 6 horas. Saldos negativos são divergências. Cadastros de pratos e outros itens também podem aparecer; esta consulta não é uma lista de insumos aprovados para compra.</div>
    {!depots?.length && <p>Nenhum depósito sincronizado para suas casas. Estoque desconhecido — não é zero.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, margin: '18px 0' }}>
      {depots?.map(d => {
        const s = snapshots?.find(s => key(s) === key(d));
        const stale = !s || observedAt - Date.parse(s.concluido_em) > 8 * 3600000;
        return <Link key={key(d)} href={`/compras/estoque/everest?deposito=${encodeURIComponent(key(d))}`} style={{ padding: 16, border: `1px solid ${selected && key(d) === key(selected) ? 'var(--accent, #618cf7)' : 'var(--border, #888)'}`, borderRadius: 12 }}>
          <strong>{units.find(u => u.id === d.unit_id)?.name}</strong><div>{d.nome}</div>
          <small>Empresa {d.empresa} · Depósito {d.deposito}</small>
          <div>{s ? `${s.total} registros · ${s.negativos} negativos` : 'Saldo ainda não coletado'}</div>
          <small>{s ? `${stale ? 'Leitura antiga · ' : ''}${date(s.concluido_em)}` : 'Aguardando leitura completa'}</small>
          {!d.planejamento && <div>Fora do planejamento no Everest</div>}
        </Link>;
      })}
    </div>
    {selected && <section>
      <h2>{selected.nome}</h2>
      <p>QG e setores: mapeamento pendente. O mesmo depósito pode estar associado a empresas diferentes; não somar posições sem validar essa relação.</p>
      {snapshot && <p>Coleta de {date(snapshot.iniciado_em)} até {date(snapshot.concluido_em)}. Não representa uma contagem física simultânea.</p>}
      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '18px 0' }}>
        <input type="hidden" name="deposito" value={key(selected)} />
        <label>Buscar item <input name="q" defaultValue={term} placeholder="Nome ou código" style={{ padding: 8, border: '1px solid #888', borderRadius: 6 }} /></label>
        <label>Exibir <select name="filtro" defaultValue={typeof query.filtro === 'string' ? query.filtro : ''} style={{ padding: 8 }}><option value="">Todos</option><option value="negativos">Saldos negativos</option><option value="nao_zero">Saldos diferentes de zero</option></select></label>
        <button type="submit" style={{ padding: '8px 16px', border: '1px solid #888', borderRadius: 6 }}>Filtrar</button>
      </form>
      {items === null ? <p>Saldo indisponível. Não utilizar zero como substituto.</p> : <>
        <p>{filtered.length} itens encontrados · Página {page} de {Math.max(1, Math.ceil(filtered.length / 100))}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 10 }}>
          {filtered.slice((page - 1) * 100, page * 100).map(r => <article key={`${r.id_item}:${r.id_embalagem}:${r.sg_unidademedida}`} style={{ padding: 14, border: '1px solid var(--border, #888)', borderRadius: 10 }}>
            <strong>{r.ds_item}</strong><div style={{ fontSize: 24, margin: '8px 0' }}>{fmt.format(r.qt_estoque)} {r.sg_unidademedida}</div>
            <small>Item {r.id_item} · Embalagem {r.id_embalagem}</small>
            <div>{r.qt_estoque < 0 ? 'Divergência: saldo negativo' : 'Saldo ERP observado'}</div>
            <small>Disponível para compra: a confirmar</small>
          </article>)}
        </div>
        <nav aria-label="Páginas de itens" style={{ display: 'flex', gap: 24, marginTop: 20 }}>{page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}{page * 100 < filtered.length && <Link href={href(page + 1)}>Próxima →</Link>}</nav>
      </>}
    </section>}
  </main>;
}
