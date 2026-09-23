"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Upload,
  ImagePlus,
  Check,
  Copy,
  Sparkles,
  Zap,
  Diamond,
  Download,
  RefreshCw,
  ShieldCheck,
  Image as ImageIcon,
  ChevronRight,
  X,
  Clock,
  Plus,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import {
  buildPrompt,
  copyPresets,
  sizes,
  type Draft,
  type Job,
  type Profile,
  type Template,
} from "@/lib/domain";
import { uploadFile, downloadOutput, hasLocalResult } from "@/lib/browser/api";
import { PrivateImage } from "./private-image";
import { HeroCarousel } from "./hero-carousel";
import { Shell } from "./shell";
import { api, Button, Field, Notice, Empty } from "./ui";
export type Bootstrap = {
  user: Profile;
  templates: Template[];
  jobs: Job[];
  demo: boolean;
  paused: boolean;
  modes: { mode: Draft["mode"]; credit_cost: number }[];
};
const blank: Draft = {
  assetId: "",
  templateId: "personal-ip",
  title: "让热爱，自有回响",
  subtitle: "分享经验，也分享真实的自己",
  details: "持续探索 · 保持好奇 · 自由生长",
  cta: "认识我",
  brand: "",
  ratio: "3:4",
  mode: "value",
};
const steps = [
  { name: "上传素材", desc: "从一张好图开始" },
  { name: "选择模板", desc: "找到适合的风格" },
  { name: "填写文案", desc: "说出你的好想法" },
  { name: "确认方案", desc: "让灵感准备就绪" },
  { name: "生成海报", desc: "见证想法成为作品" },
];
const statusName: Record<Job["status"], string> = {
  queued: "排队中",
  running: "正在创作",
  succeeded: "已完成",
  failed: "生成失败",
  uncertain: "等待核对",
};
export function Studio({ initial }: { initial: Bootstrap }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("home");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(blank);
  const [category, setCategory] = useState("人物");
  const [galleryCategory, setGalleryCategory] = useState("全部");
  const [job, setJob] = useState<Job | null>(null);
  const [assetName, setAssetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [workSearch, setWorkSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestKey = useRef<string | null>(null);
  const template =
    data.templates.find((t) => t.id === draft.templateId) || data.templates[0];
  const storageKey = `nova-draft-${data.user.id}`;
  const submitStorageKey = `nova-submit-${data.user.id}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved);
        setDraft({ ...blank, ...value.draft });
        setCategory(
          initial.templates.find((t) => t.id === value.draft?.templateId)
            ?.category || "人物",
        );
        setStep(Math.min(value.step || 0, 4));
        setAssetName(value.assetName || "");
        if (value.job && initial.jobs.some((j) => j.id === value.job.id))
          setJob(value.job);
        else if (value.step === 4) setStep(0);
      }
    } catch {}
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (
      loaded &&
      !job &&
      !assetName &&
      step === 0 &&
      JSON.stringify(draft) === JSON.stringify(blank)
    ) {
      sessionStorage.removeItem(storageKey);
    } else if (loaded)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ draft, step, assetName, job }),
      );
  }, [draft, step, assetName, job, loaded, storageKey]);
  const refresh = useCallback(async () => {
    const next = await api<Bootstrap>("bootstrap");
    setData(next);
  }, []);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Job>(`jobs/${job.id}`);
        if (disposed) return;
        setJob(next);
        if (["succeeded", "failed", "uncertain"].includes(next.status)) {
          await refresh();
          return;
        }
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
      if (!disposed) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, refresh]);
  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    requestKey.current = null;
    sessionStorage.removeItem(submitStorageKey);
    setMessage("");
    setError("");
  }
  function navigate(next: string) {
    setError("");
    setMessage("");
    if (next === "new") {
      setDraft(blank);
      setCategory("人物");
      setJob(null);
      setStep(0);
      setAssetName("");
      requestKey.current = null;
      sessionStorage.removeItem(submitStorageKey);
      setTab("studio");
    } else {
      setTab(next);
      if (next === "templates") setGalleryCategory("全部");
      if (next === "works") refresh().catch(() => {});
    }
  }
  function cancelDraft() {
    if (
      !window.confirm(
        "取消当前草稿？素材选择和文案修改将清空，已生成的作品不受影响。",
      )
    )
      return;
    navigate("new");
    sessionStorage.removeItem(storageKey);
    if (fileRef.current) fileRef.current.value = "";
    setTab("home");
  }
  async function removeWork(item: Job) {
    if (
      !window.confirm(
        `删除「${item.draft.title}」？图片将无法恢复，已消耗额度不退回。`,
      )
    )
      return;
    setDeleting(item.id);
    setError("");
    try {
      await api("jobs/delete", { id: item.id });
      setData((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== item.id) }));
      if (job?.id === item.id) {
        setJob(null);
        setStep(0);
        setTab("works");
      }
      setMessage("作品已删除");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }
  function openWork(item: Job) {
    setJob(item);
    setDraft(item.draft);
    setStep(4);
    setTab("studio");
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("请选择 10 MB 以内的 JPG、PNG 或 WebP 图片");
      const result = await uploadFile(file);
      update({ assetId: result.id });
      setAssetName(result.name);
      setMessage("素材已上传，可以继续选择模板");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sample() {
    setBusy(true);
    try {
      const blob = await (await fetch("/sample-product.png")).blob();
      await upload(
        new File([blob], "自然护肤产品示例.png", { type: "image/png" }),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function choose(t: Template) {
    update({
      templateId: t.id,
      title: t.title,
      subtitle: t.subtitle,
      details: t.details,
      cta: t.cta,
    });
    setCategory(t.category);
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const fingerprint = JSON.stringify(
        Object.keys(blank).map((k) => draft[k as keyof Draft]),
      );
      const stored = sessionStorage.getItem(submitStorageKey);
      if (!requestKey.current && stored) {
        const previous = JSON.parse(stored);
        if (previous.fingerprint === fingerprint)
          requestKey.current = previous.key;
      }
      requestKey.current ??= crypto.randomUUID();
      sessionStorage.setItem(
        submitStorageKey,
        JSON.stringify({ key: requestKey.current, fingerprint }),
      );
      const result = await api<Job>("jobs", { draft, key: requestKey.current });
      setJob(result);
      setStep(4);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const cost = data.modes.find((m) => m.mode === draft.mode)?.credit_cost;
  const stale =
    job &&
    Object.keys(blank).some(
      (k) => job.draft[k as keyof Draft] !== draft[k as keyof Draft],
    );
  const tplCards = (filter: string, select = true) => (
    <div className="template-grid">
      {data.templates
        .filter((t) => filter === "全部" || t.category === filter)
        .map((t) => (
          <button
            key={t.id}
            className={`template-card ${select && draft.templateId === t.id ? "selected" : ""}`}
            onClick={() => {
              choose(t);
              if (!select) {
                setTab("studio");
                setStep(draft.assetId ? 2 : 0);
              }
            }}
          >
            <div className="template-image">
              <img src={`/templates/${t.id}.webp`} alt={`${t.name}排版参考`} />
              {select && draft.templateId === t.id && (
                <span className="selection-check">
                  <Check size={15} />
                </span>
              )}
              <span className="template-image-tag">{t.tag}</span>
            </div>
            <div className="template-caption">
              <strong>{t.name}</strong>
              <span>
                {select && draft.templateId === t.id ? "已选择" : "使用模板"}{" "}
                <ChevronRight size={13} />
              </span>
            </div>
          </button>
        ))}
    </div>
  );
  return (
    <Shell user={data.user} demo={data.demo} tab={tab} onTab={navigate}>
      <main className="workspace">
        {data.user.credits <= 0 && (
          <Notice>
            创作额度已用完，请联系管理员－生姜，追加额度后即可继续创作。
          </Notice>
        )}
        {tab !== "studio" && error && <Notice error>{error}</Notice>}
        {tab !== "studio" && message && <Notice>{message}</Notice>}
        {tab === "home" && (
          <>
            <section className="studio-hero">
              <div className="hero-copy">
                <span className="eyebrow">NOVA — YOUR CREATIVE STUDIO</span>
                <h1>
                  让想法
                  <br />
                  有点<span>看头。</span>
                </h1>
                <p>
                  一张素材，一个好想法。
                  <br />
                  把你的下一次发布，变成值得停留的画面。
                </p>
                <div className="hero-actions">
                  <Button onClick={() => navigate("new")}>
                    开始创作 <ArrowRight size={18} />
                  </Button>
                  {draft.assetId && (
                    <Button variant="ghost" onClick={() => setTab("studio")}>
                      继续上次草稿
                    </Button>
                  )}
                </div>
                <div className="hero-meta">
                  <span>01 上传素材</span>
                  <span>02 定义风格</span>
                  <span>03 让想法成真</span>
                </div>
              </div>
              <HeroCarousel onExplore={() => navigate("templates")} />
            </section>
            <section className="dashboard-section">
              <div className="dashboard-heading">
                <div>
                  <span className="eyebrow">FIND YOUR DIRECTION</span>
                  <h2>从喜欢的风格开始</h2>
                </div>
                <button
                  className="text-link"
                  onClick={() => {
                    navigate("templates");
                  }}
                >
                  全部模板 <ArrowRight size={16} />
                </button>
              </div>
              <div className="direction-grid">
                {[
                  {
                    id: "product-new",
                    title: "让产品，自带吸引力",
                    label: "PRODUCT / 产品",
                  },
                  {
                    id: "personal-ip",
                    title: "让个性，被记住",
                    label: "PEOPLE / 人物",
                  },
                  {
                    id: "course-open",
                    title: "让知识，更有感染力",
                    label: "COURSE / 课程",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    className="direction-card"
                    onClick={() => {
                      setGalleryCategory(
                        item.id === "product-new"
                          ? "产品"
                          : item.id === "personal-ip"
                            ? "人物"
                            : "课程",
                      );
                      setTab("templates");
                    }}
                  >
                    <img src={`/artwork/${item.id}.webp`} alt={item.title} />
                    <span className="direction-label">{item.label}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <ArrowRight size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <section className="dashboard-section">
              <div className="dashboard-heading">
                <div>
                  <span className="eyebrow">MADE BY YOU</span>
                  <h2>最近的灵感</h2>
                </div>
                <button className="text-link" onClick={() => navigate("works")}>
                  我的作品 · {data.jobs.length} <ArrowRight size={16} />
                </button>
              </div>
              {data.jobs.length ? (
                <div className="recent-list">
                  {data.jobs.slice(0, 4).map((j) => (
                    <button key={j.id} onClick={() => openWork(j)}>
                      <span className="recent-thumb">
                        {j.output_path ? (
                          <PrivateImage
                            kind="output"
                            id={j.id}
                            alt={j.draft.title}
                          />
                        ) : (
                          <ImageIcon size={22} />
                        )}
                      </span>
                      <span>
                        <strong>{j.draft.title}</strong>
                        <small>
                          {statusName[j.status]} · {j.draft.ratio}
                        </small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="first-work">
                  <span>你的作品集，从这里开始。</span>
                  <Button variant="secondary" onClick={() => navigate("new")}>
                    创作第一张海报 <ArrowRight size={16} />
                  </Button>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "studio" && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span /> MAKE SOMETHING GREAT
                </div>
                <h1>
                  {steps[step].name}
                  <span> / 0{step + 1}</span>
                </h1>
                <p>{steps[step].desc}。每一步，离好作品更近一点。</p>
              </div>
              <button className="text-link" onClick={() => navigate("home")}>
                返回工作台 <ArrowRight size={15} />
              </button>
            </section>
            <div className="steps" aria-label="创作进度">
              {steps.map((s, i) => (
                <button
                  key={s.name}
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  className={`step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
                  aria-current={i === step ? "step" : undefined}
                >
                  <span className="step-number">
                    {i < step ? (
                      <Check size={16} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.desc}</small>
                  </span>
                </button>
              ))}
            </div>
            {data.demo && (
              <Notice>
                本地演示：可以体验完整流程，生成的是素材排版预览，不调用
                AI，也不产生模型费用。
              </Notice>
            )}
            {data.paused && (
              <Notice error>管理员已暂停生成服务，你仍可编辑设计。</Notice>
            )}
            {error && <Notice error>{error}</Notice>}
            {message && <Notice>{message}</Notice>}
            <section className="creation-card">
              <div className="section-heading">
                <div>
                  <span className="section-number">0{step + 1}</span>
                  <div>
                    <h2>{steps[step].name}</h2>
                    <p>
                      {
                        [
                          "上传一张人物或产品图片，剩下的交给灵感。",
                          "挑选一个起点，每一种风格都为你的故事而来。",
                          "选择预设文案，或写下属于自己的表达。",
                          "选择画布和生成模式，查看为你整理的提示词。",
                          "你的素材与想法，正在成为新的作品。",
                        ][step]
                      }
                    </p>
                  </div>
                </div>
                <span className="step-count">STEP {step + 1} / 5</span>
              </div>
              {step === 0 && (
                <div className="upload-layout">
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      aria-label="上传素材"
                      onChange={(e) => {
                        if (e.target.files?.[0]) upload(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                    <div
                      className={`upload-zone ${draft.assetId ? "has-image" : ""}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files.length !== 1) {
                          setError("每次仅支持一张素材");
                          return;
                        }
                        upload(e.dataTransfer.files[0]);
                      }}
                    >
                      {draft.assetId ? (
                        <>
                          <PrivateImage
                            kind="asset"
                            id={draft.assetId}
                            className="uploaded-image"
                            alt="已上传的创作素材"
                          />
                          <div className="uploaded-meta">
                            <span>
                              <CheckCircle2 size={16} />
                              {assetName || "已上传素材"}
                            </span>
                            <button onClick={() => fileRef.current?.click()}>
                              更换图片
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="upload-icon">
                            <ImagePlus size={31} strokeWidth={1.4} />
                            <span>+</span>
                          </div>
                          <h3>把创作的主角，放在这里</h3>
                          <p>拖拽图片到此处，或点击上传</p>
                          <Button
                            busy={busy}
                            variant="secondary"
                            onClick={() => fileRef.current?.click()}
                          >
                            <Upload size={15} />
                            选择图片
                          </Button>
                          <small>
                            支持 JPG、PNG、WebP · 最大 10 MB · 宽高至少 14 px ·
                            单张素材
                          </small>
                        </>
                      )}
                    </div>
                    <div className="upload-hints">
                      <ShieldCheck size={15} />
                      <span>素材仅用于你的创作，其他用户无法查看。</span>
                    </div>
                  </div>
                  <aside className="inspiration-panel">
                    <div className="eyebrow">A LITTLE INSPIRATION</div>
                    <h3>
                      一张图片，
                      <br />
                      也有无限可能。
                    </h3>
                    <figure className="inspiration-stack">
                      <img
                        src="/artwork/inspiration-stack.webp"
                        alt="讲师介绍、课程上新与产品卖点三张原创海报的堆叠展示"
                      />
                      <figcaption>
                        人物 · 产品 · 课程，每个想法都有自己的表达
                      </figcaption>
                    </figure>
                    <p>
                      清晰的主体、完整的轮廓，
                      <br />
                      会让最终效果更出色。
                    </p>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={sample}
                    >
                      还没有素材？试试示例图片 <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
              )}
              {step === 1 && (
                <>
                  <div className="filter-tabs">
                    {["人物", "课程", "产品"].map((c) => (
                      <button
                        key={c}
                        className={category === c ? "active" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                        <span>
                          {
                            data.templates.filter((t) => t.category === c)
                              .length
                          }
                        </span>
                      </button>
                    ))}
                    <small>示例为排版参考，最终效果随素材变化</small>
                  </div>
                  {tplCards(category)}
                </>
              )}
              {step === 2 && template && (
                <div className="copy-layout">
                  <div className="copy-fields">
                    <div className="copy-presets" aria-label="选择默认文案">
                      {copyPresets(template).map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => update(preset.copy)}
                        >
                          <Sparkles size={12} />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                    <div className="preset-banner">
                      <Sparkles size={17} />
                      <div>
                        <strong>{template.tag}预设文案</strong>
                        <p>已经为你填好，可以直接使用，也可以自由修改。</p>
                      </div>
                      <button onClick={() => choose(template)}>恢复预设</button>
                    </div>
                    <Field label="主标题" hint={`${draft.title.length}/24`}>
                      <input
                        value={draft.title}
                        maxLength={24}
                        placeholder="一句话，让人记住你"
                        onChange={(e) => update({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="副标题" hint="选填 · 60 字以内">
                      <textarea
                        rows={2}
                        value={draft.subtitle}
                        maxLength={60}
                        onChange={(e) => update({ subtitle: e.target.value })}
                      />
                    </Field>
                    <Field label="补充信息 / 核心卖点" hint="选填 · 100 字以内">
                      <textarea
                        rows={3}
                        value={draft.details}
                        maxLength={100}
                        onChange={(e) => update({ details: e.target.value })}
                      />
                    </Field>
                    <div className="field-row">
                      <Field label="行动文案" hint="选填">
                        <input
                          maxLength={24}
                          value={draft.cta}
                          onChange={(e) => update({ cta: e.target.value })}
                        />
                      </Field>
                      <Field label="你的品牌" hint="选填">
                        <input
                          maxLength={24}
                          placeholder="品牌名，不默认添加 Nova"
                          value={draft.brand}
                          onChange={(e) => update({ brand: e.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="copy-preview">
                    <div className="live-poster">
                      <img
                        src={`/artwork/${template.id}.webp`}
                        alt="文案排版预览背景"
                      />
                      <div className="live-poster-copy">
                        <small>{draft.brand || "YOUR BRAND"}</small>
                        <h3>{draft.title}</h3>
                        <p>{draft.subtitle}</p>
                      </div>
                      <div className="live-poster-bottom">
                        <p>{draft.details}</p>
                        <strong>{draft.cta}</strong>
                      </div>
                    </div>
                    <span>
                      <ImageIcon size={13} /> 文案位置预览 · 生成后使用你的素材
                    </span>
                  </div>
                </div>
              )}
              {step === 3 && template && (
                <div className="confirm-layout">
                  <div>
                    <h3 className="field-title">选择海报比例</h3>
                    <div className="ratio-options">
                      {(["1:1", "3:4", "9:16"] as const).map((r, i) => (
                        <button
                          key={r}
                          className={draft.ratio === r ? "active" : ""}
                          onClick={() => update({ ratio: r })}
                        >
                          <span className={`ratio-shape shape-${i}`} />
                          <strong>{r}</strong>
                          <small>
                            {
                              [
                                "方形 · 社交分享",
                                "竖版 · 内容封面",
                                "长图 · 手机全屏",
                              ][i]
                            }
                          </small>
                        </button>
                      ))}
                    </div>
                    {cost !== undefined &&
                      data.user.credits > 0 &&
                      cost > data.user.credits && (
                        <Notice>
                          当前额度不足以使用此模式，请联系管理员－生姜。
                        </Notice>
                      )}
                    <h3 className="field-title mode-title">选择生成模式</h3>
                    <div className="mode-options">
                      {(
                        [
                          {
                            id: "value",
                            name: "性价比模式",
                            desc: "日常创作，轻松尝试",
                            icon: Zap,
                          },
                          {
                            id: "flagship",
                            name: "旗舰模式",
                            desc: "重要作品，精细表达",
                            icon: Diamond,
                          },
                        ] as const
                      ).map((m) => {
                        const mode = data.modes.find((v) => v.mode === m.id);
                        const disabled =
                          !mode || (m.id === "flagship" && !data.user.flagship);
                        return (
                          <button
                            key={m.id}
                            disabled={disabled}
                            className={draft.mode === m.id ? "active" : ""}
                            onClick={() => update({ mode: m.id })}
                          >
                            <m.icon size={22} />
                            <span>
                              <strong>{m.name}</strong>
                              <small>{disabled ? "暂未开放" : m.desc}</small>
                            </span>
                            <b>{mode ? `${mode.credit_cost} 点` : "待配置"}</b>
                            <span className="radio-dot" />
                          </button>
                        );
                      })}
                    </div>
                    <div className="export-info">
                      <CheckCircle2 size={15} /> PNG 高清导出 ·{" "}
                      {sizes[draft.ratio].join(" × ")} px
                      <br />
                      <span>文案由程序准确排版，生成效果以实际模型为准。</span>
                    </div>
                  </div>
                  <div className="prompt-panel">
                    <div>
                      <span>
                        <Sparkles size={16} />
                        你的专属提示词
                      </span>
                      <button
                        aria-label="复制提示词"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              buildPrompt(draft, template),
                            );
                            setMessage("提示词已复制");
                          } catch {
                            setError("复制失败，请手动选择文本复制");
                          }
                        }}
                      >
                        <Copy size={15} />
                        复制
                      </button>
                    </div>
                    <pre>{buildPrompt(draft, template)}</pre>
                    <p>
                      <ShieldCheck size={13} />{" "}
                      根据当前选择自动生成，返回修改后同步更新
                    </p>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="result-layout">
                  {!job ? (
                    <Empty title="方案已就绪">返回上一步，点击生成海报。</Empty>
                  ) : (
                    <>
                      {["queued", "running"].includes(job.status) ? (
                        <div className="generating">
                          <div className="generation-orb">
                            <Sparkles size={38} />
                          </div>
                          <span className="eyebrow">
                            CREATING YOUR NEXT FAVORITE
                          </span>
                          <h3>
                            {job.status === "queued"
                              ? "好设计，正在准备中"
                              : "正在把灵感变成作品"}
                          </h3>
                          <p>
                            请保持页面打开，不要刷新；手机请保持前台。可以切换到「我的作品」查看进度。
                          </p>
                          <span className="generating-bar" />
                        </div>
                      ) : job.status === "succeeded" && !job.output_path ? (
                        <Empty title="图片已删除">
                          生成记录仍然保留，你可以返回修改方案，重新生成。
                        </Empty>
                      ) : job.status === "succeeded" ? (
                        <div className="result-image">
                          <PrivateImage
                            kind="output"
                            id={job.id}
                            alt="生成的海报"
                          />
                        </div>
                      ) : (
                        <div className="generation-error">
                          <Clock size={32} />
                          <h3>{statusName[job.status]}</h3>
                          <p>{job.error}</p>
                          <small>
                            {job.status === "failed"
                              ? "本次额度已退回。"
                              : "额度暂时预留，请管理员核对后处理。"}
                          </small>
                        </div>
                      )}
                      <div className="result-info">
                        <span className="success-label">
                          {job.status === "succeeded" ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <Clock size={15} />
                          )}{" "}
                          {statusName[job.status]}
                        </span>
                        <h3>{job.draft.title}</h3>
                        <p>
                          {
                            data.templates.find(
                              (t) => t.id === job.draft.templateId,
                            )?.name
                          }
                        </p>
                        <dl>
                          <div>
                            <dt>画布比例</dt>
                            <dd>{job.draft.ratio}</dd>
                          </div>
                          <div>
                            <dt>生成模式</dt>
                            <dd>
                              {job.draft.mode === "value" ? "性价比" : "旗舰"}
                              模式
                            </dd>
                          </div>
                          <div>
                            <dt>使用额度</dt>
                            <dd>{job.credits} 点</dd>
                          </div>
                          <div>
                            <dt>任务编号</dt>
                            <dd>{job.id.slice(0, 8)}</dd>
                          </div>
                        </dl>
                        {job.demo && (
                          <Notice>这是本地排版演示，尚未调用 AI 模型。</Notice>
                        )}
                        {stale && (
                          <Notice>
                            输入已修改，这张海报基于之前的设置生成。
                          </Notice>
                        )}
                        {job.status === "succeeded" && job.output_path && (
                          <Button
                            onClick={() =>
                              downloadOutput(job.id).catch((e) =>
                                setError(e.message),
                              )
                            }
                          >
                            <Download size={16} />
                            下载海报
                          </Button>
                        )}
                        {job.status === "uncertain" &&
                          hasLocalResult(job.id) && (
                            <Button
                              onClick={() =>
                                downloadOutput(job.id).catch((e) =>
                                  setError(e.message),
                                )
                              }
                            >
                              下载本页已生成的图片
                            </Button>
                          )}
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setStep(3);
                            requestKey.current = null;
                            sessionStorage.removeItem(submitStorageKey);
                          }}
                        >
                          <RefreshCw size={15} />
                          调整方案
                        </Button>
                        {job.status === "succeeded" && job.output_path && (
                          <Button
                            variant="ghost"
                            busy={deleting === job.id}
                            onClick={() => removeWork(job)}
                          >
                            <Trash2 size={14} />
                            删除作品
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              <footer className="creation-footer">
                <div>
                  {step === 0 ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={cancelDraft}
                    >
                      <X size={16} /> 取消草稿
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setStep(step - 1)}>
                      <ArrowLeft size={16} />
                      上一步
                    </Button>
                  )}
                </div>
                <div>
                  <span className="footer-note">
                    {step === 3
                      ? `本次消耗 ${cost ?? "—"} 点 · 剩余 ${data.user.credits} 点`
                      : step < 4
                        ? "好设计，一步一步来"
                        : ""}
                  </span>
                  {step < 3 ? (
                    <Button
                      busy={busy}
                      disabled={
                        (step === 0 && !draft.assetId) ||
                        (step === 1 && !template) ||
                        (step === 2 && !draft.title.trim())
                      }
                      onClick={() => setStep(step + 1)}
                    >
                      下一步 <ArrowRight size={16} />
                    </Button>
                  ) : step === 3 ? (
                    <Button
                      busy={busy}
                      disabled={
                        !cost ||
                        data.paused ||
                        cost > data.user.credits ||
                        !draft.title.trim() ||
                        !draft.assetId
                      }
                      onClick={generate}
                    >
                      <Sparkles size={16} />
                      {data.demo ? "生成排版演示" : "生成海报"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => navigate("works")}
                    >
                      查看我的作品 <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              </footer>
            </section>
            <div className="below-note">
              <span>NOVA STUDIO</span>为每一个值得被看见的想法而设计。
              <span>YOUR IDEAS, BEAUTIFULLY MADE.</span>
            </div>
          </>
        )}
        {tab === "works" && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">YOUR CREATIVE COLLECTION</div>
                <h1>每一次灵感，都在这里。</h1>
                <p>继续打磨你的设计，或开始下一个好想法。</p>
              </div>
              <Button onClick={() => navigate("new")}>
                <Plus size={16} />
                新建设计
              </Button>
            </section>
            <div className="gallery-tools">
              <span>{data.jobs.length} 个作品</span>
              <input
                aria-label="搜索作品"
                placeholder="搜索作品标题…"
                value={workSearch}
                onChange={(e) => setWorkSearch(e.target.value)}
              />
            </div>
            {data.jobs.length === 0 ? (
              <Empty title="第一张作品，正在等你">
                从工作台上传素材，开始你的第一次创作。
              </Empty>
            ) : (
              <div className="works-grid">
                {data.jobs
                  .filter((j) => j.draft.title.includes(workSearch))
                  .map((j) => (
                    <article key={j.id} className="work-card">
                      <button
                        className="work-open"
                        aria-label={`打开作品：${j.draft.title}`}
                        onClick={() => openWork(j)}
                      >
                        <div>
                          {j.status === "succeeded" && j.output_path ? (
                            <PrivateImage
                              kind="output"
                              id={j.id}
                              alt={j.draft.title}
                            />
                          ) : (
                            <span className="work-placeholder">
                              <Sparkles size={28} />
                              {j.status === "succeeded"
                                ? "图片已删除"
                                : statusName[j.status]}
                            </span>
                          )}
                          <span className={`job-badge ${j.status}`}>
                            {j.demo ? "演示 · " : ""}
                            {statusName[j.status]}
                          </span>
                        </div>
                        <strong>{j.draft.title}</strong>
                        <p>
                          {new Date(j.created_at).toLocaleDateString("zh-CN")}
                          <span>
                            {j.draft.ratio} · {j.credits} 点
                          </span>
                        </p>
                      </button>
                      <div className="work-actions">
                        <button onClick={() => openWork(j)}>
                          查看作品 <ArrowRight size={14} />
                        </button>
                        <button
                          disabled={
                            deleting === j.id ||
                            !["succeeded", "failed"].includes(j.status)
                          }
                          title={
                            ["succeeded", "failed"].includes(j.status)
                              ? "删除作品"
                              : "任务完成或核对后可删除"
                          }
                          aria-label={`删除作品：${j.draft.title}`}
                          onClick={() => removeWork(j)}
                        >
                          <Trash2 size={15} />
                          {deleting === j.id ? "删除中" : "删除"}
                        </button>
                      </div>
                    </article>
                  ))}
                {data.jobs.length > 0 &&
                  !data.jobs.some((j) =>
                    j.draft.title.includes(workSearch),
                  ) && (
                    <Empty title="没有找到匹配作品">换一个关键词试试。</Empty>
                  )}
              </div>
            )}
          </>
        )}
        {tab === "templates" && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">CURATED STARTING POINTS</div>
                <h1>给灵感，一个漂亮的起点。</h1>
                <p>人物、课程、产品，找到适合你的表达方式。</p>
              </div>
              <span className="invite-badge">
                {data.templates.length} 款精选模板
              </span>
            </section>
            <div className="filter-tabs">
              {["全部", "人物", "课程", "产品"].map((c) => (
                <button
                  key={c}
                  className={galleryCategory === c ? "active" : ""}
                  onClick={() => setGalleryCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {tplCards(galleryCategory, false)}
          </>
        )}
        {tab === "help" && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">A LITTLE GUIDANCE</div>
                <h1>从想法，到好设计。</h1>
                <p>几个简单步骤，开始你的创作。</p>
              </div>
            </section>
            <div className="help-grid">
              {steps.map((s, i) => (
                <article className="help-card" key={s.name}>
                  <span>0{i + 1}</span>
                  <h3>{s.name}</h3>
                  <p>
                    {
                      [
                        "上传一张你有权使用的人物或产品图片。主体清晰、轮廓完整的图片效果更好。",
                        "选择人物、课程或产品分类。示例展示排版方向，最终效果因素材和模型而异。",
                        "使用模板默认文案，或修改标题、副标题、卖点和行动信息。不需要的字段可留空。",
                        "选择 1:1、3:4 或 9:16 比例，以及可用的模型模式。确认提示词与消耗额度。",
                        "生成期间请保持页面打开、不刷新。完成后下载 PNG；失败退回额度，网络或跨域错误由管理员核对。",
                      ][i]
                    }
                  </p>
                </article>
              ))}
            </div>
            <Notice>
              账号与额度由邀请你的管理员管理。需要延长使用期限、追加额度或重置密码，请联系管理员。素材与成品仅用于你的工作空间；请及时下载保存重要作品。
            </Notice>
          </>
        )}
      </main>
    </Shell>
  );
}
