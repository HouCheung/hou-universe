import type { WorkExperience } from "@/types";

/**
 * Work experience registry.
 *
 * Display text is overridden through the i18n keys
 * `workExperience.items.<id>.*` in both zh-CN and en. The Chinese
 * values below are the canonical fallback.
 */
export const workExperiences: WorkExperience[] = [
  {
    id: "jiahuan-network-optimization-intern",
    company: "嘉环科技股份有限公司",
    role: "网优测试工程师实习生",
    period: "2026.07 — 2026.09",
    description:
      "参与华为项目组与中国移动项目协作，支持深圳 APEC 会议及大型演唱会 4G/5G 通信保障，并完成高校、地铁、商圈、景区、地下停车场等多场景外场测试。",
    sections: [
      {
        id: "major-events",
        title: "重大活动网络保障",
        points: [
          "对接华为项目组及中国移动甲方，参与深圳 APEC 会议及深圳大运中心薛之谦、邓紫棋大型演唱会 4G/5G 通信保障。",
          "开展现场定点 CQT 测试，采集 RSRP、SINR、上下行速率等无线指标，整点反馈现场网络测试数据并记录网络状态，支撑重大活动通信保障工作。",
        ],
      },
      {
        id: "field-testing",
        title: "多场景 5G 外场测试",
        points: [
          "使用 PHU Smart、Cellular-Z、路测分析软件，参与高校、深圳地铁 4 号线、商圈、景区、地下停车场等多场景测试。",
          "执行锁频锁 PCI、点位踏勘与现场测试操作，完成测试文件导出、分类归档、数据打包传输交付全流程，积累高移动、高人流密度场景的测试经验。",
        ],
      },
      {
        id: "coordination",
        title: "现场协同与问题排查",
        points: [
          "跟随华为工程师开展现场踏勘与点位摸排，在测试过程中进行基础故障排查。",
          "与移动侧同步现场测试情况，规范完成测试资料整理归档，保障外场测试任务有序执行。",
        ],
      },
      {
        id: "learning",
        title: "实习收获",
        points: [
          "结合大数据专业的数据分析思维，逐步建立无线指标、现场环境与业务体验之间的逻辑关联。",
          "参与重点专项保障及多场景外场测试，理解大型活动通信保障的流程，并在华为、中国移动等多方协作中提升现场沟通和任务协调能力。",
        ],
      },
    ],
    tags: [
      "4G/5G",
      "CQT",
      "RSRP",
      "SINR",
      "PHU Smart",
      "Cellular-Z",
      "PCI Locking",
      "Field Testing",
      "Data Handover",
    ],
  },
];

export function getWorkExperienceById(
  id: string
): WorkExperience | undefined {
  return workExperiences.find((experience) => experience.id === id);
}
