import Link from "next/link";
import { Github, Mail } from "lucide-react";

const FOOTER_LINKS = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
  { href: "/projects", label: "项目" },
  { href: "/notes", label: "笔记" },
  { href: "/tools", label: "工具箱" },
  { href: "/guestbook", label: "留言墙" },
  { href: "/contact", label: "联系" },
];

export function Footer() {
  return (
    <footer className="mt-auto">
      {/* Top divider */}
      <div className="border-t border-white/[0.06]" />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-foreground transition-colors hover:text-blue-200"
            >
              HOU Universe
            </Link>
            <p className="text-sm leading-relaxed text-slate-500">
              个人开发者全功能平台 — 探索数据科学、AI
              工程化与全栈开发的无限可能。
            </p>
            <div className="mt-1 flex items-center gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 transition-colors hover:text-foreground"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="mailto:contact@example.com"
                className="text-slate-500 transition-colors hover:text-foreground"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">快速导航</h4>
            <ul className="flex flex-col gap-2">
              {FOOTER_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">联系方式</h4>
            <p className="text-sm leading-relaxed text-slate-500">
              有任何问题或合作意向，欢迎随时联系。
            </p>
            <a
              href="mailto:contact@example.com"
              className="text-sm text-blue-400 transition-colors hover:text-blue-300"
            >
              contact@example.com
            </a>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} HOU Universe. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
