// src/lib/widget-config.ts

export type WidgetType = "value" | "chart" | "bar" | "gauge" | "status" | "trend";

export interface ThresholdItem {
  value: number;
  color: string;
  label?: string;
}

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetItem {
  key: string;
  keys?: string[];
  colors?: string[];
  keyDecimals?: number[];
  label: string;
  type: WidgetType;
  unit?: string;
  size?: string;
  range?: string;
  min?: number;
  max?: number;
  onValue?: string;
  color?: string;
  decimals?: number;
  thresholds?: ThresholdItem[];
  gridPos?: GridPos;
}

// ─── Widget type metadata ────────────────────────────────────────────────────

export const WIDGET_TYPES: {
  value: WidgetType;
  label: string;
  desc: string;
  icon: string;
  defaultSize: string;
}[] = [
  { value: "value",  label: "Nilai",  desc: "Angka real-time besar",   icon: "hash",        defaultSize: "small"  },
  { value: "trend",  label: "Tren",   desc: "Nilai + sparkline mini",   icon: "trending-up", defaultSize: "small"  },
  { value: "gauge",  label: "Gauge",  desc: "Meter setengah lingkaran", icon: "gauge",       defaultSize: "small"  },
  { value: "status", label: "Status", desc: "Indikator ON / OFF",       icon: "toggle",      defaultSize: "small"  },
  { value: "chart",  label: "Area",   desc: "Grafik area historis",     icon: "area",        defaultSize: "medium" },
  { value: "bar",    label: "Bar",    desc: "Grafik batang historis",   icon: "bar",         defaultSize: "medium" },
];

// ─── Default grid sizes per type ─────────────────────────────────────────────
//
// Grid total = 80 kolom, rowHeight = 80px
// Layout target:
//   - Widget kecil (value/gauge/status/trend): w=20 (¼ lebar), h=3 (~240px)
//   - Widget chart/bar: w=40 (½ lebar), h=4 (~320px)
//
// Auto-placement: 4 kolom untuk widget kecil, 2 kolom untuk chart
// Baris baru otomatis setelah 4 widget kecil atau 2 chart

export function defaultGridPos(type: WidgetType, index: number): GridPos {
  const isWide = type === "chart" || type === "bar";

  if (isWide) {
    // Chart: 2 per baris, w=40, h=4
    const col = index % 2;
    const row = Math.floor(index / 2);
    return { x: col * 40, y: row * 4, w: 40, h: 4 };
  } else {
    // Widget kecil: 4 per baris, w=20, h=3
    const col = index % 4;
    const row = Math.floor(index / 4);
    return { x: col * 20, y: row * 3, w: 20, h: 3 };
  }
}

// ─── Size (legacy, masih dipakai untuk fallback) ──────────────────────────────

export const SIZE_OPTIONS = [
  { value: "small",  label: "Kecil",  colSpan: "col-span-1"                  },
  { value: "medium", label: "Sedang", colSpan: "md:col-span-2"               },
  { value: "large",  label: "Besar",  colSpan: "md:col-span-2 xl:col-span-3" },
];

export function getSizeClass(size: string | undefined, type: WidgetType): string {
  const found = SIZE_OPTIONS.find((s) => s.value === size);
  if (found) return found.colSpan;
  return type === "chart" || type === "bar" ? "md:col-span-2" : "col-span-1";
}

// ─── Range ───────────────────────────────────────────────────────────────────

export const RANGE_OPTIONS = [
  { value: "1h",  label: "1 Jam",   ms: 60 * 60 * 1000           },
  { value: "6h",  label: "6 Jam",   ms: 6 * 60 * 60 * 1000       },
  { value: "24h", label: "24 Jam",  ms: 24 * 60 * 60 * 1000      },
  { value: "7d",  label: "7 Hari",  ms: 7 * 24 * 60 * 60 * 1000  },
  { value: "30d", label: "30 Hari", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function getActiveRange(rangeValue?: string) {
  return RANGE_OPTIONS.find((r) => r.value === (rangeValue ?? "1h")) ?? RANGE_OPTIONS[0];
}

// ─── Threshold helper ─────────────────────────────────────────────────────────

export function resolveThresholdColor(
  value: any,
  thresholds: ThresholdItem[] | undefined,
  baseColor: string
): string {
  if (!thresholds || thresholds.length === 0) return baseColor;
  const num = Number(value);
  if (isNaN(num)) return baseColor;
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  let active = baseColor;
  for (const t of sorted) {
    if (num >= t.value) active = t.color;
  }
  return active;
}

// ─── Chart data ───────────────────────────────────────────────────────────────

export function getChartData(item: WidgetItem, logs: any[]) {
  const rangeOpt = getActiveRange(item.range);
  const cutoff   = Date.now() - rangeOpt.ms;
  const isMulti  = item.type === "chart" && (item.keys?.length ?? 0) > 1;

  const filtered = logs.filter((l) => l.created_at && new Date(l.created_at).getTime() >= cutoff);

  // Ambil 200 data terakhir agar chart selalu menampilkan data terbaru
  const sampled = filtered.length > 200 ? filtered.slice(-200) : filtered;

  return sampled.map((l) => {
    const time = rangeOpt.ms > 24 * 60 * 60 * 1000
      ? new Date(l.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
      : new Date(l.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    if (isMulti) {
      const point: any = { time };
      item.keys!.forEach((k) => { point[k] = Number(l.payload?.[k] ?? 0); });
      return point;
    }
    return { time, val: Number(l.payload?.[item.key] ?? 0) };
  });
}

export function getSparklineData(item: WidgetItem, logs: any[]) {
  return logs.slice(-20).map((l) => ({ val: Number(l.payload?.[item.key] ?? 0) }));
}

export function getLatestPayload(logs: any[]): Record<string, any> {
  if (logs.length === 0) return {};
  const raw = logs[logs.length - 1].payload;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw ?? {};
}

export function isStatusOn(value: any, onValue?: string): boolean {
  if (value === null || value === undefined) return false;
  const v = String(value).toLowerCase().trim();
  if (onValue) return v === onValue.toLowerCase().trim();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function defaultColor(type: WidgetType): string {
  const map: Record<WidgetType, string> = {
    value: "#3b82f6", trend: "#8b5cf6", gauge: "#f59e0b",
    status: "#10b981", chart: "#3b82f6", bar: "#6366f1",
  };
  return map[type] ?? "#3b82f6";
}