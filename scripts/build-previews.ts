/** Render readable reference posters over original AI-generated photography. */
import sharp from "sharp";
import { templates } from "../src/lib/domain";
import { escapeXml } from "../src/lib/poster-layout";
for (const [i, t] of templates.entries()) {
  const light = t.id === "personal-ip" || t.id === "speaker";
  const ink = light ? "#fff8e5" : "#253022";
  const comma = t.title.indexOf("，");
  const title =
    comma > 0
      ? [t.title.slice(0, comma + 1), t.title.slice(comma + 1)]
      : t.title.length > 9
        ? [t.title.slice(0, 6), t.title.slice(6)]
        : [t.title];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><g fill="${ink}" font-family="PingFang SC, sans-serif"><text x="65" y="65" font-size="15" letter-spacing="3">NOVA / ${t.category === "产品" ? "PRODUCT" : t.category === "人物" ? "PEOPLE" : "COURSE"} — 0${i + 1}</text>${title.map((line, n) => `<text x="60" y="${165 + n * 68}" font-size="59" font-weight="650">${escapeXml(line)}</text>`).join("")}<text x="65" y="${200 + title.length * 60}" font-size="19">${escapeXml(t.subtitle)}</text><rect x="55" y="1110" width="790" height="1" fill="${ink}" opacity=".5"/><text x="65" y="1158" font-size="18">${escapeXml(t.cta)} ↗</text><text x="830" y="1158" text-anchor="end" font-size="12" letter-spacing="2">NOVA STUDIO</text></g></svg>`;
  await sharp(`public/artwork/${t.id}.webp`)
    .resize(900, 1200)
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: 86 })
    .toFile(`public/templates/${t.id}.webp`);
}
