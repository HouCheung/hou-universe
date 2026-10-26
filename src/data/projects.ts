import type { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "hou-universe",
    title: "HOU Universe",
    category: "fullstack",
    description:
      "个人开发者全功能平台，集作品展示、项目管理与互动体验于一体——基于现代 Web 技术从零构建。",
    fullDescription:
      "HOU Universe 是我的个人技术作品集网站，以宇宙主题打造个人品牌展示空间。平台基于 Next.js 15 App Router 架构，TypeScript 严格模式编写，融合 Tailwind CSS 与玻璃拟态设计语言，构建深黑 + 冷白 + 淡蓝高亮的统一视觉体系。从星空粒子背景到鼠标光晕交互，从打字机动画到滚动驱动视差效果，每一个细节追求极致。涵盖项目展示、技能可视化、留言联系、中英双语支持、访客统计等完整功能模块，支持全响应式适配。",
    detail: {
      background:
        "作为个人开发者，需要一个集中展示技术能力、项目成果与学习历程的平台。HOU Universe 由此诞生——它不仅是一个作品集网站，更是个人技术品牌的展示空间。以深空宇宙为视觉主题，从需求到实现全程采用 AI 工程化工作流开发，将传统数周的工作量压缩至数天完成，同时保持高质量的代码规范与用户体验。",
      coreFeatures: [
        "项目作品展示：精选项目卡片带封面图、技术标签与下载按钮，详情页包含完整技术方案与更新日志时间轴",
        "技能可视化：分级进度条展示四大技能类别（编程语言 / 数据库 / 核心能力 / AI 工程化），滚动触发百分比增长动画",
        "留言联系系统：Netlify Forms 集成留言墙与联系表单，支持文件附件上传与自动邮件通知",
        "中英双语支持：基于 i18next 的完整国际化方案，覆盖全站所有文本内容",
        "访客统计：实时访客计数与页面访问量统计，数据持久化存储",
        "深空宇宙主题：三层视差星空背景、3D 星球模型、鼠标光晕追踪、玻璃拟态设计语言、全响应式适配",
      ],
      techSolution:
        "前端基于 Next.js 15 App Router 架构，TypeScript 严格模式保证类型安全。样式层使用 Tailwind CSS + shadcn/ui (Base UI) 组件体系，CSS 自定义属性统一深色主题 Token。动画层统一 Framer Motion 管理页面过渡、滚动入场与交互反馈，Canvas API 实现高性能星空粒子系统，Three.js (React Three Fiber) 驱动 3D 星球元素。国际化基于 i18next + react-i18next，支持 zh-CN / en 双语。构建输出为全静态站点 (output: export)，部署于 Netlify 平台，采用 AI 工程化工作流（Claude Code + Harness 方法论）驱动开发全流程。",
      highlights: [
        "深空宇宙主题视觉：三层视差星空背景、3D 星球模型、鼠标粒子引力交互与点击星爆特效，营造沉浸式宇宙空间体验",
        "3D 交互元素：Three.js (R3F) 驱动首屏 3D 星球，Canvas 高性能粒子系统，触摸设备自动降级动效保证流畅",
        "玻璃拟态设计语言：全站统一的 glass-card 风格，backdrop-blur 毛玻璃效果搭配 brand 品牌色微光边框",
        "全响应式适配：移动端 / 平板 / 桌面端完美适配，所有交互动效基于 Framer Motion 实现 60fps 流畅运行",
      ],
    },
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion", "Base UI"],
    coverImage: "/images/projects/hou-universe-preview.png",
    techStack: [
      "Next.js 15",
      "TypeScript",
      "Tailwind CSS",
      "Framer Motion",
      "Base UI",
      "shadcn/ui",
      "Lucide Icons",
      "Netlify",
    ],
    liveUrl: "/",
    downloadUrl: "",
    demoUrl: "https://hou-universe.netlify.app",
    githubUrl: "https://github.com/HouCheung/hou-universe",
    createdAt: "2026-05-01",
    updateLog: [
      {
        version: "v0.8.0",
        date: "2026-10-26",
        changes: [
          "新增水稻产量预测课程设计与校园文具电商个人实训项目",
          "新增嘉环科技网优测试工程师实习经历",
          "整理 MiniMind 模型架构、实验发现、限制与研究路线公开展示",
          "同步中英文内容，更新站点版本至 v0.8",
        ],
      },
      {
        version: "v1.3.0",
        date: "2026-07-14",
        changes: [
          "新增 Projects 项目展示模块，含列表页与详情页",
          "实现项目卡片 hover 上浮微光效果与滚动入场动画",
          "详情页支持更新日志时间轴展示",
        ],
      },
      {
        version: "v1.2.0",
        date: "2026-06-10",
        changes: [
          "新增 About 页面，包含成长轨迹时间轴与技能地图",
          "实现滚动驱动的垂直时间线进度动画",
          "技能标签组支持分类展示与响应式网格布局",
        ],
      },
      {
        version: "v1.0.0",
        date: "2026-05-20",
        changes: [
          "平台首个版本上线，包含首页 Hero 区域与星空背景",
          "实现导航栏、页脚等全局布局组件",
          "完成 Contact 联系页面基础结构",
        ],
      },
    ],
  },
  {
    id: "rice-yield-prediction",
    title: "基于多算法对比的水稻产量预测与特征影响研究",
    category: "data",
    description:
      "面向精准农业产量预估，基于 UCI 水稻品种数据集（2790 条样本、45 维混合特征）构建 SVR、MLP、CART 三种回归模型，横向对比算法性能并识别产量核心驱动因素；最优 CART 模型 R² 达 0.9918。",
    fullDescription:
      "本项目是面向精准农业产量预估需求的独立课程设计。基于 UCI 公开水稻品种数据集（2790 条样本、45 维混合特征），完成缺失值校验、异常值处理、类别特征编码与差异化标准化，构建 SVR、MLP、CART 三种回归模型，并通过 5 折交叉验证与网格搜索进行调优。评估阶段统一使用 MSE、RMSE、MAE、R² 四项指标横向对比，结合残差分析验证模型无系统偏差；特征重要性分析识别出育苗面积、钾肥用量等 5 项核心影响因素，累计解释 99.96% 的产量变异。最终从育苗管理、精准施肥、病虫害防控、群体调控四个维度输出可落地的生产建议，形成完整研究报告。以上结果均为课程设计中的离线实验结果，不代表模型已在真实农场部署。",
    detail: {
      background:
        "面向精准农业产量预估需求，基于 UCI 公开水稻品种数据集（2790 条样本、45 维混合特征），构建多组回归预测模型，横向对比算法性能，挖掘产量核心驱动因素，为农业生产优化提供数据化支撑。",
      coreFeatures: [
        "全流程数据建模：完成缺失值校验、异常值处理、类别特征编码等数据清洗工作，针对不同算法采用差异化标准化策略；通过 5 折交叉验证与网格搜索调优，完成 SVR、MLP、CART 决策树三种回归模型构建，最优 CART 模型 R² 达 0.9918。",
        "多维度性能评估：以 MSE、RMSE、MAE、R² 四项核心指标横向对比三类算法优劣，结合残差分析验证模型无系统偏差；基于特征重要性分析识别出育苗面积、钾肥用量等 5 项核心影响因素，累计解释 99.96% 的产量变异。",
        "落地性结论输出：基于建模结论，从育苗管理、精准施肥、病虫害防控、群体调控四个维度提出可落地生产建议，形成完整研究报告，验证机器学习在农业场景的应用价值。",
      ],
      techSolution:
        "以 UCI 水稻品种数据集（2790 条样本、45 维混合特征）为输入，先完成缺失值校验、异常值处理与类别特征编码，并针对 SVR、MLP、CART 采用差异化标准化策略。模型训练采用 5 折交叉验证与网格搜索调参，统一以 MSE、RMSE、MAE、R² 评估；随后通过残差分析检查系统偏差，并基于特征重要性识别核心影响因素。结果为课程设计中的离线实验结果，不代表真实农场部署。",
      highlights: [
        "最优 CART 模型 R² = 0.9918",
        "5 项核心特征累计解释 99.96% 的产量变异",
        "SVR / MLP / CART 三模型横向对比，统一使用 MSE / RMSE / MAE / R²",
        "输出育苗管理、精准施肥、病虫害防控、群体调控四类生产建议",
      ],
    },
    tags: ["Regression", "SVR", "MLP", "CART"],
    coverImage: "/images/projects/rice-yield-prediction-cover.png",
    techStack: [
      "Data Cleaning",
      "Regression",
      "SVR",
      "MLP",
      "CART",
      "Cross-Validation",
      "Feature Importance",
    ],
    liveUrl: "",
    downloadUrl: "",
    demoUrl: "",
    githubUrl: "",
    createdAt: "2026-06-01",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-07-15",
        changes: [
          "完成缺失值校验、异常值处理、类别特征编码与差异化标准化流程",
          "构建 SVR、MLP、CART 三种回归模型，完成 5 折交叉验证与网格搜索调优",
          "完成 MSE、RMSE、MAE、R² 四项指标评估、残差分析与特征重要性分析，形成研究报告",
        ],
      },
    ],
  },
  {
    id: "campus-stationery-ecommerce",
    title: "基于 MVC 架构的校园文具电商购物系统",
    category: "fullstack",
    description:
      "面向高校校园文具消费场景，采用 Java Swing + MySQL 开发桌面端电商系统，覆盖用户选购、购物车、订单结算与管理员后台全业务闭环，实践 MVC 分层架构与设计模式。",
    fullDescription:
      "本项目是面向高校校园文具消费场景的个人实训项目。系统采用 Java Swing + MySQL 开发桌面端电商应用，覆盖用户选购、购物车、订单结算、管理员后台全业务闭环。架构上采用经典 MVC 三层设计，划分视图层、业务逻辑层与数据访问层；应用策略模式实现分层满减优惠计算，单例模式封装数据库连接工具，DAO 模式统一数据访问逻辑。订单提交通过 JDBC 事务保障原子性，库存扣减加入行锁逻辑防止超卖，查询使用 PreparedStatement 防止 SQL 注入，用户密码以 MD5 摘要形式存储。项目完成了全场景功能测试与问题调优，修复历史数据空指针异常与优惠策略匹配偏差。系统为本地桌面课程项目，未进行商业部署；MD5 为项目历史实现，未升级为现代密码哈希方案。",
    detail: {
      background:
        "面向高校校园文具消费场景，采用 Java Swing + MySQL 开发桌面端电商系统，覆盖用户选购、购物车、订单结算、管理员后台全业务闭环，实践软件工程分层设计思想与设计模式应用。",
      coreFeatures: [
        "采用经典 MVC 三层架构设计，划分视图层、业务逻辑层、数据访问层，实现模块解耦；应用策略模式实现分层满减优惠计算、单例模式封装数据库连接工具、DAO 模式统一数据访问逻辑，提升代码可扩展性与可维护性。",
        "实现多角色用户体系、商品全生命周期管理、购物车实时结算、订单事务提交四大核心模块；基于 JDBC 事务保障订单提交原子性，库存扣减加入行锁逻辑防止超卖，使用 PreparedStatement 防止 SQL 注入，采用 MD5 摘要存储用户密码。",
        "完成全场景功能测试与问题调优，解决历史数据空指针异常、优惠策略匹配偏差等问题；覆盖需求分析、架构设计、编码实现、测试优化的软件工程流程。",
      ],
      techSolution:
        "系统采用 Java Swing 构建桌面端界面，MySQL 存储用户、商品、购物车与订单数据，按 MVC 三层架构组织代码。订单提交通过 JDBC 事务保证原子性，库存扣减使用行锁避免超卖，数据访问统一走 DAO 层，SQL 使用 PreparedStatement 参数化；用户密码以 MD5 摘要形式存储（历史课程项目做法，未升级为现代密码哈希方案）。优惠计算通过策略模式实现分层满减。项目为本地桌面系统，未进行商业部署。",
      highlights: [
        "MVC 三层架构，结合策略模式、单例模式与 DAO 模式",
        "JDBC 事务 + 行锁保障订单提交与库存扣减一致性",
        "PreparedStatement 参数化查询防止 SQL 注入",
        "覆盖用户选购、购物车、订单结算、管理员后台完整业务闭环",
      ],
    },
    tags: ["Java", "Java Swing", "MySQL", "MVC"],
    coverImage: "/images/projects/campus-stationery-ecommerce-cover.png",
    techStack: [
      "Java",
      "Java Swing",
      "MySQL",
      "MVC",
      "JDBC",
      "DAO",
      "Design Patterns",
    ],
    liveUrl: "",
    downloadUrl: "",
    demoUrl: "",
    githubUrl: "",
    createdAt: "2026-06-01",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-07-15",
        changes: [
          "完成 MVC 三层架构设计与策略 / 单例 / DAO 设计模式落地",
          "实现多角色用户、商品管理、购物车结算、订单事务四大核心模块",
          "完成全场景功能测试，修复历史数据空指针异常与优惠策略匹配偏差",
        ],
      },
    ],
  },
  {
    id: "shuatiapp-pro-max",
    title: "刷题助手 PRO MAX",
    category: "fullstack",
    description:
      "一款专注编程学习的在线刷题练习平台，支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别；内置错题本、我的收藏、专项练习模块，搭配答题计时、正确率统计与数据统计功能，帮助高效巩固知识点，提升刷题效率。",
    fullDescription:
      "刷题助手 PRO MAX 是一款面向编程学习的在线刷题练习平台，核心解决批量导入题目难、错题整理效率低的痛点。支持文本粘贴与文件导入双模式批量导题，内置智能格式识别自动解析题目、选项与答案。错题本自动收录答错题目，我的收藏方便回顾重点题型，专项练习模块支持按分类针对性训练。答题计时与正确率统计功能帮助学生实时掌握学习进度，数据统计面板直观展示刷题趋势。前端采用原生 JavaScript 构建，后端基于 Node.js + Express 框架，MySQL 存储题库与用户数据，致力于为编程学习者提供高效便捷的刷题体验。",
    detail: {
      background:
        "编程学习中，刷题是巩固知识的核心手段，但传统方式存在题目来源分散、错题管理不便、学习进度难追踪等痛点。刷题助手 PRO MAX 应运而生，面向编程学习者提供从题目导入到数据分析的一站式刷题体验，解决批量导入题目难、错题整理效率低的核心问题，让学习者专注于练习本身而非工具切换。",
      coreFeatures: [
        "双模式批量导题：支持文本粘贴与文件导入（CSV/JSON），智能格式识别自动解析题干、选项与正确答案，大幅降低题目录入成本",
        "错题本自动收录：答错题目自动加入错题本，支持按分类筛选、按时间排序，方便针对性复习薄弱知识点",
        "题目收藏模块：手动收藏重点题型与高频考点，快速回顾核心题目，避免信息过载",
        "专项练习分类：按数据结构、算法、数据库等分类进行针对性训练，自由选择练习范围与题量",
        "答题计时系统：每道题自动计时，记录答题耗时，帮助培养时间管理意识与考场节奏感",
        "正确率与数据统计：正确率趋势、分类掌握度雷达图、每日刷题量柱状图，直观呈现学习进展",
      ],
      techSolution:
        "前端采用原生 JavaScript + HTML5 + CSS3 构建，不依赖重型框架，确保加载速度与兼容性。后端基于 Node.js + Express 框架提供 RESTful API 接口，前后端分离架构，表单校验保障数据有效性。MySQL 数据库存储题库、用户数据与学习记录，数据持久化保障。智能格式识别模块通过正则表达式 + 规则引擎解析多种题目格式（纯文本、CSV、JSON），自动映射为标准数据结构。答题计时基于前端时间戳记录，正确率统计通过 SQL 聚合查询实时计算。整体架构轻量模块化，方便后续功能扩展。",
      highlights: [
        "双模式导题降低录入成本：文本粘贴 + 文件导入双通道，智能格式识别准确率 > 95%，覆盖主流刷题平台导出格式",
        "错题 + 收藏 + 专项三维度巩固练习：错题自动收录、重点题型收藏、分类专项训练，三维度构建完整的练习闭环",
        "数据统计可视化掌握学习进度：正确率趋势、分类掌握度、刷题量趋势三大图表，帮助学生精准定位薄弱环节",
        "模块化扩展架构：前端静态资源缓存策略保障弱网可用，错题本、收藏、专项练习三大模块独立解耦，新增功能无需修改核心代码",
      ],
    },
    tags: ["JavaScript", "Node.js", "MySQL"],
    coverImage: "/images/projects/quiz-assistant-preview.png",
    techStack: [
      "JavaScript",
      "Node.js",
      "Express",
      "MySQL",
      "HTML5",
      "CSS3",
    ],
    liveUrl: "",
    downloadUrl: "/downloads/online-judge-platform.zip",
    demoUrl: "",
    githubUrl: "",
    createdAt: "2026-06-15",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-06-15",
        changes: [
          "首个版本上线，支持文本粘贴与文件导入双模式批量导入题目",
          "内置错题本、我的收藏、专项练习三大学习模块",
          "实现答题计时、正确率统计与数据统计面板功能",
        ],
      },
    ],
  },
  {
    id: "churn-attribution-platform",
    title: "流失归因分析平台",
    category: "data",
    description:
      "基于 XGBoost + SHAP 的智能流失归因决策系统，将黑盒模型转化为可落地的业务策略，支持风险分层、特征归因与策略 ROI 模拟。",
    fullDescription:
      "面向用户流失治理场景，基于 XGBoost + SHAP 构建的端到端智能归因决策系统，将黑盒预测模型转化为可落地的业务运营策略。借助 Claude Code 与 Superpower 能力快速搭建全栈原型，基于 XGBoost 算法构建流失预测模型，AUC 达 0.85 以上；引入 SHAP 可解释性框架实现特征重要性排序与单用户归因可视化；设计策略模拟模块支持动态调整干预参数并实时计算预估挽回 GMV 与 ROI。采用模块化架构设计，6 处代码修改即可完成合成数据到真实业务数据的无缝迁移，全链路双层异常兜底杜绝单点故障。使用 Streamlit 搭建响应式深色主题界面，集成 Plotly 交互式图表，实现零服务端依赖、本地一键运行。",
    detail: {
      background:
        "传统流失治理依赖经验判断，缺乏量化归因与策略效果预估，无法精准定位高风险人群与核心流失动因。流失归因分析平台应运而生，基于 XGBoost + SHAP 构建端到端智能归因决策系统，借助 Claude Code 与 Superpower 快速搭建全栈原型，覆盖 7043 名用户全量流失风险预测，将黑盒模型转化为可落地的业务运营策略。",
      coreFeatures: [
        "XGBoost 流失预测模型：基于 XGBoost 算法构建流失预测模型，输出个体级流失概率，AUC 达 0.85 以上，精准识别高风险人群",
        "SHAP 可解释性归因：引入 SHAP 框架实现全局特征重要性排序与单用户归因可视化，定位核心流失驱动因子",
        "策略模拟模块：支持动态调整干预参数，实时计算预估挽回 GMV 与投入回报比，量化策略效果",
        "模块化架构设计：6 处代码修改即可完成合成数据到真实业务数据的无缝迁移，全链路双层异常兜底",
        "Streamlit 交互界面：响应式深色主题界面，集成 Plotly 交互式图表，零服务端依赖、本地一键运行",
      ],
      techSolution:
        "基于 XGBoost 算法构建流失预测模型，结合 SHAP 可解释性框架实现全局特征重要性分析与单用户归因可视化。策略模拟模块支持动态参数调整与 ROI 实时计算。前端使用 Streamlit 搭建响应式深色主题界面，集成 Plotly 交互式图表。采用模块化架构设计，6 处代码修改即可完成合成数据到真实业务数据的无缝迁移，全链路双层异常兜底确保系统稳定性。纯前端计算架构，无需 GPU，普通设备即可运行，可快速嵌入企业数据中台。",
      highlights: [
        "XGBoost + SHAP 端到端归因：流失预测模型 AUC 达 0.85 以上，SHAP 实现全局特征重要性排序与单用户归因可视化",
        "策略 ROI 模拟引擎：支持动态调整干预参数，实时计算预估挽回 GMV 与投入回报比",
        "模块化架构 + 故障免疫：6 处代码修改完成数据迁移，全链路双层异常兜底杜绝单点故障",
        "零依赖纯前端部署：Streamlit + Plotly 响应式深色主题界面，本地一键运行，可快速嵌入企业数据中台",
      ],
    },
    tags: ["Python", "XGBoost", "SHAP", "Streamlit", "Plotly"],
    coverImage: "/images/projects/churn-attribution-cover.png",
    techStack: [
      "Python",
      "XGBoost",
      "SHAP",
      "Streamlit",
      "Plotly",
      "Pandas",
      "NumPy",
      "Scikit-learn",
    ],
    liveUrl: "/contact",
    downloadUrl: "",
    demoUrl: "",
    githubUrl: "",
    createdAt: "2026-07-17",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-07-17",
        changes: [
          "首个版本上线，基于 XGBoost + SHAP 构建端到端流失归因决策系统",
          "实现流失预测模型（AUC > 0.85）、SHAP 特征归因可视化与策略 ROI 模拟三大核心模块",
          "覆盖 7043 名用户全量流失风险预测，支持 Streamlit 本地一键运行",
        ],
      },
    ],
  },
];

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function getAllProjectIds(): string[] {
  return projects.map((p) => p.id);
}
