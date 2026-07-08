export function PaletteA() {
  const light = {
    bg: "#f5f3ef",
    cardBg: "#ffffff",
    cardBorder: "#e8e2d9",
    sidebar: "#0a192f",
    sidebarText: "#94a3b8",
    sidebarActive: "#C4A44A",
    sidebarActiveBg: "rgba(196,164,74,0.15)",
    sidebarHover: "rgba(255,255,255,0.06)",
    header: "#ffffff",
    headerBorder: "#e8e2d9",
    text: "#1a2744",
    textMuted: "#64748b",
    primary: "#0a192f",
    accent: "#C4A44A",
    success: "#059669",
    destructive: "#dc2626",
    warning: "#d97706",
    tableTh: "#f0ede6",
    tableRow: "#faf8f5",
    tableRowAlt: "#ffffff",
    tableRowHover: "#fdf9f0",
    inputBg: "#ffffff",
    inputBorder: "#d5cfc4",
    ring: "#C4A44A",
    shadow: "0 1px 4px rgba(10,25,47,0.08)",
    chart1: "#C4A44A",
    chart2: "#0a192f",
    chart3: "#059669",
    chart4: "#d97706",
    chart5: "#0891b2",
  };

  const dark = {
    bg: "#0a192f",
    cardBg: "#112240",
    cardBorder: "#1d3461",
    sidebar: "#091728",
    sidebarText: "#64748b",
    sidebarActive: "#C4A44A",
    sidebarActiveBg: "rgba(196,164,74,0.18)",
    sidebarHover: "rgba(255,255,255,0.05)",
    header: "#112240",
    headerBorder: "#1d3461",
    text: "#e2e8f0",
    textMuted: "#64748b",
    primary: "#C4A44A",
    accent: "#C4A44A",
    success: "#10b981",
    destructive: "#f87171",
    warning: "#fbbf24",
    tableTh: "#0f1f38",
    tableRow: "#112240",
    tableRowAlt: "#0f1f38",
    tableRowHover: "#1a2f50",
    inputBg: "#0f1f38",
    inputBorder: "#1d3461",
    ring: "#C4A44A",
    shadow: "0 1px 4px rgba(0,0,0,0.4)",
    chart1: "#C4A44A",
    chart2: "#3b82f6",
    chart3: "#10b981",
    chart4: "#fbbf24",
    chart5: "#22d3ee",
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", fontFamily: "Inter, sans-serif" }}>
      <Mode label="Light Mode" t={light} />
      <div style={{ width: 2, background: "#c4a44a" }} />
      <Mode label="Dark Mode" t={dark} />
    </div>
  );
}

function Mode({ label, t }: { label: string; t: ReturnType<typeof Object.assign> }) {
  const navItems = ["Fretes", "Despesas", "Abastecimentos", "Funcionários", "Dashboard"];
  const kpis = [
    { label: "Receita Bruta", value: "R$ 482.350", delta: "+12.4%", color: t.success },
    { label: "Despesas", value: "R$ 198.720", delta: "-3.2%", color: t.destructive },
    { label: "Lucro Líquido", value: "R$ 283.630", delta: "+18.1%", color: t.success },
    { label: "Margem", value: "58.8%", delta: "+3.1pp", color: t.accent },
  ];
  const bars = [82, 65, 91, 73, 88, 56, 79];
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.bg, overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 200, background: t.sidebar, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${t.cardBorder}20` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: t.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#0a192f", fontSize: 14, fontWeight: 800 }}>L</span>
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em" }}>LAFER</div>
                <div style={{ color: t.sidebarText, fontSize: 9, letterSpacing: "0.06em" }}>TRANSPORTES</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "10px 8px" }}>
            {navItems.map((item, i) => (
              <div key={item} style={{
                padding: "8px 10px", borderRadius: 6, marginBottom: 2,
                background: i === 4 ? t.sidebarActiveBg : "transparent",
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: i === 4 ? t.sidebarActive : "transparent" }} />
                <span style={{ fontSize: 12, fontWeight: i === 4 ? 600 : 400, color: i === 4 ? t.sidebarActive : t.sidebarText }}>
                  {item}
                </span>
              </div>
            ))}
          </nav>
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.cardBorder}20` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: t.sidebarActiveBg, border: `1px solid ${t.sidebarActive}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: t.sidebarActive, fontSize: 11, fontWeight: 700 }}>JB</span>
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>João Batista</div>
                <div style={{ color: t.sidebarText, fontSize: 9 }}>Admin</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ background: t.header, borderBottom: `1px solid ${t.headerBorder}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Dashboard</div>
              <div style={{ fontSize: 10, color: t.textMuted }}>Julho 2026 · Todas as frotas</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ padding: "5px 12px", borderRadius: 5, background: t.tableTh, border: `1px solid ${t.cardBorder}`, fontSize: 11, color: t.textMuted, cursor: "pointer" }}>Mensal ▾</div>
              <div style={{ padding: "5px 12px", borderRadius: 5, background: t.accent, fontSize: 11, fontWeight: 600, color: "#0a192f", cursor: "pointer" }}>Exportar</div>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ padding: "16px 16px 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {kpis.map(kpi => (
              <div key={kpi.label} style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: "14px 14px", boxShadow: t.shadow }}>
                <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.text }}>{kpi.value}</div>
                <div style={{ fontSize: 10, color: kpi.color, fontWeight: 600, marginTop: 4 }}>{kpi.delta} vs mês ant.</div>
                <div style={{ height: 3, borderRadius: 2, background: `${kpi.color}30`, marginTop: 8 }}>
                  <div style={{ height: "100%", width: "65%", borderRadius: 2, background: kpi.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ padding: "12px 16px 0", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: "14px", boxShadow: t.shadow }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.text, marginBottom: 12 }}>Receita por Semana</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                {bars.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: i === 2 ? t.chart1 : `${t.chart1}55`, height: `${h}%` }} />
                    <span style={{ fontSize: 8, color: t.textMuted }}>{days[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: "14px", boxShadow: t.shadow }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.text, marginBottom: 12 }}>Por Frota</div>
              {[["FR-001", 62, t.chart1], ["FR-002", 45, t.chart2], ["FR-003", 78, t.chart3]].map(([name, pct, clr]) => (
                <div key={name as string} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: t.textMuted }}>{name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: t.text }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: `${clr}25` }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: clr as string }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ margin: "12px 16px", background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 8, overflow: "hidden", boxShadow: t.shadow }}>
            <div style={{ background: t.tableTh, padding: "8px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
              {["Data", "Frota", "Motorista", "Frete", "Status"].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {[
              ["05/07/26", "FR-001", "José Silva", "R$ 4.800", t.success, "Pago"],
              ["05/07/26", "FR-002", "Carlos Lima", "R$ 3.200", t.warning, "Pendente"],
              ["04/07/26", "FR-003", "Ana Costa", "R$ 5.600", t.success, "Pago"],
            ].map((row, i) => (
              <div key={i} style={{ background: i % 2 === 0 ? t.tableRow : t.tableRowAlt, padding: "8px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8, borderTop: `1px solid ${t.cardBorder}50` }}>
                <span style={{ fontSize: 11, color: t.textMuted }}>{row[0]}</span>
                <span style={{ fontSize: 11, color: t.text, fontWeight: 500 }}>{row[1]}</span>
                <span style={{ fontSize: 11, color: t.text }}>{row[2]}</span>
                <span style={{ fontSize: 11, color: t.text, fontWeight: 600 }}>{row[3]}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: row[4] as string, background: `${row[4]}15`, padding: "2px 7px", borderRadius: 20, display: "inline-block" }}>{row[5]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Label bar */}
      <div style={{ background: t.accent, padding: "5px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#0a192f" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#0a192f99" }}>A — Navy & Gold · Refined Brand</span>
      </div>
    </div>
  );
}
