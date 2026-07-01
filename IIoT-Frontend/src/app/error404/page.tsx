"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Frown } from "lucide-react";

/**
 * Standalone full-page error/empty-state screen (lives outside the dashboard
 * layout, so no sidebar — this is meant to be the whole viewport).
 *
 * Usage: router.replace(`/error404?reason=no-gateway&projectId=${projectId}`)
 *
 * Query params:
 * - reason: "no-gateway" | "load-failed" | anything else (falls back to a generic 404)
 * - projectId: optional, only used to personalize the "no-gateway" message
 * - back: optional override for the button's destination (default: /dashboard/projects)
 */

const REASONS: Record<string, { title: string; message: (projectId: string | null) => string }> = {
  "no-gateway": {
    title: "Belum Ada Gateway",
    message: (projectId) =>
      `Project ${projectId ? `#${projectId}` : ""} belum punya gateway yang terhubung. Tambahkan gateway dulu untuk mulai melihat data telemetri.`,
  },
  "load-failed": {
    title: "Gagal Memuat Data",
    message: () => "Terjadi masalah saat mengambil data dari server. Coba muat ulang halaman ini.",
  },
  "session-expired": {
    title: "Sesi Berakhir",
    message: () => "Sesi login kamu sudah habis. Silakan login kembali untuk melanjutkan.",
  },
  "unauthorized": {
    title: "Akses Ditolak",
    message: () => "Kamu tidak punya izin untuk mengakses halaman ini.",
  },
};

const DEFAULT_REASON = {
  title: "Halaman Tidak Ditemukan",
  message: () => "Kami tidak bisa menemukan halaman atau data yang kamu cari.",
};

export default function Error404Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reasonKey = searchParams.get("reason") ?? "";
  const projectId = searchParams.get("projectId");

  // No explicit `back` param → guess a safe default from the reason itself,
  // rather than always falling back to a dashboard route. A pre-login error
  // (e.g. "session-expired") should never bounce toward /dashboard/*, since
  // the auth guard there would just bounce it again toward /login.
  const AUTH_REASONS = new Set(["session-expired", "unauthorized", "login-failed"]);
  const fallbackBack = AUTH_REASONS.has(reasonKey) ? "/login" : "/dashboard/projects";
  const backTarget = searchParams.get("back") ?? fallbackBack;

  const reason = REASONS[reasonKey] ?? DEFAULT_REASON;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 flex flex-col items-center justify-center px-6">

      {/* ── Decorative grid pattern, corners ─────────────────────────────── */}
      <div
        className="pointer-events-none absolute -top-4 -right-4 w-72 h-72 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "linear-gradient(to bottom left, black 30%, transparent 75%)",
          WebkitMaskImage: "linear-gradient(to bottom left, black 30%, transparent 75%)",
        }}
      >
        <div className="absolute top-[72px] right-[108px] w-9 h-9 bg-slate-800/60 rounded-sm" />
        <div className="absolute top-[144px] right-[36px] w-9 h-9 bg-slate-800/60 rounded-sm" />
      </div>
      <div
        className="pointer-events-none absolute -bottom-4 -left-4 w-72 h-72 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "linear-gradient(to top right, black 30%, transparent 75%)",
          WebkitMaskImage: "linear-gradient(to top right, black 30%, transparent 75%)",
        }}
      >
        <div className="absolute bottom-[72px] left-[108px] w-9 h-9 bg-slate-800/60 rounded-sm" />
        <div className="absolute bottom-[144px] left-[36px] w-9 h-9 bg-slate-800/60 rounded-sm" />
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center text-center">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-100 uppercase">
          {reason.title === DEFAULT_REASON.title ? "Error" : reason.title}
        </h1>

        <div className="mt-8 flex items-center justify-center gap-3 sm:gap-5">
          <span className="text-8xl sm:text-9xl font-black text-blue-500 leading-none select-none">4</span>
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-blue-500 bg-blue-500/10 flex items-center justify-center">
            <Frown className="w-11 h-11 sm:w-12 sm:h-12 text-blue-400" strokeWidth={2.5} />
          </div>
          <span className="text-8xl sm:text-9xl font-black text-blue-500 leading-none select-none">4</span>
        </div>

        <p className="mt-8 max-w-md text-sm sm:text-base font-medium text-slate-400">
          {reason.message(projectId)}
        </p>

        <button
          onClick={() => router.push(backTarget)}
          className="mt-8 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-all cursor-pointer border border-slate-700 shadow-lg"
        >
          {backTarget === "/login" ? "Kembali ke Halaman Login" : "Kembali ke Halaman Utama"}
        </button>
      </div>

      <p className="relative mt-16 text-xs text-slate-500">
        © {new Date().getFullYear()} · Dragonfly.io
      </p>
    </div>
  );
}