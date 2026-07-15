"use client";

import Script from "next/script";

/**
 * Umami 访客统计埋点组件
 *
 * 使用方式：
 * 1. 前往 https://umami.is 注册并创建网站
 * 2. 在 .env.local 中设置 NEXT_PUBLIC_UMAMI_WEBSITE_ID 为你的 Website ID
 * 3. 如需自托管，同时设置 NEXT_PUBLIC_UMAMI_SCRIPT_URL 为你的脚本地址
 * 4. 留空 NEXT_PUBLIC_UMAMI_WEBSITE_ID 则不加载任何脚本，零性能影响
 */
export function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const scriptUrl =
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
    "https://cloud.umami.is/script.js";

  if (!websiteId) {
    return null;
  }

  return (
    <Script
      src={scriptUrl}
      data-website-id={websiteId}
      strategy="afterInteractive"
      // afterInteractive: 在页面水合完成后加载，不阻塞首屏渲染
    />
  );
}
