import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "MiniMind Lab",
    template: "%s | MiniMind Lab · HOU Universe",
  },
  description:
    "MiniMind Lab — explore the model architecture, training pipeline, generation quality, research studio, and interactive experiments.",
};

export default function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      {children}
    </div>
  );
}
