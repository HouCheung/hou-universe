import type { Metadata } from 'next';
import { ContactForm } from '@/components/shared/ContactForm';
import { ContactInfo } from '@/components/shared/ContactInfo';

export const metadata: Metadata = {
  title: 'Contact - HOU Universe',
  description:
    'Get in touch — have a question or want to collaborate? Reach out through the contact form.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        {/* Page header */}
        <header className="mb-16 text-center sm:mb-24">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
            Contact
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Get In Touch
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Have a question, an idea, or just want to say hello? Fill out the
            form below or reach out through any of the channels listed —
            I&apos;ll get back to you as soon as possible.
          </p>
        </header>

        {/* Two-column layout */}
        <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
          {/* Left: Contact form */}
          <div className="lg:col-span-3">
            <ContactForm />
          </div>

          {/* Right: Contact info cards */}
          <div className="lg:col-span-2">
            <ContactInfo />
          </div>
        </div>
      </div>
    </div>
  );
}
