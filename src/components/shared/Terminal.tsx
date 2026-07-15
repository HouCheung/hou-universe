"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal as TerminalIcon, X } from "lucide-react";

interface CommandEntry {
  input: string;
  output: string;
}

const NAV_COMMANDS: Record<string, string> = {
  home: "/",
  projects: "/projects",
  about: "/about",
  contact: "/contact",
  notes: "/notes",
  tools: "/tools",
  links: "/links",
  guestbook: "/guestbook",
};

export function Terminal() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getHelpOutput = useCallback(
    () =>
      `  ${t("terminal.commands.help")}
  ─────────────────────────────────
  home      - ${t("terminal.commands.home")}
  projects  - ${t("terminal.commands.projects")}
  about     - ${t("terminal.commands.about")}
  contact   - ${t("terminal.commands.contact")}
  notes     - ${t("terminal.commands.notes")}
  tools     - ${t("terminal.commands.tools")}
  links     - ${t("terminal.commands.links")}
  guestbook - ${t("terminal.commands.guestbook")}
  whoami    - ${t("terminal.commands.whoami")}
  clear     - ${t("terminal.commands.clear")}
  help      - ${t("terminal.commands.helpCmd")}`,
    [t]
  );

  const getWhoamiOutput = useCallback(
    () =>
      `  ${t("terminal.whoami.name")}: HOU
  ${t("terminal.whoami.role")}: ${t("terminal.whoami.roleValue")}
  ${t("terminal.whoami.skills")}: TypeScript, React, Next.js, Python, Java, SQL, Big Data
  ${t("terminal.whoami.bio")}: ${t("terminal.whoami.bioValue")}`,
    [t]
  );

  const processCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim().toLowerCase();

      if (!trimmed) {
        setHistory((prev) => [...prev, { input: cmd, output: "" }]);
        return;
      }

      if (trimmed === "clear") {
        setHistory([]);
        setInput("");
        return;
      }

      // Navigation commands
      if (NAV_COMMANDS[trimmed]) {
        setHistory((prev) => [
          ...prev,
          {
            input: cmd,
            output: `  ${t("terminal.navigating")} ${trimmed}...`,
          },
        ]);
        setTimeout(() => {
          router.push(NAV_COMMANDS[trimmed]);
          setIsOpen(false);
        }, 300);
        return;
      }

      // Info commands
      if (trimmed === "help") {
        setHistory((prev) => [...prev, { input: cmd, output: getHelpOutput() }]);
        return;
      }

      if (trimmed === "whoami") {
        setHistory((prev) => [...prev, { input: cmd, output: getWhoamiOutput() }]);
        return;
      }

      // Unknown command
      setHistory((prev) => [
        ...prev,
        {
          input: cmd,
          output: `  ${t("terminal.unknownCmd")}: ${trimmed}\n  ${t("terminal.typeHelp")}`,
        },
      ]);
    },
    [t, router, getHelpOutput, getWhoamiOutput]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(input);
    setCommandHistory((prev) => [...prev, input]);
    setInput("");
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  };

  /* ── Global backtick listener ── */
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "`") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [isOpen]);

  /* ── Focus input on open ── */
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [history]);

  /* ── Hidden on touch devices ── */
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] hidden md:flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Terminal window */}
          <motion.div
            className="relative z-10 w-full max-w-2xl mx-4"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Title bar */}
            <div className="flex items-center gap-3 rounded-t-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-[#1e293b] dark:bg-[#0f172a]">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#ef4444]" />
                <div className="h-3 w-3 rounded-full bg-[#eab308]" />
                <div className="h-3 w-3 rounded-full bg-[#22c55e]" />
              </div>
              <div className="flex flex-1 items-center justify-center gap-2">
                <TerminalIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" />
                <span className="font-mono text-xs text-slate-600 dark:text-slate-500">
                  HOU-terminal
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-600 dark:hover:text-slate-400"
                aria-label={t("terminal.close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Terminal body */}
            <div
              ref={containerRef}
              className="h-[420px] overflow-y-auto rounded-b-xl border border-t-0 border-slate-200 bg-white/95 p-4 font-mono text-sm dark:border-[#1e293b] dark:bg-[#020617]/95"
              onClick={() => inputRef.current?.focus()}
            >
              {/* Welcome message */}
              <div className="mb-3 text-slate-500 dark:text-[#64748b]">
                <div className="text-blue-600 dark:text-[#3b82f6]">
                  ╔══════════════════════════════════════╗
                </div>
                <div className="text-blue-600 dark:text-[#3b82f6]">
                  ║{"  "}
                  <span className="text-slate-600 dark:text-[#94a3b8]">
                    {t("terminal.welcome")}
                  </span>
                  {"  "}║
                </div>
                <div className="text-blue-600 dark:text-[#3b82f6]">
                  ║{"  "}
                  <span className="text-slate-500 dark:text-[#64748b]">
                    {t("terminal.typeHelpHint")}
                  </span>
                  {"    "}║
                </div>
                <div className="text-blue-600 dark:text-[#3b82f6]">
                  ╚══════════════════════════════════════╝
                </div>
              </div>

              {/* History */}
              {history.map((entry, i) => (
                <div key={i} className="mb-1">
                  <div className="flex items-center gap-2 text-green-600 dark:text-[#22c55e]">
                    <span className="shrink-0">❯</span>
                    <span>{entry.input}</span>
                  </div>
                  {entry.output && (
                    <pre className="ml-4 whitespace-pre-wrap text-slate-600 text-xs leading-relaxed dark:text-[#94a3b8]">
                      {entry.output}
                    </pre>
                  )}
                </div>
              ))}

              {/* Input line */}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <span className="shrink-0 text-green-600 dark:text-[#22c55e]">❯</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 border-none bg-transparent font-mono text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-[#e2e8f0] dark:placeholder:text-[#475569]"
                  placeholder={t("terminal.placeholder")}
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="h-4 w-2 animate-pulse bg-[#22c55e]/70" />
              </form>
            </div>

            {/* Tip bar */}
            <div className="mt-2 text-center">
              <span className="font-mono text-[0.6rem] text-slate-400 dark:text-[#475569]">
                ESC {t("terminal.toClose")} · ↑↓ {t("terminal.toNavigate")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
