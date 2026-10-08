import { Newsreader, Instrument_Sans } from "next/font/google";
import { comprasAccess } from "@/lib/compras/everest-access";
import CockpitClient from "./cockpit-client";
import { shiftMonth } from "@/lib/compras/prisma-cockpit";
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
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <CockpitClient units={units} initialMonth={shiftMonth(end, -1)} />
    </div>
  );
}
