"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hash, Trophy, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

type Difficulty = "3x3" | "4x4";
type GamePhase = "idle" | "playing" | "cleared" | "completed";

interface ClickFeedback {
  index: number;
  result: "correct" | "wrong";
}

/* ── Constants ── */

/** How long correct-click visual highlight stays visible (non-blocking) */
const FEEDBACK_DURATION = 400;
/** Delay before resetting the grid after a wrong click */
const WRONG_RESET_DELAY = 650;
/** Pause after clearing 3×3 before upgrading to 4×4 */
const UPGRADE_DELAY_MS = 1500;
const BEST_3X3_KEY = "number-rush-best-3x3";
const BEST_4X4_KEY = "number-rush-best-4x4";

/* ── Helpers ── */

/** Generate a shuffled array of numbers 1..n */
function shuffleArray(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Get column count and number range for a difficulty level */
function getGridConfig(d: Difficulty): { cols: number; count: number } {
  return d === "3x3" ? { cols: 3, count: 9 } : { cols: 4, count: 16 };
}

/* ── Props ── */

interface NumberRushProps {
  open: boolean;
  onClose: () => void;
}

/* ── Component ── */

export function NumberRush({ open, onClose }: NumberRushProps) {
  const { t } = useTranslation();

  /* ── Game state ── */
  const [difficulty, setDifficulty] = useState<Difficulty>("3x3");
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [numbers, setNumbers] = useState<number[]>(() => shuffleArray(9));
  const [nextNumber, setNextNumber] = useState(1);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [best3x3, setBest3x3] = useState<number | null>(null);
  const [best4x4, setBest4x4] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ClickFeedback | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gridId, setGridId] = useState(0);

  /* ── Refs — keep mutable copies for timer / timeout callbacks ── */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const phaseRef = useRef<GamePhase>("idle");
  const difficultyRef = useRef<Difficulty>("3x3");
  const nextNumberRef = useRef(1);
  const numbersRef = useRef<number[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs synchronised with state so timer callbacks always read fresh values
  useEffect(() => {
    phaseRef.current = phase;
    difficultyRef.current = difficulty;
    nextNumberRef.current = nextNumber;
    numbersRef.current = numbers;
  }, [phase, difficulty, nextNumber, numbers]);

  /* ── Load best records from localStorage when modal opens ── */
  useEffect(() => {
    if (!open) return;
    try {
      const b3 = localStorage.getItem(BEST_3X3_KEY);
      if (b3) setBest3x3(Number(b3));
      const b4 = localStorage.getItem(BEST_4X4_KEY);
      if (b4) setBest4x4(Number(b4));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }, [open]);

  /* ── Persist a new best record ── */
  const saveBest = useCallback((d: Difficulty, time: number) => {
    const key = d === "3x3" ? BEST_3X3_KEY : BEST_4X4_KEY;
    try {
      const prev = localStorage.getItem(key);
      if (!prev || time < Number(prev)) {
        localStorage.setItem(key, String(time));
        if (d === "3x3") setBest3x3(time);
        else setBest4x4(time);
      }
    } catch {
      // localStorage unavailable — silently ignore
    }
  }, []);

  /* ── Timer helpers ── */

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startTimeRef.current = performance.now();
    setElapsedTime(0);
    // ~60 fps update for smooth ms display
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.round(performance.now() - startTimeRef.current));
    }, 16);
  }, [clearTimer]);

  const stopTimer = useCallback((): number => {
    clearTimer();
    const elapsed = Math.round(performance.now() - startTimeRef.current);
    setElapsedTime(elapsed);
    return elapsed;
  }, [clearTimer]);

  /* ── Clear all pending async timers (feedback & upgrade) ── */
  const clearPendingTimers = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (upgradeTimerRef.current !== null) {
      clearTimeout(upgradeTimerRef.current);
      upgradeTimerRef.current = null;
    }
  }, []);

  /* ── Initialise or reset a round for a given difficulty ── */
  const initRound = useCallback(
    (diff: Difficulty) => {
      clearTimer();
      clearPendingTimers();
      const { count } = getGridConfig(diff);
      const shuffled = shuffleArray(count);
      setDifficulty(diff);
      setPhase("idle");
      setNumbers(shuffled);
      setNextNumber(1);
      setElapsedTime(0);
      setFeedback(null);
      setIsProcessing(false);
      setGridId((g) => g + 1);
    },
    [clearTimer, clearPendingTimers],
  );

  /* ── Cell click handler ── */
  const handleCellClick = useCallback(
    (index: number) => {
      // Only block during wrong-click reset or upgrade transition
      if (isProcessing) return;

      const currentPhase = phaseRef.current;
      const currentNumbers = numbersRef.current;
      const expectedNext = nextNumberRef.current;
      const currentDifficulty = difficultyRef.current;

      // Ignore clicks during transition / completion states
      if (currentPhase === "cleared" || currentPhase === "completed") return;

      const value = currentNumbers[index];

      /* ── Wrong number clicked ── */
      if (value !== expectedNext) {
        setIsProcessing(true);
        // Clear any pending visual feedback timeout
        if (feedbackTimerRef.current !== null) {
          clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = null;
        }
        setFeedback({ index, result: "wrong" });
        clearTimer();

        feedbackTimerRef.current = setTimeout(() => {
          const { count } = getGridConfig(difficultyRef.current);
          const shuffled = shuffleArray(count);
          setNumbers(shuffled);
          setNextNumber(1);
          setPhase("idle");
          setElapsedTime(0);
          setFeedback(null);
          setIsProcessing(false);
          setGridId((g) => g + 1);
        }, WRONG_RESET_DELAY);
        return;
      }

      /* ── Correct number clicked ── */

      // First correct click (always "1") starts the clock
      if (value === 1 && currentPhase === "idle") {
        startTimer();
        setPhase("playing");
      }

      // Clear any pending visual feedback timeout (non-blocking, just visuals)
      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }

      const { count: totalCount } = getGridConfig(currentDifficulty);
      const isLastNumber = value === totalCount;

      if (isLastNumber) {
        // Round complete — stop timer and persist best
        const elapsed = stopTimer();
        saveBest(currentDifficulty, elapsed);
        setIsProcessing(true);

        if (currentDifficulty === "3x3") {
          // Upgrade to 4×4 after a celebratory pause
          setNextNumber(value + 1);
          setPhase("cleared");
          setFeedback({ index, result: "correct" });

          upgradeTimerRef.current = setTimeout(() => {
            const shuffled = shuffleArray(16);
            setDifficulty("4x4");
            setPhase("idle");
            setNumbers(shuffled);
            setNextNumber(1);
            setElapsedTime(0);
            setFeedback(null);
            setIsProcessing(false);
            setGridId((g) => g + 1);
          }, UPGRADE_DELAY_MS);
        } else {
          // 4×4 fully completed — end of game
          setNextNumber(value + 1);
          setPhase("completed");
          setFeedback({ index, result: "correct" });
          setIsProcessing(false);
        }
      } else {
        // Regular correct click — advance target INSTANTLY, no input blocking
        setNextNumber(value + 1);
        setFeedback({ index, result: "correct" });

        // Visual feedback fade-out only — does NOT block clicks
        feedbackTimerRef.current = setTimeout(() => {
          setFeedback(null);
        }, FEEDBACK_DURATION);
      }
    },
    [isProcessing, clearTimer, startTimer, stopTimer, saveBest],
  );

  /* ── Restart everything from 3×3 ── */
  const handleRestart = useCallback(() => {
    initRound("3x3");
  }, [initRound]);

  /* ── Close modal — total cleanup ── */
  const handleClose = useCallback(() => {
    // Destroy all running timers
    clearTimer();
    clearPendingTimers();
    // Reset every piece of game state for the next open
    const shuffled = shuffleArray(9);
    setDifficulty("3x3");
    setPhase("idle");
    setNumbers(shuffled);
    setNextNumber(1);
    setElapsedTime(0);
    setFeedback(null);
    setIsProcessing(false);
    setGridId((g) => g + 1);
    onClose();
  }, [clearTimer, clearPendingTimers, onClose]);

  /* ── Scroll lock when modal is open ── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* ── Escape key to close ── */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  /* ── Safety net: clean up on unmount ── */
  useEffect(() => {
    return () => {
      clearTimer();
      clearPendingTimers();
    };
  }, [clearTimer, clearPendingTimers]);

  /* ── Derived values ── */
  const { cols } = getGridConfig(difficulty);
  const currentBest = difficulty === "3x3" ? best3x3 : best4x4;
  // Responsive cell font: larger text for 3×3 grid, slightly smaller for denser 4×4
  const cellFontClass = cols === 3 ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl";

  /* ── Render ── */
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* ── Backdrop ── */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* ── Modal panel ── */}
          <motion.div
            className={cn(
              "glass-card relative z-10 flex w-full max-w-[600px] flex-col items-center gap-4 rounded-2xl p-6 sm:gap-5 sm:p-8",
              "border-brand/20 shadow-[0_0_40px_rgba(var(--brand-rgb),0.15)]",
              "max-h-[95vh] overflow-y-auto",
            )}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t("skills.closePopup")}
            >
              <X className="h-4 w-4" />
            </button>

            {/* ── Header ── */}
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold text-foreground">
                {t("playground.games.number-rush.title")}
              </h2>
            </div>

            {/* ── Info bar: difficulty · timer · best record ── */}
            <div className="flex w-full flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="glass-card rounded-lg px-3 py-1 text-xs font-medium">
                {t("playground.numberRush.currentLevel")}
              </span>

              {(phase === "playing" || phase === "cleared" || phase === "completed") && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                  <Timer className="h-3.5 w-3.5" />
                  {elapsedTime} ms
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded-lg bg-brand/5 px-3 py-1 text-xs font-medium">
                <Trophy className="h-3.5 w-3.5 text-brand/70" />
                {currentBest !== null
                  ? t("playground.numberRush.bestRecord", { best: currentBest })
                  : t("playground.numberRush.noRecord")}
              </span>
            </div>

            {/* ── Number grid ── */}
            <div
              className="grid w-full max-w-[520px] gap-2 sm:gap-3"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {numbers.map((value, index) => {
                const isClickedCell = feedback?.index === index;
                const isCorrect = feedback?.result === "correct";
                const isWrong = feedback?.result === "wrong";

                return (
                  <motion.button
                    key={`${gridId}-${index}`}
                    onClick={() => handleCellClick(index)}
                    disabled={isProcessing}
                    className={cn(
                      "relative flex items-center justify-center rounded-xl border-2 font-bold select-none",
                      "transition-colors duration-150",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                      "min-w-[44px] sm:min-w-[64px] aspect-square",
                      // Default style
                      "border-slate-200 bg-slate-50 text-slate-700",
                      "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200",
                      // Hover (suppressed while processing)
                      !isProcessing &&
                        "hover:border-brand/40 hover:bg-brand/5 dark:hover:border-brand/30 dark:hover:bg-brand/5",
                      // Correct feedback
                      isClickedCell &&
                        isCorrect &&
                        "border-green-400 bg-green-50 text-green-700 dark:border-green-500/60 dark:bg-green-500/10 dark:text-green-300",
                      // Wrong feedback
                      isClickedCell &&
                        isWrong &&
                        "border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-500/10 dark:text-red-300",
                      // Muted appearance for non-feedback cells while processing
                      isProcessing && !isClickedCell && "opacity-60 cursor-not-allowed",
                    )}
                    // Subtle animation: shake on wrong, pulse on correct
                    animate={
                      isClickedCell && isWrong
                        ? { x: [0, -6, 6, -4, 4, 0] }
                        : isClickedCell && isCorrect
                          ? { scale: [1, 0.88, 1.04, 1] }
                          : {}
                    }
                    transition={
                      isClickedCell && isWrong
                        ? { duration: 0.4, ease: "easeOut" }
                        : { duration: 0.3, ease: "easeOut" }
                    }
                  >
                    <span className={cn("pointer-events-none", cellFontClass)}>
                      {value}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* ── Status message ── */}
            <div className="flex min-h-[2.5rem] flex-col items-center justify-center text-center">
              {/* Idle — waiting for player to tap "1" */}
              {phase === "idle" && feedback === null && (
                <p className="text-sm text-muted-foreground">
                  {t("playground.numberRush.waitingForStart")}
                </p>
              )}

              {/* Playing — hint to keep going */}
              {phase === "playing" && feedback === null && (
                <p className="text-sm text-muted-foreground">
                  {t("playground.numberRush.correct")}
                </p>
              )}

              {/* Wrong order feedback */}
              {feedback?.result === "wrong" && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t("playground.numberRush.wrongOrder")}
                </p>
              )}

              {/* 3×3 cleared — upgrading notification */}
              {phase === "cleared" && (
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  {t("playground.numberRush.clearedUpgrading")}
                </p>
              )}

              {/* 4×4 fully completed */}
              {phase === "completed" && (
                <p className="text-base font-semibold text-green-600 dark:text-green-400">
                  {t("playground.numberRush.completed", { time: elapsedTime })}
                </p>
              )}
            </div>

            {/* ── Action buttons ── */}
            <div className="flex w-full items-center justify-center gap-3">
              {(phase === "completed" || phase === "idle") && (
                <Button onClick={handleRestart} variant="default" size="sm">
                  {t("playground.numberRush.restart")}
                </Button>
              )}
              <Button
                onClick={handleClose}
                variant={phase === "completed" ? "outline" : "ghost"}
                size="sm"
              >
                {t("playground.numberRush.close")}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
