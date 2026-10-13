"use client";
import { useState } from "react";
import SourceClient from "@/components/compras/source-client";
import EstoqueMinMaxTab from "./estoque-minmax-tab";

type Tab = "inventarios" | "minmax";

export default function EstoqueTabs({
  units,
}: {
  units: { id: string; name: string }[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("inventarios");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #80908444",
          marginBottom: 0,
        }}
      >
        <button
          onClick={() => setActiveTab("inventarios")}
          style={{
            border: "none",
            borderBottom:
              activeTab === "inventarios"
                ? "2px solid #789c55"
                : "2px solid transparent",
            background: "none",
            padding: "10px 18px",
            cursor: "pointer",
            fontWeight: activeTab === "inventarios" ? 600 : 400,
            fontSize: 13,
            color: activeTab === "inventarios" ? "#789c55" : "inherit",
            borderRadius: 0,
            minHeight: "unset",
          }}
        >
          Inventários
        </button>
        <button
          onClick={() => setActiveTab("minmax")}
          style={{
            border: "none",
            borderBottom:
              activeTab === "minmax"
                ? "2px solid #789c55"
                : "2px solid transparent",
            background: "none",
            padding: "10px 18px",
            cursor: "pointer",
            fontWeight: activeTab === "minmax" ? 600 : 400,
            fontSize: 13,
            color: activeTab === "minmax" ? "#789c55" : "inherit",
            borderRadius: 0,
            minHeight: "unset",
          }}
        >
          Cadastro mín/máx
        </button>
      </div>

      {activeTab === "inventarios" && (
        <SourceClient kind="estoque" units={units} />
      )}
      {activeTab === "minmax" && <EstoqueMinMaxTab units={units} />}
    </div>
  );
}
