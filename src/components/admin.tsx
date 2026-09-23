"use client";
import { useState } from "react";
import {
  Activity,
  Users,
  KeyRound,
  Images,
  Settings,
  ScrollText,
  LayoutGrid,
  ArrowLeft,
  Plus,
  Copy,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  Pause,
  Play,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import type {
  Audit,
  Job,
  ModelConfig,
  Profile,
  Settings as SiteSettings,
  Template,
} from "@/lib/domain";
import { api, Brand, Button, Field, Notice, Empty } from "./ui";
export type AdminData = {
  profiles: Profile[];
  jobs: Job[];
  models: Omit<ModelConfig, "encrypted_key">[];
  settings: SiteSettings;
  templates: Template[];
  audit: Audit[];
  demo: boolean;
  allowedOrigins: string[];
  storageBytes: number;
  executionMode: string;
  invitationsReady: boolean;
};
export function Admin({ initial }: { initial: AdminData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState(false);
  const [link, setLink] = useState("");
  const [member, setMember] = useState<Profile | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [debug, setDebug] = useState("");
  const [preset, setPreset] = useState<"openai-edit" | "seedream">(
    "openai-edit",
  );
  const [inspect, setInspect] = useState<Job | null>(null);
  const navigation = [
    { id: "overview", name: "概览", icon: LayoutGrid },
    { id: "members", name: "成员与额度", icon: Users },
    { id: "models", name: "模型配置", icon: KeyRound },
    { id: "templates", name: "模板管理", icon: Images },
    { id: "jobs", name: "生成任务", icon: Activity },
    { id: "audit", name: "操作记录", icon: ScrollText },
    { id: "settings", name: "站点设置", icon: Settings },
  ];
  const title = navigation.find((n) => n.id === tab)?.name || "概览";
  async function perform(
    path: string,
    body: unknown,
    onSuccess?: (r: Record<string, unknown>) => void,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api(path, body);
      setData(await api<AdminData>("admin"));
      setMessage("已保存");
      onSuccess?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const completed = data.jobs.filter((j) => j.status === "succeeded");
  const pending = data.jobs.filter((j) =>
    ["queued", "running", "uncertain"].includes(j.status),
  );
  const field = (form: FormData, name: string) => String(form.get(name) || "");
  function changeTab(id: string) {
    setTab(id);
    setError("");
    setMessage("");
    setDebug("");
  }
  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          管理控制台 <span>ADMIN</span>
        </div>
        <nav aria-label="管理导航">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => changeTab(n.id)}
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "jobs" && pending.length > 0 && (
                <span className="count-bubble">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-secure">
            <ShieldCheck size={23} />
            <strong>专属管理空间</strong>
            <p>
              浏览器直接调用模型
              <br />
              所有操作记录可追溯
            </p>
          </div>
          <a className="help-link" href="/">
            <ArrowLeft size={16} />
            返回创作工作台
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Nova 管理后台 <span>/</span>
            <strong>{title}</strong>
          </div>
          <span className="topbar-right">
            <span className="status-dot" />
            {data.demo ? "DEMO ENVIRONMENT" : "SUPABASE FREE"}
          </span>
        </header>
        <main className="workspace admin-workspace">
          <section className="page-heading">
            <div>
              <div className="eyebrow">STUDIO CONTROL CENTER</div>
              <h1 className="admin-page-title">{title}</h1>
              <p>
                {
                  {
                    overview: "让创作顺畅发生，让每一次使用都有迹可循。",
                    members: "通过邮箱开通成员，管理登录权限、使用期限与额度。",
                    models: "统一配置模型，为不同创作需求选择合适的引擎。",
                    templates: "调整默认文案和视觉描述，让每一个起点更合适。",
                    jobs: "查看生成状态、模型版本与问题任务。",
                    audit: "关键配置和成员操作均在这里记录。",
                    settings: "管理站点生成开关与每日估算预算。",
                  }[tab]
                }
              </p>
            </div>
            <Button
              variant="secondary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setData(await api<AdminData>("admin"));
                  setMessage("已刷新");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={15} />
              刷新数据
            </Button>
          </section>
          {data.demo && (
            <Notice>
              本地演示后台：仅用于体验操作，无法创建真实成员或调用真实模型。
            </Notice>
          )}
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {tab === "overview" && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: "工作空间成员",
                    value: data.profiles.length,
                    desc: `${data.profiles.filter((p) => p.active).length} 位已启用`,
                    icon: Users,
                  },
                  {
                    label: "已生成作品",
                    value: completed.length,
                    desc: "最近 100 个任务",
                    icon: Images,
                  },
                  {
                    label: "进行中的任务",
                    value: pending.length,
                    desc: "含等待人工核对",
                    icon: Activity,
                  },
                  {
                    label: "任务估算成本",
                    value: `¥${data.jobs.reduce((n, j) => n + Number(j.estimated_cost), 0).toFixed(2)}`,
                    desc: "最近 100 个任务 · 非供应商账单",
                    icon: SlidersHorizontal,
                  },
                ].map((s) => (
                  <article className="stat-card" key={s.label}>
                    <div>
                      {s.label}
                      <s.icon size={18} />
                    </div>
                    <strong>{s.value}</strong>
                    <small>{s.desc}</small>
                  </article>
                ))}
              </div>
              <div className="admin-two">
                <section className="panel">
                  <div className="panel-title">
                    <h2>模型服务</h2>
                    <button
                      className="text-link"
                      onClick={() => changeTab("models")}
                    >
                      配置模型 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {(["value", "flagship"] as const).map((mode) => {
                    const model = data.models.find(
                      (m) => m.mode === mode && m.enabled,
                    );
                    return (
                      <div className="service-row" key={mode}>
                        <span
                          className={`service-icon ${model ? "online" : ""}`}
                        >
                          <KeyRound size={20} />
                        </span>
                        <div>
                          <strong>
                            {mode === "value" ? "性价比模式" : "旗舰模式"}
                          </strong>
                          <small>
                            {model
                              ? `${model.provider} · ${model.model}`
                              : "尚未配置，用户暂不可生成"}
                          </small>
                        </div>
                        <span className={`pill ${model ? "green" : ""}`}>
                          {model ? "已启用" : "待配置"}
                        </span>
                      </div>
                    );
                  })}
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>快速开始</h2>
                  </div>
                  <div className="quick-actions">
                    <button onClick={() => changeTab("models")}>
                      <span>01</span>
                      <div>
                        <strong>配置你的第一个模型</strong>
                        <small>选择接口类型，保存 API Key</small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                    <button
                      disabled={!data.invitationsReady}
                      onClick={() => {
                        changeTab("members");
                        setInvite(true);
                      }}
                    >
                      <span>02</span>
                      <div>
                        <strong>添加你的创作者</strong>
                        <small>创建专属账号，分配额度</small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                    <a href="/">
                      <span>03</span>
                      <div>
                        <strong>完成一次真实生成</strong>
                        <small>上传素材，验证模型输出</small>
                      </div>
                      <ArrowUpRight size={18} />
                    </a>
                  </div>
                </section>
              </div>
              <Notice>
                图片已用 {(data.storageBytes / 1024 / 1024).toFixed(1)} MB /
                免费 1 GB。生成方式：{data.executionMode}
                。<br />
                当前仅使用 Supabase 免费功能。图片请及时下载保存；免费额度用量以
                Supabase 控制台为准，不会自动升级套餐。
              </Notice>
            </>
          )}
          {tab === "members" && (
            <>
              {!data.invitationsReady && (
                <Notice>
                  邀请开户的认证设置尚待确认，目前仅现有账号可以登录。
                </Notice>
              )}
              <div className="toolbar">
                <span>{data.profiles.length} 位成员</span>
                <Button
                  disabled={!data.invitationsReady}
                  onClick={() => {
                    setInvite(true);
                    setLink("");
                  }}
                >
                  <Plus size={16} />
                  添加成员
                </Button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>状态</th>
                      <th>登录密码</th>
                      <th>剩余额度</th>
                      <th>旗舰模式</th>
                      <th>使用期限</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.profiles.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>
                            {p.name}{" "}
                            {p.role === "admin" && (
                              <span className="pill">管理员</span>
                            )}
                          </strong>
                          <small>{p.email}</small>
                        </td>
                        <td>
                          <span className={`pill ${p.active ? "green" : ""}`}>
                            {p.deletion_pending
                              ? "删除待完成"
                              : p.active
                                ? "已启用"
                                : "已停用"}
                          </span>
                        </td>
                        <td>
                          {p.password_state === "temporary" ? (
                            <span className="pill">初始密码 123456</span>
                          ) : (
                            <small>
                              {p.password_state === "changed"
                                ? "用户已修改"
                                : "已设置"}{" "}
                              · 不可查看
                            </small>
                          )}
                        </td>
                        <td>{p.credits} 点</td>
                        <td>{p.flagship ? "已开通" : "未开通"}</td>
                        <td>
                          {p.expires_at
                            ? new Date(p.expires_at).toLocaleDateString("zh-CN")
                            : "长期有效"}
                        </td>
                        <td>
                          <button
                            className="text-link"
                            onClick={() => setMember(p)}
                          >
                            管理
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "models" && (
            <>
              <div className="admin-two model-columns">
                <section className="panel">
                  <div className="panel-title">
                    <h2>新增模型配置</h2>
                    <span className="pill">数据库保存</span>
                  </div>
                  <form
                    key={preset}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const form = e.currentTarget;
                      perform(
                        "admin/models",
                        {
                          mode: field(f, "mode"),
                          adapter: preset,
                          provider: field(f, "provider"),
                          model: field(f, "model"),
                          endpoint: field(f, "endpoint"),
                          apiKey: field(f, "apiKey"),
                          credit_cost: Number(f.get("credit_cost")),
                          estimated_cost: Number(f.get("estimated_cost")),
                          enabled: f.get("enabled") === "on",
                        },
                        () => {
                          form.reset();
                          setMessage(
                            "模型配置已保存到数据库。请到创作工作台完成一次真实生成测试。",
                          );
                        },
                      );
                    }}
                  >
                    <Field label="接口类型">
                      <select
                        value={preset}
                        onChange={(e) =>
                          setPreset(e.target.value as typeof preset)
                        }
                      >
                        <option value="openai-edit">
                          OpenAI 图片编辑 · multipart/form-data
                        </option>
                        <option value="seedream">
                          豆包 Seedream · JSON 图生图
                        </option>
                      </select>
                    </Field>
                    <div className="field-row">
                      <Field label="绑定模式">
                        <select name="mode">
                          <option value="value">性价比模式</option>
                          <option value="flagship">旗舰模式</option>
                        </select>
                      </Field>
                      <Field label="供应商名称">
                        <input
                          name="provider"
                          required
                          maxLength={80}
                          defaultValue={
                            preset === "openai-edit" ? "OpenAI" : "火山方舟"
                          }
                        />
                      </Field>
                    </div>
                    <Field label="完整接口地址">
                      <input
                        name="endpoint"
                        type="url"
                        required
                        defaultValue={
                          preset === "openai-edit"
                            ? "https://api.openai.com/v1/images/edits"
                            : "https://ark.cn-beijing.volces.com/api/v3/images/generations"
                        }
                      />
                    </Field>
                    <Field
                      label="模型名称 / 推理接入点 ID"
                      hint="填写官方请求中的 model 值，不是展示名称"
                    >
                      <input
                        name="model"
                        required
                        maxLength={100}
                        defaultValue={
                          preset === "seedream"
                            ? "doubao-seedream-5-0-flash-260915"
                            : ""
                        }
                        placeholder={
                          preset === "openai-edit"
                            ? "例如 gpt-image-2"
                            : "例如 doubao-seedream-5-0-flash-260915"
                        }
                      />
                    </Field>
                    <Field
                      label="API Key"
                      hint="浏览器直连使用，界面仅显示末四位"
                    >
                      <input
                        name="apiKey"
                        type="password"
                        required
                        minLength={8}
                        maxLength={2048}
                        autoComplete="off"
                        placeholder="粘贴供应商提供的密钥"
                      />
                    </Field>
                    <div className="field-row">
                      <Field label="每次消耗额度">
                        <input
                          name="credit_cost"
                          type="number"
                          defaultValue={1}
                          min={1}
                          max={1000}
                          required
                        />
                      </Field>
                      <Field label="每次估算成本（人民币）">
                        <input
                          name="estimated_cost"
                          type="number"
                          defaultValue="0.2"
                          min="0.0001"
                          max="10000"
                          step="0.0001"
                          required
                        />
                      </Field>
                    </div>
                    <label className="checkbox-field">
                      <input type="checkbox" name="enabled" defaultChecked />
                      保存后启用，替换该模式当前配置
                    </label>
                    <Button type="submit" busy={busy}>
                      <ShieldCheck size={16} />
                      保存配置
                    </Button>
                  </form>
                </section>
                <div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>已保存的模型</h2>
                      <span>{data.models.length} 个版本</span>
                    </div>
                    {data.models.length === 0 ? (
                      <Empty title="还没有模型配置">
                        填写左侧配置后，用户就可以使用对应模式。
                      </Empty>
                    ) : (
                      data.models.slice(0, 8).map((m) => (
                        <div className="saved-model" key={m.id}>
                          <div>
                            <strong>{m.provider}</strong>
                            <span
                              className={`pill ${m.enabled ? "green" : ""}`}
                            >
                              {m.enabled ? "当前启用" : "历史版本"}
                            </span>
                          </div>
                          <p>{m.model}</p>
                          <small>
                            {m.mode === "value" ? "性价比" : "旗舰"} ·{" "}
                            {m.credit_cost} 点 / 次 · Key ••••{m.key_last4}
                          </small>
                          <button
                            className="text-link"
                            onClick={() =>
                              perform(
                                "admin/model-check",
                                { id: m.id },
                                (r) => {
                                  setDebug(JSON.stringify(r.request, null, 2));
                                  setMessage(String(r.message));
                                },
                              )
                            }
                          >
                            检查配置与请求格式 <ArrowUpRight size={14} />
                          </button>
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() =>
                              perform("admin/model-test", { id: m.id }, (r) => {
                                setMessage(String(r.message));
                                setDebug(JSON.stringify(r.request, null, 2));
                              })
                            }
                          >
                            浏览器直连测试 <ArrowUpRight size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </section>
                  <section className="panel subtle">
                    <h3>调试说明</h3>
                    <p>
                      保存配置不会发起请求。“浏览器直连测试”发送空参数 POST
                      探测跨域响应，不验证出图；真实生图测试请返回工作台上传素材。
                    </p>
                    <p>
                      接口需返回 <code>data[0].b64_json</code>
                      。支持自定义 HTTPS
                      网关，供应商必须允许浏览器跨域调用；聊天接口不能直接用于生图。
                    </p>
                    <small>
                      API Key 存在数据库中，可被已启用成员读取，用于浏览器直连。
                    </small>
                    {debug && <pre className="code-block">{debug}</pre>}
                  </section>
                </div>
              </div>
            </>
          )}
          {tab === "templates" && (
            <div className="template-grid">
              {data.templates.map((t) => (
                <button
                  className="template-card"
                  key={t.id}
                  onClick={() => setTemplate(t)}
                >
                  <div className="template-image">
                    <img src={`/templates/${t.id}.webp`} alt={t.name} />
                    <span className="template-image-tag">
                      {t.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <div className="template-caption">
                    <strong>{t.name}</strong>
                    <span>
                      编辑 <ArrowUpRight size={14} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "jobs" && (
            <>
              <Notice>
                成本为配置中的人民币估算值，包含失败或待核对任务，实际费用请核对供应商账单。状态不确定的任务不会自动重试。
              </Notice>
              {data.jobs.length === 0 ? (
                <Empty title="还没有生成任务">
                  完成一次生成后，可以在这里查看调试信息。
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>任务 / 标题</th>
                        <th>用户</th>
                        <th>模型</th>
                        <th>状态</th>
                        <th>额度 / 估算成本</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map((j) => (
                        <tr key={j.id}>
                          <td>
                            <strong>{j.draft.title}</strong>
                            <small>
                              {j.id.slice(0, 8)} ·{" "}
                              {new Date(j.created_at).toLocaleString("zh-CN")}
                            </small>
                          </td>
                          <td>
                            {data.profiles.find((p) => p.id === j.user_id)
                              ?.name || j.user_id.slice(0, 8)}
                          </td>
                          <td>{j.model_label}</td>
                          <td>
                            <span
                              className={`pill ${j.status === "succeeded" ? "green" : ""}`}
                            >
                              {
                                {
                                  queued: "排队中",
                                  running: "生成中",
                                  succeeded: "已完成",
                                  failed: "失败",
                                  uncertain: "待核对",
                                }[j.status]
                              }
                            </span>
                          </td>
                          <td>
                            {j.credits} 点 / ¥
                            {Number(j.estimated_cost).toFixed(2)}
                          </td>
                          <td>
                            <button
                              className="text-link"
                              onClick={() => setInspect(j)}
                            >
                              详情
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {tab === "audit" && (
            <section className="panel">
              {data.audit.length === 0 ? (
                <Empty title="暂无操作记录" />
              ) : (
                data.audit.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <span className="audit-dot" />
                    <div>
                      <strong>{a.action}</strong>
                      <p>{a.detail}</p>
                    </div>
                    <time>
                      {new Date(a.created_at).toLocaleString("zh-CN")}
                    </time>
                  </div>
                ))
              )}
            </section>
          )}
          {tab === "settings" && (
            <section className="panel settings-panel">
              <h2>生成与预算</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  perform("admin/settings", {
                    paused: f.get("paused") === "on",
                    daily_budget: Number(f.get("budget")),
                  });
                }}
              >
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    name="paused"
                    defaultChecked={data.settings.paused}
                  />
                  暂停全站新任务
                </label>
                <p className="muted">
                  已调用供应商的任务可能继续完成，尚未开始的任务会关闭并退回额度。
                </p>
                <Field label="每日估算预算上限（人民币）">
                  <input
                    name="budget"
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    defaultValue={data.settings.daily_budget}
                    required
                  />
                </Field>
                <p className="muted">
                  按北京时间每日重置。预算基于模型配置中的单次估算成本累计；要限制真实账单，还需在供应商后台设置消费上限。
                </p>
                <Button busy={busy}>保存设置</Button>
              </form>
              <hr />
              <h3>免费方案约束</h3>
              <p className="muted">
                不启用付费分支、额外算力、图片转换或付费备份。上传图片自动压缩，单次最多
                10 MB。免费空间和流量配额以 Supabase 控制台为准。
              </p>
              <a
                className="text-link"
                href="https://supabase.com/dashboard/project/reuuczinkfadrctkmjmb"
                target="_blank"
                rel="noreferrer"
              >
                打开 Supabase 控制台 <ArrowUpRight size={14} />
              </a>
            </section>
          )}
          {invite && (
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="添加成员"
              >
                <div className="panel-title">
                  <h2>添加一位创作者</h2>
                  <button
                    onClick={() => {
                      setInvite(false);
                      setLink("");
                    }}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                {link ? (
                  <>
                    <Notice>
                      成员已创建，可直接登录。初始密码为
                      123456，首次登录可选择修改或跳过。
                    </Notice>
                    <div className="member-credentials">
                      <p>登录邮箱：{link}</p>
                      <p>
                        初始密码：<strong>123456</strong>
                      </p>
                    </div>
                    <Button
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `登录地址：${location.origin}/login/\n邮箱：${link}\n初始密码：123456`,
                        );
                        setMessage("登录信息已复制");
                      }}
                    >
                      复制登录信息
                    </Button>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const expiry = field(f, "expires");
                      perform(
                        "admin/create-member",
                        {
                          name: field(f, "name"),
                          email: field(f, "email"),
                          credits: Number(f.get("credits")),
                          flagship: f.get("flagship") === "on",
                          expires_at: expiry
                            ? new Date(expiry + "T23:59:59+08:00").toISOString()
                            : null,
                        },
                        (r) => setLink(String(r.email)),
                      );
                    }}
                  >
                    <Notice>
                      初始密码为 123456，默认赠送 2
                      点额度。首次登录会提示修改密码，也可跳过。
                    </Notice>
                    <Field label="昵称">
                      <input
                        name="name"
                        maxLength={60}
                        placeholder="选填，默认使用邮箱前缀"
                      />
                    </Field>
                    <Field label="邮箱">
                      <input name="email" type="email" required />
                    </Field>
                    <div className="field-row">
                      <Field label="初始额度">
                        <input
                          type="number"
                          name="credits"
                          min={0}
                          max={100000}
                          defaultValue={2}
                          required
                        />
                      </Field>
                      <Field label="到期日期" hint="留空长期有效">
                        <input type="date" name="expires" />
                      </Field>
                    </div>
                    <label className="checkbox-field">
                      <input name="flagship" type="checkbox" />
                      允许使用旗舰模式
                    </label>
                    <Button busy={busy}>
                      创建成员账号 <ArrowUpRight size={15} />
                    </Button>
                  </form>
                )}
                {error && <Notice error>{error}</Notice>}
              </section>
            </div>
          )}
          {member && (
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="管理成员"
              >
                <div className="panel-title">
                  <h2>管理 {member.name}</h2>
                  <button
                    onClick={() => {
                      setMember(null);
                      setLink("");
                    }}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <p className="muted">
                  {member.email} · 剩余 {member.credits} 点
                </p>
                {member.deletion_pending && (
                  <Notice error>
                    删除尚未完成，账号已停用。请点击“继续删除成员”重试。
                  </Notice>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const expiry = field(f, "expires");
                    perform(
                      "admin/member",
                      {
                        id: member.id,
                        active: f.get("active") === "on",
                        flagship: f.get("flagship") === "on",
                        expires_at: expiry
                          ? new Date(expiry + "T23:59:59+08:00").toISOString()
                          : null,
                        delta: Number(f.get("delta")),
                      },
                      () => setMember(null),
                    );
                  }}
                >
                  <Field label="调整额度" hint="正数追加，负数扣减">
                    <input
                      name="delta"
                      type="number"
                      defaultValue={0}
                      min={-member.credits}
                      max={100000}
                    />
                  </Field>
                  <Field label="到期日期">
                    <input
                      name="expires"
                      type="date"
                      defaultValue={member.expires_at?.slice(0, 10) || ""}
                    />
                  </Field>
                  <label className="checkbox-field">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={member.active}
                    />
                    账号启用
                  </label>
                  <label className="checkbox-field">
                    <input
                      name="flagship"
                      type="checkbox"
                      defaultChecked={member.flagship}
                    />
                    允许旗舰模式
                  </label>
                  <div className="modal-actions">
                    <Button busy={busy} disabled={member.deletion_pending}>
                      保存变更
                    </Button>
                  </div>
                </form>
                {member.role === "member" && (
                  <section className="member-admin-actions">
                    <p>
                      密码加密保存，修改后不可查看。需要协助登录时，可重置为初始密码。
                    </p>
                    <Button
                      variant="secondary"
                      busy={busy}
                      disabled={member.deletion_pending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `将 ${member.email} 的密码重置为 123456？重新登录后会提示修改。`,
                          )
                        )
                          return;
                        perform(
                          "admin/reset-password",
                          { id: member.id },
                          () => {
                            setMember(null);
                            setMessage(
                              "密码已重置为 123456，重新登录后将提示修改。",
                            );
                          },
                        );
                      }}
                    >
                      重置密码为 123456
                    </Button>
                    <Button
                      variant="ghost"
                      busy={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `删除成员 ${member.email}？登录权限、素材和海报将被移除，无法恢复；后台保留必要的额度账目。`,
                          )
                        )
                          return;
                        perform(
                          "admin/delete-member",
                          { id: member.id },
                          () => {
                            setMember(null);
                            setMessage(
                              "成员已删除，图片已清理，额度账目保留。",
                            );
                          },
                        );
                      }}
                    >
                      {member.deletion_pending ? "继续删除成员" : "删除成员"}
                    </Button>
                  </section>
                )}
                {error && <Notice error>{error}</Notice>}
              </section>
            </div>
          )}
          {template && (
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="编辑模板"
              >
                <div className="panel-title">
                  <h2>{template.name}</h2>
                  <button onClick={() => setTemplate(null)} aria-label="关闭">
                    ×
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    perform(
                      "admin/template",
                      {
                        id: template.id,
                        title: field(f, "title"),
                        subtitle: field(f, "subtitle"),
                        details: field(f, "details"),
                        cta: field(f, "cta"),
                        style: field(f, "style"),
                        enabled: f.get("enabled") === "on",
                      },
                      () => setTemplate(null),
                    );
                  }}
                >
                  {(
                    ["title", "subtitle", "details", "cta", "style"] as const
                  ).map((k, i) => (
                    <Field
                      key={k}
                      label={
                        [
                          "默认标题",
                          "默认副标题",
                          "补充信息",
                          "行动文案",
                          "视觉风格提示",
                        ][i]
                      }
                    >
                      {k === "style" ? (
                        <textarea
                          name={k}
                          required
                          rows={3}
                          defaultValue={template[k]}
                          maxLength={1000}
                        />
                      ) : (
                        <input
                          name={k}
                          required={k === "title"}
                          defaultValue={template[k]}
                          maxLength={
                            { title: 24, subtitle: 60, details: 100, cta: 24 }[
                              k
                            ]
                          }
                        />
                      )}
                    </Field>
                  ))}
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={template.enabled}
                    />
                    启用模板
                  </label>
                  <Button busy={busy}>保存模板</Button>
                </form>
                {error && <Notice error>{error}</Notice>}
              </section>
            </div>
          )}
          {inspect && (
            <div className="modal-backdrop">
              <section
                className="modal wide-modal"
                role="dialog"
                aria-modal="true"
                aria-label="任务详情"
              >
                <div className="panel-title">
                  <h2>任务详情</h2>
                  <button onClick={() => setInspect(null)} aria-label="关闭">
                    ×
                  </button>
                </div>
                <p className="muted">{inspect.id}</p>
                <pre className="code-block">
                  {JSON.stringify(
                    {
                      status: inspect.status,
                      model: inspect.model_label,
                      model_config_id: inspect.model_config_id,
                      created_at: inspect.created_at,
                      updated_at: inspect.updated_at,
                      credits: inspect.credits,
                      estimated_cost: inspect.estimated_cost,
                      error: inspect.error,
                    },
                    null,
                    2,
                  )}
                </pre>
                <h3>提交时的提示词</h3>
                <pre className="code-block">{inspect.prompt}</pre>
                {inspect.status === "uncertain" && (
                  <>
                    <Notice>
                      请先在供应商后台核对任务与收费。关闭后仅退回 Nova
                      用户额度，不代表供应商退款。
                    </Notice>
                    <Button
                      busy={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "已核对供应商记录，确认关闭此任务并退回用户额度？",
                          )
                        )
                          perform("admin/resolve", { id: inspect.id }, () =>
                            setInspect(null),
                          );
                      }}
                    >
                      已核对，关闭任务并退回额度
                    </Button>
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
