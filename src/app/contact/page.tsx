import { ContactPageContent } from "@/components/contact/ContactPageContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch — have questions or want to collaborate? Reach out via the form.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactPageContent />;
}
