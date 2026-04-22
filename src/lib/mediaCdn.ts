const CLOUDINARY_FETCH_BASE = process.env.NEXT_PUBLIC_CLOUDINARY_FETCH_BASE?.trim() || "";
const MEDIA_ORIGIN =
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN?.trim() || "https://eightball-arena-web.onrender.com";

type CdnOptions = {
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "fill";
};

function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${MEDIA_ORIGIN}${normalizedPath}`;
}

export function optimizeMediaUrl(pathOrUrl: string, opts: CdnOptions = {}): string {
  if (!CLOUDINARY_FETCH_BASE) return pathOrUrl;
  const transforms = ["f_auto", "q_auto"];
  if (opts.width && Number.isFinite(opts.width)) transforms.push(`w_${Math.max(1, Math.round(opts.width))}`);
  if (opts.height && Number.isFinite(opts.height)) transforms.push(`h_${Math.max(1, Math.round(opts.height))}`);

  if (opts.fit === "cover") transforms.push("c_fill");
  else if (opts.fit === "fill") transforms.push("c_scale");
  else transforms.push("c_fit");

  const absolute = toAbsoluteUrl(pathOrUrl);
  const encoded = encodeURIComponent(absolute);
  return `${CLOUDINARY_FETCH_BASE}/${transforms.join(",")}/${encoded}`;
}

