import { notFound } from "next/navigation";
import { getPurchaseOrder } from "@/app/compras/actions";
import { requireUser } from "@kph/auth/server";
import { CompraDetalheClient } from "./detalhe-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CompraDetalhePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const order = await getPurchaseOrder(id);
  if (!order) notFound();
  return <CompraDetalheClient order={order} />;
}
