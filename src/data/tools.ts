import type { Tool } from "@/types";

export const tools: Tool[] = [
  // AI Development Tools
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic 推出的 AI 编程助手，深度集成终端与 IDE，支持多 Agent 协同开发",
    url: "https://claude.ai/code",
    category: "ai",
  },
  {
    id: "trae-work",
    name: "Trae Work",
    description: "字节跳动旗下 AI 编程助手，集成代码生成与调试能力",
    url: "https://www.trae.ai",
    category: "ai",
  },
  {
    id: "github",
    name: "GitHub",
    description: "全球最大的代码托管平台，支持版本控制、CI/CD 与协作开发",
    url: "https://github.com",
    category: "ai",
  },
  {
    id: "netlify",
    name: "Netlify",
    description: "现代化 Web 部署平台，支持静态站点托管、表单处理与无服务器函数",
    url: "https://www.netlify.com",
    category: "ai",
  },
  // Big Data Learning
  {
    id: "runoob",
    name: "菜鸟教程",
    description: "免费编程入门教程网站，涵盖前端、后端、数据库等全方位技术内容",
    url: "https://www.runoob.com",
    category: "bigdata",
  },
  {
    id: "leetcode",
    name: "力扣 LeetCode",
    description: "全球知名在线编程刷题平台，涵盖算法、数据结构与数据库等题型",
    url: "https://leetcode.cn",
    category: "bigdata",
  },
  {
    id: "nowcoder",
    name: "牛客网",
    description: "IT 求职刷题与面试准备平台，提供笔试、面试题库与企业真题",
    url: "https://www.nowcoder.com",
    category: "bigdata",
  },
  {
    id: "mdn",
    name: "MDN Web Docs",
    description: "Mozilla 维护的 Web 开发权威文档，HTML/CSS/JavaScript 必备参考",
    url: "https://developer.mozilla.org/zh-CN/",
    category: "bigdata",
  },
  // Productivity Tools
  {
    id: "figma",
    name: "Figma",
    description: "基于浏览器的 UI 设计工具，支持实时协作与原型交互设计",
    url: "https://www.figma.com",
    category: "efficiency",
  },
  {
    id: "tinypng",
    name: "TinyPNG",
    description: "在线图片压缩工具，智能缩小 PNG/WebP 体积同时保持视觉质量",
    url: "https://tinypng.com",
    category: "efficiency",
  },
  {
    id: "carbon",
    name: "Carbon",
    description: "代码片段美化截图工具，支持多种主题与语言高亮，适合分享代码",
    url: "https://carbon.now.sh",
    category: "efficiency",
  },
];

export function getToolsByCategory(): Map<string, Tool[]> {
  const map = new Map<string, Tool[]>();
  for (const tool of tools) {
    const list = map.get(tool.category) || [];
    list.push(tool);
    map.set(tool.category, list);
  }
  return map;
}
