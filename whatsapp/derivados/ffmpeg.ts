// Video → versión comprimida para consulta + miniatura (N9 / ajuste 2 de #328).
// El original NUNCA se toca: vive en frio/. Esto produce lo que vive en caliente/.
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FFMPEG = Bun.env.FFMPEG || "ffmpeg";
export const FFPROBE = Bun.env.FFPROBE || "ffprobe";

// Perfil fijo y versionado: si cambia, cambia PERFIL y los derivados viejos se distinguen.
export const PERFIL = "h264-720p-crf28-aac64k-v1";
const ARGS_VIDEO = ["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
  "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale='trunc(iw/2)*2':'trunc(ih/2)*2'",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-f", "mp4"];
const ARGS_MINI = ["-vf", "scale=480:-2", "-frames:v", "1", "-q:v", "5", "-f", "image2"];

async function correr(cmd: string[], limiteMs: number): Promise<{ codigo: number; err: string }> {
  const p = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  const t = setTimeout(() => p.kill(), limiteMs);
  const err = await new Response(p.stderr).text();
  const codigo = await p.exited; clearTimeout(t);
  return { codigo, err: err.slice(-400) };
}

export async function sondear(ruta: string): Promise<{ duracion_s: number | null; ancho: number | null; alto: number | null }> {
  const p = Bun.spawn([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
    "-of", "json", ruta], { stdout: "pipe", stderr: "ignore" });
  const j: any = JSON.parse((await new Response(p.stdout).text()) || "{}"); await p.exited;
  const s = j.streams?.[0] || {};
  return { duracion_s: j.format?.duration ? Number(j.format.duration) : null, ancho: s.width ?? null, alto: s.height ?? null };
}

export type ResultadoVideo = { comprimido: Uint8Array; miniatura: Uint8Array; perfil: string;
  original: { duracion_s: number | null; ancho: number | null; alto: number | null };
  salida: { duracion_s: number | null; ancho: number | null; alto: number | null } };

// Tiempo límite: 10 min por video (un video de WhatsApp dura ≤ 3 min en la práctica).
export async function comprimirVideo(original: Uint8Array, limiteMs = 10 * 60 * 1000): Promise<ResultadoVideo> {
  const dir = mkdtempSync(join(tmpdir(), "memoria-video-"));
  try {
    const ent = join(dir, "in"), sal = join(dir, "out.mp4"), mini = join(dir, "mini.jpg");
    writeFileSync(ent, original);
    const info = await sondear(ent);
    const v = await correr([FFMPEG, "-hide_banner", "-nostdin", "-y", "-i", ent, ...ARGS_VIDEO, sal], limiteMs);
    if (v.codigo !== 0 || !existsSync(sal)) throw new Error(`FFMPEG_VIDEO: ${v.err}`);
    // Miniatura en el segundo 1 (o en el 0 si dura menos).
    const ss = info.duracion_s && info.duracion_s > 1.5 ? "1" : "0";
    const m = await correr([FFMPEG, "-hide_banner", "-nostdin", "-y", "-ss", ss, "-i", ent, ...ARGS_MINI, mini], 60_000);
    if (m.codigo !== 0 || !existsSync(mini)) throw new Error(`FFMPEG_MINIATURA: ${m.err}`);
    return { comprimido: new Uint8Array(readFileSync(sal)), miniatura: new Uint8Array(readFileSync(mini)),
      perfil: PERFIL, original: info, salida: await sondear(sal) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
