import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ClipboardCheck,
  Handshake,
} from "lucide-react";
import { GhosMark } from "@/components/ghos/GhosShell";

export const metadata: Metadata = { title: "Início" };

export default function GhosHome() {
  return (
    <div className="ghos-home">
      <div className="ghos-home-kicker">
        <span>GHOST / COMPRAS & ABASTECIMENTO</span>
        <span>Hospitalidade por método.</span>
      </div>
      <section className="ghos-hero" aria-labelledby="ghos-title">
        <div>
          <p className="ghos-eyebrow">NOS BASTIDORES DA HOSPITALIDADE</p>
          <h1 id="ghos-title">
            Comprar bem.
            <br />
            Servir <em>melhor.</em>
          </h1>
          <p className="ghos-hero-copy">
            O trabalho acontece nos bastidores.
            <br />
            O cuidado aparece em cada mesa.
            <br />
            Compras, abastecimento e margem, em sintonia.
          </p>
          <Link className="ghos-primary" href="/compras/abastecimento">
            Começar pela rotina <ArrowRight size={18} />
          </Link>
        </div>
        <div className="ghos-hero-art" aria-hidden="true">
          <div className="ghos-orbit">
            <GhosMark />
            <span className="ghos-orbit-top">ORIGEM</span>
            <span className="ghos-orbit-right">MÉTODO</span>
            <span className="ghos-orbit-bottom">MESA</span>
          </div>
          <p>Presença em cada detalhe.</p>
        </div>
      </section>
      <section
        className="ghos-priorities"
        aria-labelledby="ghos-priorities-title"
      >
        <div className="ghos-section-title">
          <h2 id="ghos-priorities-title">O que merece sua atenção</h2>
          <span>Três caminhos para decidir e agir</span>
        </div>
        <div className="ghos-paths">
          <Link href="/compras/abastecimento" className="ghos-path">
            <div>
              <span>01 / ABASTECER</span>
              <ClipboardCheck size={22} strokeWidth={1.3} />
            </div>
            <h3>De volta à mesa.</h3>
            <p>
              Confirme as causas do 86 e acompanhe o que falta para cada prato
              voltar à venda.
            </p>
            <span className="ghos-path-action">
              Abrir rotina <ArrowUpRight size={17} />
            </span>
          </Link>
          <Link href="/compras/prisma" className="ghos-path">
            <div>
              <span>02 / ENTENDER</span>
              <ChartNoAxesCombined size={22} strokeWidth={1.3} />
            </div>
            <h3>A margem, de perto.</h3>
            <p>
              Veja o que mudou no CMV, de onde veio a variação e onde agir na
              compra.
            </p>
            <span className="ghos-path-action">
              Entrar no Prisma <ArrowUpRight size={17} />
            </span>
          </Link>
          <Link href="/compras/abastecimento/acordos" className="ghos-path">
            <div>
              <span>03 / NEGOCIAR</span>
              <Handshake size={22} strokeWidth={1.3} />
            </div>
            <h3>Caixa com destino.</h3>
            <p>
              Priorize acordos que devolvem pratos à venda, dentro do caixa
              disponível.
            </p>
            <span className="ghos-path-action">
              Revisar acordos <ArrowUpRight size={17} />
            </span>
          </Link>
        </div>
      </section>
      <section className="ghos-desk" aria-labelledby="ghos-desk-title">
        <div>
          <p className="ghos-eyebrow">NA SUA MESA</p>
          <h2 id="ghos-desk-title">
            Do combinado
            <br />
            ao recebido.
          </h2>
        </div>
        <div className="ghos-quick-links">
          {(
            [
              ["/compras", "Pedidos de compra", "Formalizar antes de comprar"],
              [
                "/compras/abastecimento/matriz",
                "Matriz de marcas",
                "Conferir padrões e alternativas",
              ],
              ["/compras/recebimento", "Recebimento", "Conferir o que chegou"],
              [
                "/compras/fornecedores",
                "Fornecedores",
                "Cuidar das relações de compra",
              ],
            ] as const
          ).map(([href, title, description]) => (
            <Link href={href} key={href}>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <footer className="ghos-home-footer">
        <span>
          GHOST <i>·</i> Grupo KPH
        </span>
        <Link href="/compras/prisma/estrategia">
          Nossa estratégia de compras <ArrowRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
