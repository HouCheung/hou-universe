"use client";

import { useEffect } from "react";
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

declare global {
  interface Window {
    busuanziCallback?: (data: { site_uv: number; site_pv: number }) => void;
  }
}

export function Footer() {
  useEffect(() => {
    // Busuanzi visitor counter
    const script = document.createElement("script");
    script.async = true;
    script.src = "//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js";
    document.body.appendChild(script);

    return () => {
      // Don't remove script on unmount to keep counter working
    };
  }, []);

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
              className="text-lg font-bold tracking-tight text-foreground transition-colors hover:text-slate-300"
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
                href="mailto:zhang13714579875@163.com"
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
              href="mailto:zhang13714579875@163.com"
              className="text-sm text-slate-400 transition-colors hover:text-slate-300"
            >
              zhang13714579875@163.com
            </a>
          </div>
        </div>
      </div>

      {/* Copyright bar with visitor counter */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} HOU Universe. All rights reserved.
            {" "}
            <span className="text-slate-600/70">
              ｜ 访客：
              <span id="busuanzi_value_site_uv" className="text-slate-500">
                --
              </span>
              {" "}｜ 访问：
              <span id="busuanzi_value_site_pv" className="text-slate-500">
                --
              </span>
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
