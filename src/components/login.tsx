"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, LockKeyhole, Sparkles, ShieldCheck } from "lucide-react";
import { supabase, check } from "@/lib/browser/client";
import { api, Brand, Button, Field, Notice } from "./ui";
export function Login({ demo, ready }: { demo: boolean; ready: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function enter(role: "member" | "admin") {
    setBusy(true);
    try {
      await api("auth/demo", { role });
      window.location.href = role === "admin" ? "/admin" : "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-showcase">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">YOUR IDEAS, BEAUTIFULLY MADE.</span>
          <h1>
            让好想法，
            <br />
            被更多人看见<span>。</span>
          </h1>
          <p>
            从一张素材，到一张让人心动的海报。
            <br />
            Nova，让创作自然发生。
          </p>
        </div>
        <div className="login-posters">
          <img src="/templates/personal-ip.webp" alt="人物海报模板" />
          <img src="/templates/product-new.webp" alt="产品海报模板" />
          <img src="/templates/course-open.webp" alt="课程海报模板" />
        </div>
        <div className="login-foot">
          NOVA STUDIO <span>A SPACE FOR YOUR NEXT GREAT IDEA</span>
        </div>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="login-icon">
            <Sparkles size={27} />
          </span>
          <span className="eyebrow">WELCOME TO YOUR STUDIO</span>
          <h2>欢迎回来。</h2>
          <p>登录你的专属创作空间，继续下一个好想法。</p>
          {error && <Notice error>{error}</Notice>}
          {!ready && !demo && (
            <Notice error>
              服务尚未连接，请管理员完成 Supabase 环境配置。
            </Notice>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await api("auth/login", {
                  email: String(f.get("email")),
                  password: String(f.get("password")),
                });
                window.location.href =
                  new URLSearchParams(window.location.search).get("next") ===
                  "/admin"
                    ? "/admin"
                    : "/";
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <Field label="邮箱">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Field label="密码">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="输入你的密码"
              />
            </Field>
            <Button type="submit" busy={busy} disabled={!ready}>
              进入工作台 <ArrowRight size={16} />
            </Button>
          </form>
          <p className="login-invite">
            <LockKeyhole size={14} />
            仅限受邀用户。开通账号或重置密码，请联系管理员。
          </p>
          {demo && (
            <div className="demo-login">
              <span>本地演示 · 不调用 AI</span>
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => enter("member")}
              >
                体验创作流程
              </Button>
              <button className="text-link" onClick={() => enter("admin")}>
                体验管理后台 <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="login-security">
            <ShieldCheck size={14} />
            素材私密保存 · 独立创作额度
          </div>
        </div>
      </section>
    </main>
  );
}
export function Account() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<{
    email: string;
    token: string;
  } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get("invite") && params.get("email")) {
      setInvitation({
        email: params.get("email")!,
        token: params.get("invite")!,
      });
      setReady(true);
    } else
      supabase()
        .auth.getSession()
        .then(({ data }) => {
          if (!data.session) location.replace("/login/");
          else setReady(true);
        });
  }, []);
  return (
    <main className="account-page">
      <Brand />
      <section className="panel">
        <span className="eyebrow">YOUR STUDIO IS READY</span>
        <h1>设置你的密码。</h1>
        <p>
          {invitation ? `为 ${invitation.email} 开通创作空间。` : ""}至少 6 个字符，无字符组合要求。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setError("两次输入的密码不一致");
              return;
            }
            setBusy(true);
            try {
              if (invitation) {
                await supabase().auth.signOut();
                const result = await supabase().auth.signUp({
                  email: invitation.email,
                  password: String(f.get("password")),
                  options: { data: { invite_token: invitation.token } },
                });
                if (result.error)
                  throw new Error(
                    "开户失败：邀请可能已使用、过期或邮箱已有账号。" +
                      result.error.message,
                  );
                if (!result.data.session)
                  throw new Error(
                    "账号等待邮件确认，请联系管理员检查邀请注册设置",
                  );
                history.replaceState(null, "", "/account/");
              } else
                await api("auth/password", { password: f.get("password") });
              window.location.href = "/";
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Field label="新密码">
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </Field>
          <Field label="确认密码">
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </Field>
          {error && <Notice error>{error}</Notice>}
          <Button busy={busy} disabled={!ready}>
            保存并开始创作 <ArrowRight size={16} />
          </Button>
        </form>
      </section>
    </main>
  );
}

export function ConfirmAccount() {
  const [error, setError] = useState("");
  const attempt = useRef<Promise<void> | null>(null);
  useEffect(() => {
    attempt.current ??= (async () => {
      const query = new URLSearchParams(location.search),
        token = query.get("token_hash"),
        type = query.get("type");
      if (token && (type === "invite" || type === "recovery")) {
        check(
          (await supabase().auth.verifyOtp({ token_hash: token, type })).error,
        );
        history.replaceState(null, "", "/auth/confirm/");
      } else if (!(await supabase().auth.getSession()).data.session)
        throw new Error("激活链接无效或已过期，请联系管理员");
      location.replace("/account/");
    })();
    attempt.current.catch((e) => setError(e.message));
  }, []);
  return (
    <main className="account-page">
      <Brand />
      <section className="panel">
        <h2>正在激活账号</h2>
        {error && (
          <>
            <Notice error>{error}</Notice>
            <a href="/login/">返回登录</a>
          </>
        )}
      </section>
    </main>
  );
}
