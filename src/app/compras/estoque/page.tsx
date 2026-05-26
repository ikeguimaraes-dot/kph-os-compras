import { requireUser } from "@kph/auth/server"

export const dynamic = "force-dynamic"

export default async function Page() {
  await requireUser()
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text)" }}>
        Estoque
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 8 }}>
        Em construção. Próxima entrega no roadmap.
      </p>
    </div>
  )
}
