"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="account-page">
      <section className="panel">
        <h1>暂时无法打开工作空间。</h1>
        <p>连接可能暂时中断，请稍后重试。</p>
        <button className="button primary" onClick={reset}>
          重新连接
        </button>
      </section>
    </main>
  );
}
