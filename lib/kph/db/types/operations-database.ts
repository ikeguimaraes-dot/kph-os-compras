/**
 * Tipos manuais para o banco de operações Meet & Eat
 * Supabase: laodipuodgrpqykrupms
 *
 * Tabelas importadas do PDV (Workday) e ERP (TOTVS/Contas a Pagar).
 * Não tem RLS configurado — acesso via service role no servidor.
 */

// ── Tipos auxiliares (colunas JSONB) ─────────────────────────────────────────

export type WorkdayPagamento = {
  tipo: string;
  metodo: string;
  fechado: number;
  recebido: number;
  diferenca: number;
};

export type WorkdayCaixa = {
  fechado: number;
  recebido: number;
  diferenca: number;
  operador_nome: string;
};

export type WorkdayAmbiente = {
  nome: string;
  qtde: number;
  consumo: number;
  convite: number;
  gorjeta: number;
  produto: number;
};

export type WorkdayTurno = {
  nome: string;
  qtde: number;
  consumo: number;
  convite: number;
  gorjeta: number;
  produto: number;
};

export type WorkdayClienteTipo = {
  qtde: number;
  consumo: number;
  convite: number;
  gorjeta: number;
  produto: number;
  segmento: string;
};

export type WorkdayClienteIdade = {
  qtde: number;
  faixa: string;
  consumo: number;
  convite: number;
  gorjeta: number;
  produto: number;
};

export type WorkdayDevedor = {
  nome: string;
  pago: number;
  total: number;
  divida: number;
};

export type WorkdayCancelamento = {
  qtde: number;
  motivo: string;
  consumo: number;
};

export type WorkdayDesconto = {
  qtde: number;
  motivo: string;
  consumo: number;
};

export type WorkdayCancelamentoUsuario = {
  qtde: number;
  tipo: string;
  consumo: number;
  usuario: string;
};

// ── Tabelas ───────────────────────────────────────────────────────────────────

/**
 * Resumo diário completo do PDV (Workday).
 * Fonte principal para KPIs de operação, financeiro e CMV.
 */
export type WorkdayResumo = {
  workday_id: number;
  data: string; // DATE — YYYY-MM-DD
  unidade_id: number;
  acessos: number;
  permanencia: string; // HH:MM:SS
  cmv_pct: number;
  ticket_zero: number;
  ticket_real: number;
  ticket_medio: number;
  bruto: number;
  desconto: number;
  gorjeta: number;
  custo: number;
  despesa: number;
  lucro: number;
  convite: number;
  produto: number;
  consumo_total: number;
  devedor_total: number;
  pendencia_antiga: number;
  total_fechado: number;
  total_recebido: number;
  diferenca_caixa: number;
  diferenca_real: number;
  cancelamentos_total: number;
  descontos_total: number;
  pagamentos: WorkdayPagamento[] | null;
  caixas: WorkdayCaixa[] | null;
  ambientes: WorkdayAmbiente[] | null;
  turnos: WorkdayTurno[] | null;
  clientes_tipo: WorkdayClienteTipo[] | null;
  clientes_sexo: WorkdayClienteTipo[] | null;
  clientes_idade: WorkdayClienteIdade[] | null;
  cidades: unknown[] | null;
  devedores: WorkdayDevedor[] | null;
  pendencias_antigas: { data: string; nome: string; valor: number }[] | null;
  gorjetas_edit: unknown[] | null;
  descontos_motivo: WorkdayDesconto[] | null;
  cancelamentos_motivo: WorkdayCancelamento[] | null;
  cancelamentos_usuario: WorkdayCancelamentoUsuario[] | null;
  created_at: string;
  updated_at: string;
};

/** Venda consolidada por dia (mais simples que workday_resumo). */
export type WorkdayVenda = {
  workday_id: number;
  data: string;
  bruto_total: number;
  desconto_total: number;
  gorjeta_total: number;
  total: number;
  categorias: unknown | null;
};

/** Produtos vendidos no dia, ordenados por posição. */
export type WorkdayProduto = {
  id: number;
  workday_id: number;
  posicao: number;
  nome: string;
  qtde: number;
  unitario: number;
  cmv_pct: number;
  custo: number;
  lucro: number;
  consumo: number;
};

/** Grupos de categoria (ex: Bebidas, Pratos) por dia. */
export type WorkdayGrupo = {
  id: number;
  workday_id: number;
  posicao: number;
  nome: string;
  percentual: number;
  bruto: number;
  desconto: number;
  gorjeta: number;
  consumo: number;
};

/** Detalhes de cada caixa físico do dia. */
export type WorkdayCaixaRow = {
  caixa_id: number;
  workday_id: number;
  operador_nome: string;
  operador_cpf: string | null;
  abertura: string | null;
  fechamento: string | null;
  total_fechado: number;
  total_recebido: number;
  diferenca_total: number;
  dinheiro_total: number;
  despesa: number;
  transacao: number;
  pagamentos: WorkdayPagamento[] | null;
  cedulas: unknown | null;
  moedas: unknown | null;
};

/** Vendedores/garçons do dia. */
export type WorkdayUsuario = {
  id: number;
  workday_id: number;
  posicao: number;
  nome: string;
  qtde: number;
  gorjeta: number;
  convite: number;
  produto: number;
  consumo: number;
};

/**
 * Contas a pagar importadas do ERP (TOTVS).
 * ref_mes: primeiro dia do mês de competência (YYYY-MM-01).
 */
export type TituloAPagar = {
  id: string;
  tipo: string | null;
  n_nota_fiscal: string | null;
  fantasia_fornecedor: string | null;
  razao_fornecedor: string | null;
  cnpj_cpf_fornecedor: string | null;
  t_fornecedor: string | null;
  descricao_c_gerencial: string | null;
  n_titulo: string | null;
  parcela: string | null;
  portador: string | null;
  d_lancamento: string | null; // DATE
  d_competencia: string | null; // DATE
  d_vencimento: string | null; // DATE
  v_titulo: number | null;
  v_saldo_atual: number | null;
  dias_atraso_atual: number | null;
  situacao_atual: string | null;
  tipo_sep: string | null;
  fluxo_de_caixa: boolean;
  importado_em: string;
  ref_mes: string | null; // DATE — YYYY-MM-01
};

/** Vendas diárias simplificadas (preenchimento manual). */
export type VendaDiaria = {
  id: number;
  data_venda: string; // DATE
  turno: string | null;
  qtd_clientes: number | null;
  faturamento_bruto: number | null;
  descontos_clientes: number | null;
  descontos_socios: number | null;
  descontos_internos: number | null;
  gorjetas: number | null;
  penduras: number | null;
  perdas: number | null;
  meta_faturamento: number | null;
  criado_em: string | null;
};

/** Metas mensais e por dia da semana. */
export type MetaProjecao = {
  id: number;
  mes_ano: string; // ex: "2026-5"
  meta_faturamento: number | null;
  metas_diarias: number[] | null; // [seg, ter, qua, qui, sex, sab, dom]
  criado_em: string | null;
};

/** Nota de auditoria nutricional. */
export type NotaNutri = {
  id: number;
  data_inspecao: string;
  local: string | null;
  tipo_inspecao: string | null;
  nota: number | null;
  status: string | null;
};

export type AuditoriaNutricional = {
  id: number;
  data_inspecao: string;
  nota: number | null;
  status: string | null;
  criado_em: string | null;
  local: string | null;
  tipo_inspecao: string | null;
};

export type NotaDetalhada = {
  id: number;
  local: string | null;
  topico: string | null;
  setor: string | null;
  data_inspecao: string;
  meta: number | null;
  nota: number | null;
};

// ── Schema completo para o cliente tipado ────────────────────────────────────

export type OperationsDatabase = {
  public: {
    Tables: {
      workday_resumo: { Row: WorkdayResumo; Insert: Partial<WorkdayResumo>; Update: Partial<WorkdayResumo> };
      workday_venda: { Row: WorkdayVenda; Insert: Partial<WorkdayVenda>; Update: Partial<WorkdayVenda> };
      workday_produtos: { Row: WorkdayProduto; Insert: Partial<WorkdayProduto>; Update: Partial<WorkdayProduto> };
      workday_grupos: { Row: WorkdayGrupo; Insert: Partial<WorkdayGrupo>; Update: Partial<WorkdayGrupo> };
      workday_caixas: { Row: WorkdayCaixaRow; Insert: Partial<WorkdayCaixaRow>; Update: Partial<WorkdayCaixaRow> };
      workday_usuarios: { Row: WorkdayUsuario; Insert: Partial<WorkdayUsuario>; Update: Partial<WorkdayUsuario> };
      titulos_a_pagar: { Row: TituloAPagar; Insert: Partial<TituloAPagar>; Update: Partial<TituloAPagar> };
      vendas_diarias: { Row: VendaDiaria; Insert: Partial<VendaDiaria>; Update: Partial<VendaDiaria> };
      metas_projecoes: { Row: MetaProjecao; Insert: Partial<MetaProjecao>; Update: Partial<MetaProjecao> };
      notas_nutri: { Row: NotaNutri; Insert: Partial<NotaNutri>; Update: Partial<NotaNutri> };
      auditoria_nutricional: { Row: AuditoriaNutricional; Insert: Partial<AuditoriaNutricional>; Update: Partial<AuditoriaNutricional> };
      notas_detalhadas: { Row: NotaDetalhada; Insert: Partial<NotaDetalhada>; Update: Partial<NotaDetalhada> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
