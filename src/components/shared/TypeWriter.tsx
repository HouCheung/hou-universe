'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';

interface TypeWriterProps {
  texts: string[];
  typeSpeed?: number;
  deleteSpeed?: number;
  pauseDuration?: number;
  startDelay?: number;
  className?: string;
}

export function TypeWriter({
  texts,
  typeSpeed = 80,
  deleteSpeed = 40,
  pauseDuration = 2000,
  startDelay = 800,
  className = '',
}: TypeWriterProps) {
  const [displayText, setDisplayText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const textIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Start delay
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsStarted(true);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [startDelay]);

  const tick = useCallback(() => {
    const currentText = texts[textIndexRef.current];

    if (!isDeletingRef.current) {
      // Typing forward
      if (charIndexRef.current < currentText.length) {
        charIndexRef.current += 1;
        setDisplayText(currentText.slice(0, charIndexRef.current));
        return typeSpeed + Math.random() * 40;
      }
      // Finished typing, pause before deleting
      isDeletingRef.current = true;
      return pauseDuration;
    }

    // Deleting
    if (charIndexRef.current > 0) {
      charIndexRef.current -= 1;
      setDisplayText(currentText.slice(0, charIndexRef.current));
      return deleteSpeed + Math.random() * 20;
    }

    // Move to next text
    isDeletingRef.current = false;
    textIndexRef.current = (textIndexRef.current + 1) % texts.length;
    return typeSpeed;
  }, [texts, typeSpeed, deleteSpeed, pauseDuration]);

  useEffect(() => {
    if (!isStarted) return;

    let active = true;

    const run = async () => {
      while (active) {
        const delay = tick();
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [isStarted, tick]);

  return (
    <span className={className} aria-label={texts.join(', ')}>
      {displayText}
      <motion.span
        animate={{ opacity: cursorVisible ? 0.9 : 0.2 }}
        transition={{ duration: 0.15 }}
        className="ml-0.5 inline-block w-[2px] h-[1em] bg-blue-300 align-middle -translate-y-[0.05em]"
        aria-hidden="true"
      />
    </span>
  );
}
