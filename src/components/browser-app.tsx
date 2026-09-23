"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { browserApi } from "@/lib/browser/api";
import { Studio } from "./studio";
import { PasswordWelcome } from "./password-welcome";
import { Admin } from "./admin";
import { Brand, Button, Notice } from "./ui";
export function BrowserApp({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    browserApi(admin ? "admin" : "bootstrap")
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [admin, attempt]);
  if (!data)
    return (
      <main className="account-page">
        <Brand />
        <section className="panel">
          <h2>{error ? "暂时无法进入" : "正在打开你的创作空间…"}</h2>
          {error && (
            <>
              <Notice error>{error}</Notice>
              <Button
                onClick={() => {
                  setError("");
                  setAttempt((n) => n + 1);
                }}
              >
                重试
              </Button>
              <a className="button secondary" href="/login/">
                返回登录
              </a>
            </>
          )}
        </section>
      </main>
    );
  if (!admin && data.user?.password_prompt)
    return (
      <PasswordWelcome
        onDone={() => {
          setData(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  return admin ? (
    <Admin initial={data as ComponentProps<typeof Admin>["initial"]} />
  ) : (
    <Studio initial={data as ComponentProps<typeof Studio>["initial"]} />
  );
}
