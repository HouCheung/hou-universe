/**
 * Generate a vCard (.vcf) file content for download.
 * Supports bilingual (zh-CN / en) content.
 */

interface VCardData {
  fullName: string;
  email: string;
  website: string;
  organization: string;
  title: string;
}

const vcardData: Record<"zh-CN" | "en", VCardData> = {
  "zh-CN": {
    fullName: "HOU (侯)",
    email: "zhang13714579875@163.com",
    website: "https://hou-universe.vercel.app",
    organization: "广东技术师范大学",
    title: "全栈开发者 / 数据工程师",
  },
  en: {
    fullName: "HOU (Cheung)",
    email: "zhang13714579875@163.com",
    website: "https://hou-universe.vercel.app",
    organization: "Guangdong Polytechnic Normal University",
    title: "Full-Stack Developer / Data Engineer",
  },
};

export function generateVCard(lang: string): string {
  const data = lang === "en" ? vcardData.en : vcardData["zh-CN"];

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${data.fullName}`,
    `N:${data.fullName};;;`,
    `ORG:${data.organization}`,
    `TITLE:${data.title}`,
    `EMAIL:${data.email}`,
    `URL:${data.website}`,
    "END:VCARD",
  ];

  return lines.join("\n");
}

export function downloadVCard(lang: string): void {
  const vcardString = generateVCard(lang);
  const blob = new Blob([vcardString], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "HOU_Universe_Contact.vcf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
