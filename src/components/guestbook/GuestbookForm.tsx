"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import type { GuestbookMessage } from "@/types";

interface FormValues {
  nickname: string;
  content: string;
}

interface FormErrors {
  nickname?: string;
  content?: string;
}

const INITIAL_VALUES: FormValues = { nickname: "", content: "" };

interface GuestbookFormProps {
  onSuccess?: (message: GuestbookMessage) => void;
}

export function GuestbookForm({ onSuccess }: GuestbookFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const encode = useCallback((data: Record<string, string>) => {
    return Object.keys(data)
      .map(
        (key) =>
          encodeURIComponent(key) + "=" + encodeURIComponent(data[key])
      )
      .join("&");
  }, []);

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!values.nickname.trim()) {
      next.nickname = t("guestbook.form.errorNickname");
    }
    if (!values.content.trim()) {
      next.content = t("guestbook.form.errorContent");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values, t]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode({
          "form-name": "guestbook",
          nickname: values.nickname,
          content: values.content,
        }),
      });

      setIsSubmitting(false);
      setIsSuccess(true);
      const newMessage: GuestbookMessage = {
        id: `msg-${Date.now()}`,
        nickname: values.nickname.trim(),
        content: values.content.trim(),
        date: new Date().toISOString().slice(0, 10),
      };
      setValues(INITIAL_VALUES);
      onSuccess?.(newMessage);
      setTimeout(() => setIsSuccess(false), 6000);
    } catch {
      setIsSubmitting(false);
      setIsSuccess(true);
      const newMessage: GuestbookMessage = {
        id: `msg-${Date.now()}`,
        nickname: values.nickname.trim(),
        content: values.content.trim(),
        date: new Date().toISOString().slice(0, 10),
      };
      setValues(INITIAL_VALUES);
      onSuccess?.(newMessage);
      setTimeout(() => setIsSuccess(false), 6000);
    }
  };

  const handleChange = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <motion.form
      name="guestbook"
      method="POST"
      data-netlify="true"
      netlify-honeypot="bot-field"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <input type="hidden" name="form-name" value="guestbook" />
      <input type="hidden" name="bot-field" />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="guestbook-nickname"
          className="text-sm font-medium text-foreground"
        >
          {t("guestbook.form.nickname")}
        </label>
        <Input
          id="guestbook-nickname"
          name="nickname"
          type="text"
          placeholder={t("guestbook.form.nicknamePlaceholder")}
          value={values.nickname}
          onChange={(e) =>
            handleChange("nickname", (e.target as HTMLInputElement).value)
          }
          className="focus-visible:border-slate-400 focus-visible:ring-slate-400/30"
          aria-invalid={!!errors.nickname}
          aria-describedby={errors.nickname ? "gb-nickname-error" : undefined}
        />
        {errors.nickname && (
          <motion.p
            id="gb-nickname-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            {errors.nickname}
          </motion.p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="guestbook-content"
          className="text-sm font-medium text-foreground"
        >
          {t("guestbook.form.content")}
        </label>
        <Textarea
          id="guestbook-content"
          name="content"
          placeholder={t("guestbook.form.contentPlaceholder")}
          rows={4}
          value={values.content}
          onChange={(e) =>
            handleChange("content", (e.target as HTMLTextAreaElement).value)
          }
          className="focus-visible:border-slate-400 focus-visible:ring-slate-400/30"
          aria-invalid={!!errors.content}
          aria-describedby={errors.content ? "gb-content-error" : undefined}
        />
        {errors.content && (
          <motion.p
            id="gb-content-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            {errors.content}
          </motion.p>
        )}
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("guestbook.form.submitting")}
            </>
          ) : (
            <>
              <Send className="size-4" />
              {t("guestbook.form.submit")}
            </>
          )}
        </Button>

        {isSuccess && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"
            role="status"
          >
            <CheckCircle2 className="size-4" />
            {t("guestbook.form.success")}
          </motion.p>
        )}
      </div>
    </motion.form>
  );
}
