"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { useRef } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Compass,
  Handshake,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  ShoppingBasket,
  Sun,
  Truck,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useAuth, useUnit } from "@kph/auth/context";
import "./ghos.css";

const groups = [
  {
    label: "Visão & direção",
    items: [
      { href: "/compras/inicio", label: "Início", icon: LayoutDashboard },
      {
        href: "/compras/prisma",
        label: "Prisma de margem",
        icon: ChartNoAxesCombined,
      },
      {
        href: "/compras/abastecimento",
        label: "Rotina de abastecimento",
        icon: ClipboardCheck,
      },
      {
        href: "/compras/prisma/estrategia",
        label: "Estratégia",
        icon: Compass,
      },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/compras", label: "Pedidos de compra", icon: ShoppingBasket },
      {
        href: "/compras/abastecimento/acordos",
        label: "Acordos & caixa",
        icon: Handshake,
      },
      { href: "/compras/cotacoes", label: "Cotações", icon: BookOpen },
      {
        href: "/compras/recebimento",
        label: "Recebimento",
        icon: PackageCheck,
      },
      { href: "/compras/fornecedores", label: "Fornecedores", icon: Users },
    ],
  },
  {
    label: "Cozinha & base",
    items: [
      {
        href: "/compras/abastecimento/cardapio",
        label: "Engenharia de cardápio",
        icon: Utensils,
      },
      { href: "/compras/cardapio", label: "Cardápio", icon: BookOpen },
      {
        href: "/compras/fichas",
        label: "Fichas técnicas",
        icon: ClipboardCheck,
      },
      {
        href: "/compras/abastecimento/matriz",
        label: "Matriz de marcas",
        icon: Boxes,
      },
      { href: "/compras/ingredientes", label: "Ingredientes", icon: Leaf },
      { href: "/compras/estoque", label: "Estoque", icon: Boxes },
      { href: "/compras/logistica", label: "Logística", icon: Truck },
      {
        href: "/compras/analise",
        label: "Análise de CMV",
        icon: ChartNoAxesCombined,
      },
      { href: "/compras/feedback", label: "Feedback", icon: CircleHelp },
    ],
  },
];

export function GhosMark() {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path
        d="M32 9A17 17 0 1 0 37 30V22H23"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M22 5v34M8 22h28M12 10l20 24M12 34l20-24"
        stroke="currentColor"
        strokeWidth=".65"
        opacity=".5"
      />
      <circle cx="22" cy="22" r="7" stroke="currentColor" strokeWidth=".8" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { unit, units, setUnit } = useUnit();
  const { resolvedTheme, setTheme } = useTheme();
  const drawer = useRef<HTMLDialogElement>(null);
  const links = groups.flatMap((g) => g.items);
  const current = [...links]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/compras" && pathname.startsWith(item.href + "/")),
    );
  const label = current?.label ?? "Pedidos de compra";
  const navigation = (mobile = false) => (
    <>
      <div className="ghos-brand-row">
        <Link
          href="/compras/inicio"
          className="ghos-brand"
          aria-label="GHOS — início"
          onClick={() => drawer.current?.close()}
        >
          <GhosMark />
          <span>
            ghos<small>COMPRAS · GRUPO KPH</small>
          </span>
        </Link>
        {mobile && (
          <button
            className="ghos-icon-button"
            onClick={() => drawer.current?.close()}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <label className="ghos-house">
        <span>CASA SELECIONADA</span>
        <div>
          <select
            aria-label={mobile ? "Casa — menu móvel" : "Casa"}
            value={unit?.id ?? ""}
            onChange={(e) => setUnit(e.target.value)}
            disabled={!units.length}
          >
            <option value="" disabled>
              {units.length ? "Selecionar casa" : "Nenhuma casa disponível"}
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </label>
      <nav aria-label="Compras" className="ghos-nav">
        {groups.map((group) => (
          <div className="ghos-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
              const active =
                current?.href === item.href ||
                (!current && item.href === "/compras");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  onClick={() => drawer.current?.close()}
                >
                  <item.icon size={17} strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {active && <i aria-hidden="true" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="ghos-account">
        <span className="ghos-avatar">
          {(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong>{user?.displayName || user?.email || "Minha conta"}</strong>
          <small>Grupo KPH</small>
        </span>
        <button
          className="ghos-icon-button"
          onClick={() => void signOut()}
          aria-label="Sair da conta"
        >
          <LogOut size={18} />
        </button>
      </div>
    </>
  );
  return (
    <div className="ghos-shell">
      <a className="ghos-skip" href="#ghos-content">
        Ir para o conteúdo
      </a>
      <aside className="ghos-sidebar">{navigation()}</aside>
      <dialog
        ref={drawer}
        className="ghos-mobile-menu"
        aria-label="Menu GHOS"
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
      >
        {navigation(true)}
      </dialog>
      <div className="ghos-workspace">
        <header className="ghos-topbar">
          <button
            className="ghos-menu-button ghos-icon-button"
            onClick={() => drawer.current?.showModal()}
            aria-label="Abrir menu"
          >
            <Menu size={21} />
          </button>
          <nav aria-label="Localização">
            <Link href="/compras/inicio">GHOS</Link>
            <span>/</span>
            <strong>{label}</strong>
          </nav>
          <button
            className="ghos-theme"
            aria-label="Alternar entre tema claro e escuro"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <Moon className="ghos-light-icon" size={17} />
            <Sun className="ghos-dark-icon" size={17} />
            <span className="ghos-light-icon">Apagar a luz</span>
            <span className="ghos-dark-icon">Acender a luz</span>
          </button>
          <a className="ghos-ecosystem" href="/dashboard">
            KPH OS <ArrowUpRight size={13} />
          </a>
        </header>
        <main id="ghos-content" tabIndex={-1} className="ghos-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export function GhosShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="ghos-theme"
      disableTransitionOnChange
    >
      <Shell>{children}</Shell>
    </ThemeProvider>
  );
}
