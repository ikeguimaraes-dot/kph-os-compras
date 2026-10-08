import { Newsreader, Instrument_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { comprasAccess } from "@/lib/compras/everest-access";
import { shiftMonth, monthEnd } from "@/lib/compras/prisma-cockpit";
import PrismaClient from "../prisma-client";
import "../prisma.css";
const serif = Newsreader({ subsets: ["latin"], variable: "--prisma-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--prisma-sans" });
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export default async function PrismaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ month?: string; unit?: string; root?: string }>;
}) {
  const { section } = await params;
  const tabs: Record<string, number> = {
    categorias: 0,
    fornecedores: 1,
    ancoras: 2,
    plano: 3,
  };
  if (!(section in tabs)) notFound();
  const q = await searchParams;
  const { units, user } = await comprasAccess(q.unit);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const month =
    q.month && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(q.month)
      ? q.month
      : shiftMonth(today, -1);
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <PrismaClient
        units={units}
        initialStart={shiftMonth(month, -11)}
        initialEnd={monthEnd(month)}
        initialTab={tabs[section]}
        initialUnitId={q.unit ?? null}
        initialRoot={q.root}
        canEditNames={user.roles.some(
          (r) =>
            ["founder", "diretoria"].includes(r.role) &&
            (r.unitId === null || r.unitId === q.unit),
        )}
      />
    </div>
  );
}
