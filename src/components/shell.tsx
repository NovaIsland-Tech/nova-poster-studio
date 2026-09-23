"use client";
import { useRef } from "react";
import {
  LayoutGrid,
  Images,
  PanelsTopLeft,
  ArrowUpRight,
  LogOut,
  HelpCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { Profile } from "@/lib/domain";
import { Brand, api } from "./ui";
export function Shell({
  user,
  demo,
  tab,
  onTab,
  children,
}: {
  user: Profile;
  demo: boolean;
  tab: string;
  onTab: (tab: string) => void;
  children: React.ReactNode;
}) {
  const contactDialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          你的灵感工作室 <span>PRIVATE</span>
        </div>
        <button className="new-design" onClick={() => onTab("new")}>
          <Plus size={18} /> 开始新设计 <ArrowUpRight size={17} />
        </button>
        <nav aria-label="主导航">
          {[
            { id: "home", name: "创作工作台", icon: LayoutGrid },
            { id: "studio", name: "正在创作", icon: Sparkles },
            { id: "works", name: "我的作品", icon: Images },
            { id: "templates", name: "灵感模板", icon: PanelsTopLeft },
          ].map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => onTab(item.id)}
            >
              <item.icon size={18} />
              {item.name}
              {tab === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card">
            <div>
              <Sparkles size={16} />
              <span>创作额度</span>
              <small>内部专享</small>
            </div>
            <div className="credit-balance-row">
              <strong>
                {user.credits}
                <span> 点可用</span>
              </strong>
              <button
                className="add-credit-button"
                onClick={() => contactDialog.current?.showModal()}
                aria-haspopup="dialog"
              >
                <Plus size={12} /> 添加积分
              </button>
            </div>
            <p>让每一个好想法，都有好设计。</p>
            <div className="credit-line">
              <i />
            </div>
          </div>
          <button className="help-link" onClick={() => onTab("help")}>
            <HelpCircle size={17} />
            使用指南
            <ArrowUpRight size={15} />
          </button>
          <div className="user-card">
            <div className="avatar">{user.name.slice(0, 1) || "N"}</div>
            <div>
              <strong>{user.name}</strong>
              <small>{demo ? "本地演示空间" : "邀请制创作者"}</small>
            </div>
            <button
              title="退出登录"
              aria-label="退出登录"
              onClick={async () => {
                await api("auth/logout", {});
                window.location.href = "/login";
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            工作空间 <span>/</span>{" "}
            <strong>
              {tab === "works"
                ? "我的作品"
                : tab === "templates"
                  ? "灵感模板"
                  : tab === "help"
                    ? "使用指南"
                    : "创作工作台"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="status-dot" />
            {demo ? "本地演示模式" : "PRIVATE STUDIO"}
            <a
              className="top-account-link"
              href="/account/"
              aria-label="修改登录密码"
            >
              账号设置
            </a>
            <span className="top-avatar">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        {children}
      </div>
      <dialog
        ref={contactDialog}
        className="credit-contact-dialog"
        aria-labelledby="credit-contact-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              event.currentTarget.close();
          }
        }}
      >
        <button
          className="credit-contact-close"
          aria-label="关闭"
          onClick={() => contactDialog.current?.close()}
        >
          <X size={18} />
        </button>
        <div className="credit-contact-avatar">姜</div>
        <span className="credit-contact-label">继续你的创作</span>
        <h2 id="credit-contact-title">联系管理员－生姜</h2>
        <p>
          需要更多创作积分？请发邮件联系生姜，并在邮件中注明你的 Nova 登录邮箱。
        </p>
        <a
          className="credit-contact-email"
          href="mailto:aslanyushengjiang@gmail.com"
        >
          aslanyushengjiang@gmail.com
        </a>
        <button
          className="button primary"
          onClick={() => contactDialog.current?.close()}
        >
          知道了
        </button>
      </dialog>
    </div>
  );
}
