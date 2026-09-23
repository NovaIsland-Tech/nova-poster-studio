"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api, Button, Field, Notice } from "./ui";
export function PasswordWelcome({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function skip() {
    setBusy(true);
    setError("");
    try {
      await api("auth/password-skip", {});
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal password-welcome"
        role="dialog"
        aria-modal="true"
        aria-label="设置你的登录密码"
      >
        <span className="login-icon">
          <KeyRound size={25} />
        </span>
        <h2>欢迎来到 Nova</h2>
        <p>
          你的账号使用初始密码。可以现在设置自己的密码，也可以跳过，稍后在账号设置中修改。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const password = String(form.get("password"));
            setError("");
            if (password.length < 6) {
              setError("密码至少 6 位");
              return;
            }
            if (password !== form.get("confirm")) {
              setError("两次密码不一致");
              return;
            }
            setBusy(true);
            try {
              await api("auth/password", { password });
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="新密码" hint="至少 6 位，无字符组合要求">
            <input
              name="password"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
              autoFocus
            />
          </Field>
          <Field label="确认新密码">
            <input
              name="confirm"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </Field>
          {error && <Notice error>{error}</Notice>}
          <div className="modal-actions">
            <Button busy={busy}>保存密码，开始创作</Button>
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={skip}
            >
              暂时跳过
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
