import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  draftSchema,
  templates,
  type Draft,
} from "../src/lib/domain";
import { escapeXml, overlaySvg } from "../src/lib/poster-layout";
import {
  validateEndpoint,
  providerRequest,
  generateImage,
  ProviderError,
  type BrowserModel,
} from "../src/lib/browser/providers";
const draft: Draft = {
  assetId: "10000000-0000-4000-8000-000000000001",
  templateId: "product-new",
  title: "你好 & <Nova>",
  subtitle: "副标题",
  details: "卖点",
  cta: "了解更多",
  brand: "",
  ratio: "3:4",
  mode: "value",
};
const model: BrowserModel = {
  id: "x",
  mode: "value",
  provider: "test",
  model: "configured-model",
  endpoint: "https://example.com/images/edits",
  adapter: "openai-edit",
  enabled: true,
  credit_cost: 1,
  estimated_cost: 0.2,
  key_last4: "1234",
  api_key: "test-secret-1234",
  created_at: "",
};
test("prompt preserves subject, literal copy and requested dimensions", () => {
  const text = buildPrompt(draft, templates[6]);
  assert.match(text, /保持产品外形/);
  assert.match(text, /不要生成新增文字/);
  assert.match(text, /你好 & <Nova>/);
  assert.match(text, /1200 × 1600/);
});
test("draft rejects missing title, invalid id and unsupported ratio", () => {
  for (const change of [
    { title: " " },
    { assetId: "../../x" },
    { ratio: "16:9" },
  ])
    assert.equal(draftSchema.safeParse({ ...draft, ...change }).success, false);
});
test("overlay escapes user markup", () => {
  assert.equal(escapeXml("<script>&"), "&lt;script&gt;&amp;");
  assert.match(overlaySvg(draft, templates[6]), /你好 &amp; &lt;Nova&gt;/);
});
test("custom HTTPS endpoints work without a backend allowlist", () => {
  assert.equal(validateEndpoint(model.endpoint).hostname, "example.com");
  assert.throws(() => validateEndpoint("http://example.com"));
  assert.throws(() => validateEndpoint("https://user:password@example.com"));
});
test("both adapters send actual reference image and configured key", async () => {
  const image = new Blob(["pixels"], { type: "image/png" });
  const a = await providerRequest(model, "test", image, "9:16");
  assert.equal(a.headers.Authorization, "Bearer test-secret-1234");
  assert.ok(a.body instanceof FormData);
  assert.equal(a.body.get("size"), "1008x1792");
  assert.equal(await (a.body.get("image") as Blob).text(), "pixels");
  const b = await providerRequest(
    { ...model, adapter: "seedream", model: "doubao-seedream-5-0-flash-260915" },
    "test",
    image,
    "1:1",
  );
  const json = JSON.parse(String(b.body));
  assert.equal(json.image, "data:image/png;base64,cGl4ZWxz");
  assert.equal(json.response_format, "b64_json");
  assert.equal("sequential_image_generation" in json, false);
});
test("CORS/network failures are uncertain; 401 is refundable; never retry", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        { error: { message: "Invalid test-secret-1234" } },
        { status: 401 },
      );
    };
    await assert.rejects(
      () => generateImage(model, "test", new Blob(["x"]), "1:1"),
      (e) =>
        e instanceof ProviderError &&
        !e.uncertain &&
        !e.message.includes(model.api_key),
    );
    globalThis.fetch = async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      () => generateImage(model, "test", new Blob(["x"]), "1:1"),
      (e) =>
        e instanceof ProviderError && e.uncertain && e.message.includes("CORS"),
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
