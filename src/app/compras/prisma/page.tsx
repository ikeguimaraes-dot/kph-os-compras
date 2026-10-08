import { Newsreader, Instrument_Sans } from "next/font/google";
import { comprasAccess } from "@/lib/compras/everest-access";
import PrismaClient from "./prisma-client";
import "./prisma.css";
const serif = Newsreader({ subsets: ["latin"], variable: "--prisma-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--prisma-sans" });
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export default async function PrismaPage() {
  const { units } = await comprasAccess();
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startDate = new Date(`${end}T12:00:00Z`);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <PrismaClient
        units={units}
        initialStart={startDate.toISOString().slice(0, 10)}
        initialEnd={end}
      />
    </div>
  );
}
