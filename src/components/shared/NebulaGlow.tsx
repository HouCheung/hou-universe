/**
 * NebulaGlow — subtle cosmic atmosphere spots rendered on all pages.
 * Low-opacity blurred radial gradients that add depth without distracting from content.
 */
export function NebulaGlow() {
  return (
    <>
      {/* Top-left blue-purple nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[15%] -left-[10%] h-[55%] w-[55%] rounded-full opacity-[0.05] blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(59,130,246,0.45) 0%, rgba(139,92,246,0.25) 40%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Bottom-right purple-blue nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[8%] -right-[5%] h-[45%] w-[45%] rounded-full opacity-[0.04] blur-[100px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, rgba(59,130,246,0.18) 45%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Center-right subtle indigo nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[35%] left-[55%] h-[35%] w-[35%] rounded-full opacity-[0.03] blur-[140px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(59,130,246,0.3) 0%, rgba(99,102,241,0.15) 50%, transparent 75%)",
          zIndex: -1,
        }}
      />
    </>
  );
}
