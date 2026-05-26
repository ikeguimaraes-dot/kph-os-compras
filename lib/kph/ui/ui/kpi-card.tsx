import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  /** Linha curta abaixo do valor principal (ex: "R$ X realizado"). */
  sub?: ReactNode;
  /** Ícone ou pílula no canto superior direito (status, contador, etc). */
  trailing?: ReactNode;
  /** Conteúdo adicional embaixo (barra, badges, etc). */
  children?: ReactNode;
  /** Cor de destaque pro título. Default --text-3. */
  accent?: string;
};

/** Card genérico de KPI — usado nas 4 colunas do topo do dashboard. */
export function KpiCard({
  label,
  value,
  sub,
  trailing,
  children,
  accent,
}: Props) {
  return (
    <article
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 130,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: accent ?? "var(--text-3)",
          }}
        >
          {label}
        </div>
        {trailing}
      </header>

      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: -0.6,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: -2 }}>
          {sub}
        </div>
      )}

      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </article>
  );
}
