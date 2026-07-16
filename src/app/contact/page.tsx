import type { Metadata } from "next";
import { ContactPageContent } from "@/components/contact/ContactPageContent";

export const metadata: Metadata = {
  title: "Contact - HOU Universe",
  description: "Get in touch — have questions or want to collaborate? Reach out via the form.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
