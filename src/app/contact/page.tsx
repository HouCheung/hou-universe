import type { Metadata } from "next";
import { ContactPageContent } from "@/components/contact/ContactPageContent";

export const metadata: Metadata = {
  title: "联系 - HOU Universe",
  description: "联系我 — 有问题或想合作？通过表单与我取得联系。",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
