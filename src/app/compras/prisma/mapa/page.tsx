import { Newsreader, Instrument_Sans } from "next/font/google";
import { getMap } from "@/lib/compras/prisma-mapa-actions";
import MapClient from "./map-client";
import "./mapa.css";
const serif = Newsreader({ subsets: ["latin"], variable: "--map-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--map-sans" });
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, params] = await Promise.all([getMap(), searchParams]);
  const initial = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      Array.isArray(v) ? (v[0] ?? "") : (v ?? ""),
    ]),
  );
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <MapClient data={data} initial={initial} />
    </div>
  );
}
