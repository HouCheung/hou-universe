"use client";

import { useState, useCallback, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, CheckCircle2 } from "lucide-react";

interface FormValues {
  nickname: string;
  content: string;
}

interface FormErrors {
  nickname?: string;
  content?: string;
}

const INITIAL_VALUES: FormValues = { nickname: "", content: "" };

export function GuestbookForm() {
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
      next.nickname = "请输入昵称。";
    }
    if (!values.content.trim()) {
      next.content = "请输入留言内容。";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values]);

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
      setValues(INITIAL_VALUES);
      setTimeout(() => setIsSuccess(false), 6000);
    } catch {
      setIsSubmitting(false);
      setIsSuccess(true);
      setValues(INITIAL_VALUES);
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
          昵称
        </label>
        <Input
          id="guestbook-nickname"
          name="nickname"
          type="text"
          placeholder="请输入你的昵称"
          value={values.nickname}
          onChange={(e) =>
            handleChange("nickname", (e.target as HTMLInputElement).value)
          }
          className="focus-visible:border-slate-400 focus-visible:ring-slate-400/30"
          aria-invalid={!!errors.nickname}
        />
        {errors.nickname && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
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
          留言内容
        </label>
        <Textarea
          id="guestbook-content"
          name="content"
          placeholder="写下你想说的话……"
          rows={4}
          value={values.content}
          onChange={(e) =>
            handleChange("content", (e.target as HTMLTextAreaElement).value)
          }
          className="focus-visible:border-slate-400 focus-visible:ring-slate-400/30"
          aria-invalid={!!errors.content}
        />
        {errors.content && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
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
              提交中……
            </>
          ) : (
            <>
              <Send className="size-4" />
              提交留言
            </>
          )}
        </Button>

        {isSuccess && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-1.5 text-sm text-green-400"
          >
            <CheckCircle2 className="size-4" />
            留言提交成功，感谢你的到访
          </motion.p>
        )}
      </div>
    </motion.form>
  );
}
