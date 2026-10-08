import { Newsreader, Instrument_Sans } from "next/font/google";
import { getCompleteMonths } from "@/lib/compras/prisma-cockpit-actions";
import CockpitClient from "./cockpit-client";
import { shiftMonth } from "@/lib/compras/prisma-cockpit";
import "./prisma.css";
const serif = Newsreader({ subsets: ["latin"], variable: "--prisma-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--prisma-sans" });
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export default async function PrismaPage() {
  const { units, months } = await getCompleteMonths();
  const defaultUnit = months.all ? null : units.find(u=>months[u.id])?.id ?? null;
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <CockpitClient units={units} initialMonth={months[defaultUnit ?? "all"] ?? shiftMonth(end, -1)} initialUnit={defaultUnit} completeMonths={months} />
    </div>
  );
}
