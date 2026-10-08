export const PRISMA = {
  pareto: 0.8,
  alertPricePremium: 0.08,
  alertInvoiceMultiple: 2,
  alertUnmappedRevenue: 5000,
  priceRatioLimit: 2.5,
  packagingWarningRatio: 1.5,
  highRisk: 0.35,
  riskWeights: {
    exclusive: 0.45,
    category: 0.25,
    inflation: 0.15,
    volatility: 0.15,
  },
  riskCaps: { category: 0.5, inflation: 0.2, volatility: 0.3 },
  scoreWeights: {
    price: 0.35,
    inflation: 0.25,
    payment: 0.25,
    stability: 0.15,
  },
  // Fórmulas conferidas no HTML original exportado em docs/prisma-prototipo.html.
  scoreCaps: {
    pricePremium: 0.25,
    excessInflation: 0.2,
    paymentDays: 45,
    volatility: 0.3,
  },
  anchorRevenue: 250_000,
  falseAnchorSpend: 100_000,
  fragileScore: 50,
  minimumCoverage: 0.9,
} as const;

export function supplierAction(s: { quadrant: string; score: number | null }) {
  const low = s.score !== null && s.score < PRISMA.fragileScore;
  if (s.quadrant === "Estratégico")
    return low
      ? "Renegociar e desenvolver alternativa"
      : "Proteger com contrato";
  if (s.quadrant === "Alavancável")
    return low ? "Cotar com concorrentes" : "Apertar no preço";
  if (s.quadrant === "Gargalo") return "Garantir segundo fornecedor";
  return "Consolidar";
}

export function categoryName(raw: string) {
  const names: Record<string, string> = {
    "A. PROTEINAS": "Proteínas",
    "B. VINHOS": "Vinhos",
    "A. SECOS E CONSERVAS": "Secos e conservas",
    "A. HORTIFRUTI": "Hortifrúti",
    "B. ALCOOLICOS": "Destilados e licores",
    "A. FRIOS E LATICINIOS": "Frios e laticínios",
    "B. NAO ALCOOLICOS": "Não alcoólicos",
    "B. CHOPP E CERVEJAS": "Chopp e cervejas",
    "A. PAES, MASSAS E SALGADOS": "Pães e massas",
    "B. CHAMPANHES E ESPUMANTES": "Champanhes e espumantes",
  };
  return names[raw] ?? raw;
}
