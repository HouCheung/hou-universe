"use client";

import { Sun, Moon } from "lucide-react";
import { motion, useAnimation } from "framer-motion";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/layout/ThemeProvider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const controls = useAnimation();

  // Animate rotation on theme change
  useEffect(() => {
    controls.start({ rotate: [0, 180], transition: { duration: 0.4, ease: "easeInOut" } });
  }, [theme, controls]);

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8 rounded-full"
      onClick={toggleTheme}
      aria-label={
        isDark
          ? t("theme.switchToLight", "Switch to light mode")
          : t("theme.switchToDark", "Switch to dark mode")
      }
    >
      <motion.div
        animate={controls}
        className="flex items-center justify-center"
      >
        {isDark ? (
          <Sun className="h-[18px] w-[18px] text-amber-400" />
        ) : (
          <Moon className="h-[18px] w-[18px] text-indigo-500" />
        )}
      </motion.div>
    </Button>
  );
}
