import { sizes, type Draft, type Template } from "./domain";
export const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function wrap(text: string, max: number) {
  const out: string[] = [];
  let row = "";
  let weight = 0;
  for (const char of text) {
    const w = /[\u0000-\u00ff]/.test(char) ? 0.55 : 1;
    if (weight + w > max) {
      out.push(row);
      row = "";
      weight = 0;
    }
    row += char;
    weight += w;
  }
  if (row) out.push(row);
  return out;
}
export function overlaySvg(draft: Draft, t: Template, demo = false) {
  const [w, h] = sizes[draft.ratio];
  const margin = w * 0.07;
  const font = w * 0.065;
  const titles = wrap(draft.title, 12);
  const subtitleY = h * 0.16 + titles.length * font * 1.2;
  const line = (text: string, y: number, size: number, weight = 400) =>
    `<text x="${margin}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${t.ink}">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="fade" x2="0" y2="1"><stop stop-color="${t.color}" stop-opacity=".96"/><stop offset="1" stop-color="${t.color}" stop-opacity="0"/></linearGradient></defs><rect width="${w}" height="${h * 0.45}" fill="url(#fade)"/><g font-family="Noto Sans CJK SC, PingFang SC, sans-serif">${line(draft.brand || "", h * 0.065, w * 0.019, 600)}${titles.map((s, i) => line(s, h * 0.16 + i * font * 1.2, font, 700)).join("")}${wrap(
    draft.subtitle,
    25,
  )
    .map((s, i) => line(s, subtitleY + i * w * 0.035, w * 0.026))
    .join(
      "",
    )}<rect y="${h * 0.875}" width="${w}" height="${h * 0.125}" fill="${t.color}" fill-opacity=".94"/>${wrap(
    draft.details,
    36,
  )
    .map((s, i) => line(s, h * 0.9 + i * w * 0.022, w * 0.017))
    .join(
      "",
    )}${line(draft.cta, h * 0.974, w * 0.024, 600)}${demo ? `<text x="${w - margin}" y="${h * 0.974}" text-anchor="end" fill="${t.ink}" font-size="${w * 0.015}">排版演示 · 非 AI 生成</text>` : ""}</g></svg>`;
}
