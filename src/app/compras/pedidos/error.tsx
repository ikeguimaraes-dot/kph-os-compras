"use client";

import Link from "next/link";

export default function Error({ reset }: { reset: () => void }) {
  return <section role="alert">
    <h1>Não foi possível abrir o Pedido automático</h1>
    <p>Ocorreu uma falha no carregamento. Nenhum pedido foi emitido.</p>
    <button onClick={() => reset()} style={{ padding: 12, textDecoration: "underline" }}>Tentar novamente</button>
    <Link href="/compras">Voltar para Compras</Link>
  </section>;
}
