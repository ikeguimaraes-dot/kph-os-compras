"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  // shell
  ChevronDown, ChevronRight, Check, LogOut,
  // dashboard
  LayoutDashboard,
  // operacao
  TrendingUp, MapPin, Activity, UserCheck, ClipboardList, BookOpen,
  // compras
  ShoppingCart, Package, Truck, Building2, FileText, PackageCheck, PieChart, Star, Carrot,
  // financeiro
  Wallet, Gauge, ArrowLeftRight, Sheet, CreditCard, Banknote, CheckSquare, RefreshCw, PiggyBank,
  // pessoas
  Users, User, Briefcase, CalendarDays, Clock, Plane, CalendarX2, Timer,
  ShieldAlert, Receipt, DollarSign, Bus, GraduationCap, ClipboardCheck,
  FolderOpen, Upload, FileBarChart2, MessageCircle, Repeat2, LayoutGrid, ListChecks, CalendarClock, Network, UserPlus, BarChart2,
  // comercial
  Handshake, MessageSquare, CalendarCheck, Bot, Megaphone, Filter,
  // marca
  Bookmark, Info, Globe, Award,
  // inteligencia
  Brain, Target, LineChart, Layers, Bug, Map, BarChart3, Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, useUnit } from "@kph/auth/context";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = {
  id: string;
  title: string | null;
  icon: LucideIcon | null;
  items: NavItem[];
  defaultOpen: boolean;
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    title: null,
    icon: null,
    defaultOpen: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "operacao",
    title: "Operação",
    icon: TrendingUp,
    defaultOpen: false,
    items: [
      { href: "/operacao/mapa",          label: "Mapa da Casa",  icon: MapPin },
      { href: "/operacao/performance",   label: "Performance",   icon: Activity },
      { href: "/operacao/vendedores",    label: "Vendedores",    icon: UserCheck },
      { href: "/operacao/auditorias",    label: "Auditorias",    icon: ClipboardList },
    ],
  },
  {
    id: "compras",
    title: "Compras",
    icon: ShoppingCart,
    defaultOpen: false,
    items: [
      { href: "/cardapio",               label: "Cardápio",      icon: BookOpen },
      { href: "/compras/ingredientes",   label: "Ingredientes",      icon: Carrot },
      { href: "/compras",                label: "Pedidos",           icon: ShoppingCart },
      { href: "/compras/estoque",        label: "Estoque",           icon: Package },
      { href: "/compras/logistica",      label: "Logística",         icon: Truck },
      { href: "/compras/fornecedores",   label: "Fornecedores",      icon: Building2 },
      { href: "/compras/cotacoes",       label: "Cotações",          icon: FileText },
      { href: "/compras/recebimento",    label: "Recebimento",       icon: PackageCheck },
      { href: "/compras/analise",        label: "Análise CMV",       icon: PieChart },
      { href: "/compras/feedback",       label: "Feedback Produto",  icon: Star },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    icon: Wallet,
    defaultOpen: false,
    items: [
      { href: "/financeiro",              label: "Cockpit",           icon: Gauge },
      { href: "/financeiro/fluxo",        label: "Fluxo de Caixa",   icon: ArrowLeftRight },
      { href: "/financeiro/dre",          label: "DRE",               icon: Sheet },
      { href: "/financeiro/pagar",        label: "Contas a Pagar",   icon: CreditCard },
      { href: "/financeiro/receber",      label: "Contas a Receber", icon: Banknote },
      { href: "/financeiro/aprovacoes",   label: "Aprovações",        icon: CheckSquare },
      { href: "/financeiro/conciliacao",  label: "Conciliação",       icon: RefreshCw },
      { href: "/financeiro/orcamento",    label: "Orçamento",         icon: PiggyBank },
    ],
  },
  {
    id: "pessoas",
    title: "Pessoas",
    icon: Users,
    defaultOpen: true,
    items: [
      { href: "/pessoas/headcount",       label: "Headcount",         icon: BarChart3 },
      { href: "/pessoas/colaboradores",   label: "Colaboradores",     icon: User },
      { href: "/recrutamento/vagas",      label: "Recrutamento",      icon: Briefcase },
      { href: "/pessoas/escala",          label: "Escala",            icon: CalendarDays },
      { href: "/pessoas/ponto",           label: "Ponto",             icon: Clock },
      { href: "/pessoas/ferias",          label: "Férias",            icon: Plane },
      { href: "/pessoas/faltas",          label: "Faltas",            icon: CalendarX2 },
      { href: "/pessoas/horas-extras",    label: "Horas Extras",      icon: Timer },
      { href: "/pessoas/disciplina",      label: "Disciplina & Score", icon: ShieldAlert },
      { href: "/pessoas/holerites",       label: "Holerites",         icon: Receipt },
      { href: "/pessoas/gorjetas",        label: "Gorjetas",          icon: DollarSign },
      { href: "/pessoas/vale-transporte", label: "Vale Transporte",   icon: Bus },
      { href: "/pessoas/treinamentos",    label: "Treinamentos",      icon: GraduationCap },
      { href: "/pessoas/avaliacoes",        label: "Avaliações",        icon: ClipboardCheck },
      { href: "/pessoas/avaliacoes/ciclos", label: "Ciclos 360°",     icon: Repeat2 },
      { href: "/pessoas/avaliacoes/9box",   label: "Matriz 9Box",     icon: LayoutGrid },
      { href: "/pessoas/pdi",               label: "PDI",             icon: ListChecks },
      { href: "/pessoas/analytics",         label: "Analytics",       icon: BarChart2 },
      { href: "/pessoas/reunioes",          label: "Reuniões 1:1",    icon: CalendarClock },
      { href: "/pessoas/organograma",       label: "Organograma",     icon: Network },
      { href: "/pessoas/onboarding",        label: "Onboarding",      icon: UserPlus },
      { href: "/pessoas/feedback",          label: "Feedback",        icon: MessageCircle },
      { href: "/pessoas/documentos",      label: "Documentos",        icon: FolderOpen },
      { href: "/pessoas/importacao",      label: "Importar Dados",    icon: Upload },
      { href: "/pessoas/relatorio-ponto", label: "Relatório de Ponto", icon: FileBarChart2 },
    ],
  },
  {
    id: "comercial",
    title: "Comercial",
    icon: Handshake,
    defaultOpen: false,
    items: [
      { href: "/cliente",               label: "CRM Clientes", icon: MessageSquare },
      { href: "/comercial/reservas",    label: "Reservas",     icon: CalendarCheck },
      { href: "/eventos",               label: "Eventos / OS", icon: CalendarDays },
      { href: "/comercial/serena",      label: "Serena",       icon: Bot },
      { href: "/campanhas",             label: "Campanhas",    icon: Megaphone },
      { href: "/comercial/funil",       label: "Funil",        icon: Filter },
    ],
  },
  {
    id: "marca",
    title: "Marca",
    icon: Bookmark,
    defaultOpen: false,
    items: [
      { href: "/marcas",              label: "Diretório",    icon: Building2 },
      { href: "/marca/brandbook",     label: "BrandBook",    icon: BookOpen },
      { href: "/marca/quem-somos",    label: "Quem Somos",   icon: Info },
      { href: "/marca/canais",        label: "Site & Canais", icon: Globe },
      { href: "/marca/reputacao",     label: "Reputação",    icon: Award },
    ],
  },
  {
    id: "inteligencia",
    title: "Inteligência",
    icon: Brain,
    defaultOpen: false,
    items: [
      { href: "/inteligencia/metas",    label: "Metas",          icon: Target },
      { href: "/inteligencia/wbr",      label: "WBR",            icon: LineChart },
      { href: "/inteligencia/cross",    label: "Cross-módulo",   icon: Layers },
      { href: "/inteligencia/adocao",   label: "Adoção",         icon: Activity },
      { href: "/inteligencia/feedback", label: "Bugs & Feedback", icon: Bug },
      { href: "/inteligencia/roadmap",  label: "Roadmap",        icon: Map },
      { href: "/orquestrador",          label: "Orquestrador",   icon: Workflow },
    ],
  },
];

const ALL_NAV_ITEMS: { href: string; groupId: string }[] = NAV_GROUPS.flatMap(
  (g) => g.items.map((it) => ({ href: it.href, groupId: g.id })),
);

const STORAGE_KEY = "kph_sidebar_groups";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { unit, units, setUnit } = useUnit();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onToggle = () => setMobileOpen((v) => !v);
    window.addEventListener("kph:toggleSidebar", onToggle);
    return () => window.removeEventListener("kph:toggleSidebar", onToggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const initials =
    user?.email?.slice(0, 2).toUpperCase() ?? "?";
  const emailShort = user?.email
    ? user.email.length > 22
      ? user.email.slice(0, 19) + "…"
      : user.email
    : "—";
  const role = user?.roles[0]?.role ?? "—";

  return (
    <>
      <div
        className={`shell-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`shell-sidebar ${mobileOpen ? "open" : ""}`}
        style={{
          width: 240, flexShrink: 0,
          background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--sidebar-border)" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5 }}>
            KPH <span style={{ color: "var(--brand)" }}>OS</span>
          </div>
          <div
            style={{
              fontSize: 10, color: "var(--text-3)", marginTop: 2,
              letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600,
            }}
          >
            Operations
          </div>
        </div>

        <div style={{ padding: "12px 16px" }}>
          <div ref={ref} style={{ position: "relative" }}>
            <button
              onClick={() => setOpen((v) => !v)}
              disabled={units.length === 0}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "9px 12px", color: "var(--text)", fontSize: 13, fontWeight: 600,
                cursor: units.length ? "pointer" : "default",
                transition: "border-color var(--t)",
              }}
            >
              <span
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, minWidth: 0,
                }}
              >
                <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 700, letterSpacing: 0.8 }}>
                  UNIDADE
                </span>
                <span
                  style={{
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160,
                  }}
                >
                  {unit?.name ?? (units.length ? "Selecionar…" : "Sem acesso")}
                </span>
              </span>
              <ChevronDown
                size={14}
                style={{
                  color: "var(--text-3)",
                  transform: open ? "rotate(180deg)" : "none",
                  transition: "transform var(--t)",
                }}
              />
            </button>
            {open && units.length > 0 && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: "var(--surface-2)", border: "1px solid var(--border-strong)",
                  borderRadius: 10, padding: 4, boxShadow: "var(--shadow-lg)",
                }}
              >
                {units.map((u) => {
                  const active = u.id === unit?.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setUnit(u.id);
                        setOpen(false);
                      }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 8, padding: "9px 10px",
                        background: active ? "var(--surface-3)" : "transparent",
                        border: "none", borderRadius: 6, color: "var(--text)",
                        fontSize: 13, fontWeight: 500, cursor: "pointer",
                        textAlign: "left", transition: "background var(--t)",
                      }}
                    >
                      <span>{u.name}</span>
                      {active && <Check size={14} style={{ color: "var(--brand)" }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <SidebarNav pathname={pathname} />

        <div
          style={{
            padding: "12px 14px", borderTop: "1px solid var(--sidebar-border)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 99, background: "var(--brand-soft)",
                color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 12,
              }}
            >
              {initials}
            </div>
            <span
              style={{
                position: "absolute", right: -1, bottom: -1,
                width: 10, height: 10, borderRadius: 99,
                background: "#22C55E", border: "2px solid var(--sidebar)",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12, fontWeight: 600, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {emailShort}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>
              {role}
            </div>
          </div>
          <Link
            href="/auth/sign-out"
            title="Sair"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 6,
              color: "var(--text-3)", textDecoration: "none",
              transition: "color var(--t), background var(--t)",
            }}
          >
            <LogOut size={14} />
          </Link>
        </div>
      </aside>
    </>
  );
}

// ── Sub: nav com grupos colapsáveis ────────────────────────────
function SidebarNav({ pathname }: { pathname: string }) {
  const activeHref = useMemo(() => {
    let bestHref: string | null = null;
    let bestLen = -1;
    for (const it of ALL_NAV_ITEMS) {
      const matches = pathname === it.href || pathname.startsWith(it.href + "/");
      if (matches && it.href.length > bestLen) {
        bestHref = it.href;
        bestLen = it.href.length;
      }
    }
    return bestHref;
  }, [pathname]);

  const activeGroupId = useMemo(() => {
    if (!activeHref) return null;
    return ALL_NAV_ITEMS.find((it) => it.href === activeHref)?.groupId ?? null;
  }, [activeHref]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) m[g.id] = g.defaultOpen;
    return m;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setOpenMap((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignora corrupção
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenMap((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  function toggleGroup(id: string) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignora QuotaExceeded
        }
      }
      return next;
    });
  }

  return (
    <nav
      style={{
        flex: 1,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
      }}
    >
      {NAV_GROUPS.map((g) => {
        const isOpen = openMap[g.id] ?? g.defaultOpen;
        return (
          <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {g.title && (
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                aria-expanded={isOpen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "10px 8px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {g.icon && (
                  <g.icon size={11} style={{ color: "var(--text-3)" }} />
                )}
                <span style={{ flex: 1 }}>{g.title}</span>
                <ChevronRight
                  size={12}
                  style={{
                    color: "var(--text-3)",
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: hydrated ? "transform var(--t)" : "none",
                  }}
                />
              </button>
            )}
            {isOpen &&
              g.items.map((it) => {
                const Icon = it.icon;
                const active = it.href === activeHref;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "9px 12px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: active ? "var(--text)" : "var(--text-2)",
                      background: active ? "var(--surface-2)" : "transparent",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      transition: "all var(--t)",
                    }}
                  >
                    {active && (
                      <span
                        style={{
                          position: "absolute",
                          left: -12,
                          top: 6,
                          bottom: 6,
                          width: 3,
                          background: "var(--brand)",
                          borderRadius: "0 4px 4px 0",
                        }}
                      />
                    )}
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.2 : 1.8}
                      style={{ color: active ? "var(--brand)" : "currentColor" }}
                    />
                    <span style={{ flex: 1 }}>{it.label}</span>
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
