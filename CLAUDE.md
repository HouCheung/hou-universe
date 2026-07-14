# HOU Universe 项目开发规范

## 项目基本信息
- 项目名称：HOU Universe
- 项目定位：个人开发者全功能平台
- 核心原则：模块化、可迭代、高交互、响应式
- 工作约束：所有文件变更必须限定在 HOU Universe 根目录内，不得在外部创建临时目录或文件

## 强制技术栈
- 前端框架：Next.js 14+ App Router
- 开发语言：TypeScript，严格模式，禁止使用 any 类型
- 样式方案：Tailwind CSS，禁止原生 CSS 文件，禁止内联 style 写复杂样式
- 组件库：shadcn/ui
- 动画库：Framer Motion
- 路径别名：@/* 指向 src/ 目录

## 目录结构规范
```

src/
├── app/              # 页面路由
│   ├── about/
│   ├── projects/
│   │   └── \[id\]/
│   ├── contact/
│   ├── layout.tsx    # 全局布局
│   └── page.tsx      # 首页
├── components/       # 公共组件
│   ├── ui/           # shadcn/ui 组件
│   ├── layout/       # 导航、页脚等布局组件
│   └── shared/       # 通用业务组件
├── lib/              # 工具函数
├── types/            # 类型定义
└── data/             # 静态模拟数据

```

## 代码编写规范
1. 所有组件默认使用函数组件 + TypeScript
2. 组件文件使用 PascalCase 命名，例如 `NavBar.tsx`
3. 工具函数使用 camelCase 命名
4. 禁止在生产代码中遗留 console.log
5. 优先使用服务端组件，仅需要交互/动画的组件标记 'use client'
6. 导入顺序：第三方库 → 内部组件 → 类型 → 样式

## 验收标准
- 所有页面支持移动端响应式适配（断点：sm md lg xl）
- 执行 `npm run build` 无报错、无警告
- 页面首屏无明显布局偏移
- 交互元素有明确的 hover 反馈
