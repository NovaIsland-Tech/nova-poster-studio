import { supabase, check, rpc } from "./client";
import {
  activeProfile,
  buildPrompt,
  draftSchema,
  modelSchema,
  type Job,
  type Profile,
  type Template,
} from "../domain";
import {
  normalizeUpload,
  renderPoster,
  downloadBlob,
  validateReference,
} from "./images";
import {
  generateImage,
  ProviderError,
  testConnection,
  validateEndpoint,
  type BrowserModel,
} from "./providers";
const pending = new Map<string, Promise<void>>();
const localResults = new Map<string, Blob>();
export async function currentProfile() {
  const session = await supabase().auth.getSession();
  check(session.error);
  if (!session.data.session) {
    window.location.replace(
      "/login" +
        (window.location.pathname.startsWith("/admin") ? "?next=/admin" : ""),
    );
    throw new Error("请先登录");
  }
  const result = await supabase()
    .from("nova_profiles")
    .select("*")
    .eq("id", session.data.session.user.id)
    .single();
  check(result.error);
  const profile = result.data as Profile;
  if (!activeProfile(profile))
    throw new Error("账号已停用或到期，请联系管理员");
  return profile;
}
async function rows(table: string, order?: string) {
  let q = supabase().from(table).select("*");
  if (table === "nova_profiles") q = q.is("deleted_at", null);
  if (order) q = q.order(order, { ascending: false });
  const result = await q.limit(100);
  check(result.error);
  return result.data!;
}
async function jobById(id: string) {
  const r = await supabase()
    .from("nova_jobs")
    .select("*")
    .eq("id", id)
    .single();
  check(r.error);
  return r.data as Job;
}
async function models() {
  return (await rows("nova_models", "created_at")) as BrowserModel[];
}
export async function fileBlob(kind: "asset" | "output", id: string) {
  if (kind === "output" && localResults.has(id)) return localResults.get(id)!;
  let path: string | null;
  if (kind === "asset") {
    const r = await supabase()
      .from("nova_assets")
      .select("path")
      .eq("id", id)
      .single();
    check(r.error);
    path = r.data!.path;
  } else path = (await jobById(id)).output_path;
  if (!path) throw new Error("图片不存在");
  const r = await supabase().storage.from("nova-private").download(path);
  check(r.error);
  return r.data!;
}
export async function downloadOutput(id: string) {
  downloadBlob(await fileBlob("output", id), `nova-${id}.png`);
}
export function hasLocalResult(id: string) {
  return localResults.has(id);
}
export async function uploadFile(file: File) {
  const user = await currentProfile();
  if (Number(await rpc("storage-usage")) > 800 * 1024 * 1024)
    throw new Error("图片空间接近免费上限，请先删除旧作品");
  const image = await normalizeUpload(file),
    id = crypto.randomUUID(),
    path = `${user.id}/assets/${id}.png`;
  check(
    (
      await supabase()
        .storage.from("nova-private")
        .upload(path, image, { contentType: "image/png" })
    ).error,
  );
  const saved = await supabase()
    .from("nova_assets")
    .insert({ id, user_id: user.id, path, name: file.name.slice(0, 120) });
  if (saved.error) {
    await supabase().storage.from("nova-private").remove([path]);
    check(saved.error);
  }
  return { id, name: file.name };
}
async function runJob(job: Job) {
  const claimed = (await rpc("claim", { id: job.id })) as Job | null;
  if (!claimed) return;
  let received = false;
  try {
    const model = (await models()).find(
      (m) => m.id === claimed.model_config_id,
    );
    if (!model?.api_key) throw new Error("当前模型配置不可用，请联系管理员");
    const asset = await fileBlob("asset", claimed.draft.assetId);
    await validateReference(asset);
    const background = await generateImage(
      model,
      claimed.prompt,
      asset,
      claimed.draft.ratio,
    );
    received = true;
    const poster = await renderPoster(
      background,
      claimed.draft,
      claimed.template_snapshot!,
    );
    localResults.set(claimed.id, poster);
    const path = `${claimed.user_id}/outputs/${claimed.id}.png`;
    check(
      (
        await supabase()
          .storage.from("nova-private")
          .upload(path, poster, { contentType: "image/png" })
      ).error,
    );
    await rpc("finish", { id: claimed.id, status: "succeeded", path });
  } catch (e) {
    const uncertain = received || (e instanceof ProviderError && e.uncertain);
    const error =
      e instanceof ProviderError
        ? e.message
        : received
          ? "图片已生成，但排版或保存失败。若页面显示下载按钮，请先保存图片，再请管理员核对。"
          : (e as Error).message;
    try {
      await rpc("finish", {
        id: claimed.id,
        status: uncertain ? "uncertain" : "failed",
        error,
      });
    } catch {
      console.error("Nova: 任务状态保存失败，请检查网络");
    }
  }
}
function start(job: Job) {
  if (job.status !== "queued" || pending.has(job.id)) return;
  const task = runJob(job)
    .catch(() => console.error("Nova: 任务启动失败"))
    .finally(() => pending.delete(job.id));
  pending.set(job.id, task);
}
// A browser navigation destroys in-flight requests. Warn while a request runs.
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (event) => {
    if (pending.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
export async function browserApi<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const data = (body || {}) as Record<string, any>;
  const client = supabase();
  if (path === "auth/login") {
    check(
      (
        await client.auth.signInWithPassword({
          email: data.email.trim(),
          password: data.password,
        })
      ).error,
    );
    await currentProfile();
    return {} as T;
  }
  if (path === "auth/logout") {
    check((await client.auth.signOut()).error);
    return {} as T;
  }
  if (path === "auth/password-skip") {
    check((await client.rpc("nova_dismiss_password_prompt")).error);
    return {} as T;
  }
  if (path === "auth/password") {
    const { error } = await client.auth.updateUser({ password: data.password });
    if (
      error &&
      (error.status === 401 ||
        error.status === 403 ||
        error.message.includes("session"))
    ) {
      await client.auth.signOut({ scope: "local" });
      window.location.replace("/login/");
      throw new Error("登录已失效，请使用当前密码重新登录");
    }
    check(error);
    return {} as T;
  }
  const user = await currentProfile();
  if (path === "bootstrap") {
    await rpc("reconcile");
    const [templates, allModels, jobs, settings] = await Promise.all([
      rows("nova_templates"),
      models(),
      client
        .from("nova_jobs")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      rows("nova_settings"),
    ]);
    check(jobs.error);
    // Queued jobs have not called the provider and are safe to resume. Running
    // jobs are never replayed after a reload.
    (jobs.data as Job[]).filter((j) => j.status === "queued").forEach(start);
    return {
      user,
      templates: templates.filter((t) => t.enabled),
      jobs: jobs.data,
      demo: false,
      paused: settings[0].paused,
      modes: allModels
        .filter((m) => m.enabled)
        .map((m) => ({ mode: m.mode, credit_cost: m.credit_cost })),
    } as T;
  }
  if (path === "jobs" && body) {
    const draft = draftSchema.parse(data.draft),
      template = (await rows("nova_templates")).find(
        (t) => t.id === draft.templateId && t.enabled,
      ) as Template | undefined;
    if (!template) throw new Error("模板不可用");
    await validateReference(await fileBlob("asset", draft.assetId));
    const job = (await rpc("enqueue", {
      draft,
      prompt: buildPrompt(draft, template),
      key: data.key,
    })) as Job;
    start(job);
    return job as T;
  }
  if (path === "jobs/delete" || path === "jobs/remove-output") {
    const job = await jobById(data.id);
    if (job.user_id !== user.id) throw new Error("作品不存在");
    if (!["succeeded", "failed"].includes(job.status))
      throw new Error("请等待任务完成或核对后再删除");
    if (job.output_path)
      check(
        (await client.storage.from("nova-private").remove([job.output_path]))
          .error,
      );
    if (path === "jobs/delete")
      check((await client.rpc("nova_delete_work", { p_id: data.id })).error);
    else await rpc("remove-output", { id: data.id });
    localResults.delete(data.id);
    return {} as T;
  }
  if (path.startsWith("jobs/")) {
    await rpc("reconcile");
    return (await jobById(path.split("/")[1])) as T;
  }
  if (!path.startsWith("admin")) throw new Error("未知操作");
  if (user.role !== "admin") throw new Error("仅管理员可进入管理后台");
  if (path === "admin") {
    await rpc("reconcile");
    const [profiles, jobs, allModels, settings, templates, audit, usage] =
      await Promise.all([
        rows("nova_profiles", "created_at"),
        rows("nova_jobs", "created_at"),
        models(),
        rows("nova_settings"),
        rows("nova_templates"),
        rows("nova_audit", "created_at"),
        rpc("storage-usage"),
      ]);
    return {
      profiles,
      jobs,
      models: allModels.map(({ api_key, encrypted_key, ...safe }) => safe),
      settings: settings[0],
      templates,
      audit,
      storageBytes: Number(usage),
      demo: false,
      allowedOrigins: [],
      invitationsReady: true,
      executionMode: "浏览器直连 · 无后台进程",
    } as T;
  }
  const action = path.slice(6);
  if (["create-member", "reset-password", "delete-member"].includes(action)) {
    const actions: Record<string, string> = {
      "create-member": "create",
      "reset-password": "reset-password",
      "delete-member": "delete",
    };
    const result = await client.functions.invoke("nova-members", {
      body: { ...data, action: actions[action] },
    });
    if (result.error) {
      let detail = result.error.message;
      try {
        const payload = await result.error.context.json();
        detail = payload.error || detail;
      } catch {}
      throw new Error(detail);
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data as T;
  }
  if (action === "model-check" || action === "model-test") {
    const m = (await models()).find((m) => m.id === data.id);
    if (!m) throw new Error("模型不存在");
    validateEndpoint(m.endpoint);
    if (action === "model-test") {
      const r = await testConnection(m);
      return {
        ...r,
        request: { endpoint: m.endpoint, httpStatus: r.status },
      } as T;
    }
    return {
      message: "配置格式有效；尚未调用模型。",
      request: {
        endpoint: m.endpoint,
        adapter: m.adapter,
        model: m.model,
        authorization: "Bearer ••••" + m.key_last4,
        output: "data[0].b64_json",
      },
    } as T;
  }
  if (action === "models") {
    modelSchema.parse(data);
    validateEndpoint(data.endpoint);
  }
  if (action === "recovery")
    throw new Error(
      "纯前端不能生成管理员密码重置链接。请到 Supabase → Authentication → Users，为该成员发送密码恢复邮件（需可用的邮件服务）。",
    );
  const result = await rpc(action, data);
  if (action === "invite") {
    const url = new URL("/account/", location.origin);
    url.hash = new URLSearchParams({
      invite: result.token,
      email: result.email,
    }).toString();
    return { url: url.href } as T;
  }
  return result as T;
}
