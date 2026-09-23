import { sizes, type Draft, type Template } from "../domain";
import { overlaySvg } from "../poster-layout";
async function load(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败"))),
      "image/png",
    ),
  );
}
export async function validateReference(blob: Blob) {
  const image = await load(blob);
  const width = image.naturalWidth,
    height = image.naturalHeight;
  if (width < 14 || height < 14)
    throw new Error(
      `素材实际尺寸仅 ${width}×${height} 像素，宽和高都必须至少 14 像素。请返回第一步，更换清晰原图或使用示例图片。`,
    );
  return image;
}
export async function normalizeUpload(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("请选择 10 MB 以内的 JPG、PNG 或 WebP 图片");
  const image = await validateReference(file);
  if (image.width * image.height > 25_000_000)
    throw new Error("图片像素过大，请缩小到 2500 万像素以内");
  const scale = Math.min(1, 1800 / image.width, 1800 / image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = await png(canvas);
  const exported = await load(result);
  if (
    exported.naturalWidth !== canvas.width ||
    exported.naturalHeight !== canvas.height
  )
    throw new Error(
      `浏览器处理后的图片尺寸异常（${exported.naturalWidth}×${exported.naturalHeight}）。请换一个浏览器重新上传。`,
    );
  await validateReference(result);
  return result;
}
export async function renderPoster(
  background: Blob,
  draft: Draft,
  template: Template,
) {
  const image = await load(background);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = sizes[draft.ratio];
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = template.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(
    canvas.width / image.width,
    canvas.height / image.height,
  );
  const w = image.width * scale,
    h = image.height * scale;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const overlay = await load(
    new Blob([overlaySvg(draft, template)], { type: "image/svg+xml" }),
  );
  ctx.drawImage(overlay, 0, 0);
  return png(canvas);
}
export async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
