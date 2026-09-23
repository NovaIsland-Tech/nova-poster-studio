import type { Draft, ModelConfig } from "../domain";
import { base64 } from "./images";
export type BrowserModel = ModelConfig & { api_key: string };
export class ProviderError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function validateEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("请填写完整的 HTTPS 生图接口地址");
  return url;
}
export async function providerRequest(
  model: BrowserModel,
  prompt: string,
  image: Blob,
  ratio: Draft["ratio"],
) {
  validateEndpoint(model.endpoint);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${model.api_key}`,
  };
  let body: BodyInit;
  if (model.adapter === "openai-edit") {
    const form = new FormData();
    form.set("model", model.model);
    form.set("prompt", prompt);
    form.set("n", "1");
    form.set(
      "size",
      ratio === "1:1"
        ? "1024x1024"
        : ratio === "3:4"
          ? "1152x1536"
          : "1008x1792",
    );
    form.set("image", image, "reference.png");
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      model: model.model,
      prompt,
      image: await base64(image),
      size:
        ratio === "1:1"
          ? "2048x2048"
          : ratio === "3:4"
            ? "1728x2304"
            : "1536x2736",
      response_format: "b64_json",
      stream: false,
      watermark: true,
    });
  }
  return { headers, body };
}
async function responseJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("空响应");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 32 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("响应超过 32 MB");
    }
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks as BlobPart[]).text());
}
export async function generateImage(
  model: BrowserModel,
  prompt: string,
  image: Blob,
  ratio: Draft["ratio"],
) {
  const request = await providerRequest(model, prompt, image, ratio);
  let response: Response;
  try {
    response = await fetch(model.endpoint, {
      method: "POST",
      ...request,
      signal: AbortSignal.timeout(240_000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(
      "浏览器无法读取接口响应：可能是跨域（CORS）限制、网络中断或超时。请在供应商后台核对是否已生成；未自动重试。",
      true,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const json = await responseJson(response);
      detail = String(json.error?.message || "")
        .replaceAll(model.api_key, "[已隐藏]")
        .slice(0, 350);
    } catch {}
    throw new ProviderError(
      `HTTP ${response.status}：${detail || "请检查接口地址、密钥、模型和供应商额度"}`,
      response.status >= 500 || response.status === 408,
    );
  }
  try {
    const json = await responseJson(response);
    const raw = json.data?.[0]?.b64_json;
    if (typeof raw !== "string")
      throw new Error(
        "接口需返回 data[0].b64_json，请在供应商配置中启用 base64 图片输出",
      );
    const text = atob(raw.replace(/^data:image\/[\w+.-]+;base64,/, ""));
    return new Blob([Uint8Array.from(text, (c) => c.charCodeAt(0))], {
      type: "image/png",
    });
  } catch (e) {
    throw new ProviderError((e as Error).message || "无法解析模型响应", true);
  }
}
// A real browser request with the same POST method and header names, but no
// image/prompt. Expected 4xx proves CORS readability; it does not test generation.
export async function testConnection(model: BrowserModel) {
  validateEndpoint(model.endpoint);
  const multipart = model.adapter === "openai-edit";
  let response: Response;
  try {
    response = await fetch(model.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${model.api_key}`,
        ...(!multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: multipart ? new FormData() : JSON.stringify({}),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      "直连失败：浏览器无法读取响应，可能是 CORS 限制、网络问题或超时。打开开发者工具的 Network 查看详情。",
    );
  }
  return {
    status: response.status,
    message: `浏览器已读到 HTTP ${response.status}，当前地址可跨域读取。${response.status === 401 || response.status === 403 ? "请检查密钥或权限。" : "空参数探测不代表模型可正常生图；请再到工作台测试。"}`,
  };
}
