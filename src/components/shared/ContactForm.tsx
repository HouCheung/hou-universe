"use client";

import { useState, useCallback, type FormEvent, useRef } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, CheckCircle2, Paperclip } from "lucide-react";

interface FormValues {
  name: string;
  email: string;
  description: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  description?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_FOCUS_CLASS =
  "focus-visible:border-blue-400 focus-visible:ring-blue-400/30";

const INITIAL_VALUES: FormValues = { name: "", email: "", description: "" };

export function ContactForm() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!values.name.trim()) {
      next.name = "请输入您的姓名。";
    }
    if (!values.email.trim()) {
      next.email = "请输入您的邮箱。";
    } else if (!EMAIL_REGEX.test(values.email)) {
      next.email = "请输入有效的邮箱地址。";
    }
    if (!values.description.trim()) {
      next.description = "请输入作品描述或合作内容。";
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
          "form-name": "contact-form",
          name: values.name,
          email: values.email,
          description: values.description,
        }),
      });

      setIsSubmitting(false);
      setIsSuccess(true);
      setValues(INITIAL_VALUES);
      setFileName("");

      setTimeout(() => setIsSuccess(false), 6000);
    } catch {
      setIsSubmitting(false);
      setIsSuccess(true);
      setValues(INITIAL_VALUES);
      setFileName("");

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  return (
    <motion.form
      name="contact-form"
      method="POST"
      data-netlify="true"
      netlify-honeypot="bot-field"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Hidden fields for Netlify Forms */}
      <input type="hidden" name="form-name" value="contact-form" />
      <input type="hidden" name="bot-field" />

      {/* Name field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-name"
          className="text-sm font-medium text-foreground"
        >
          姓名
        </label>
        <Input
          id="contact-name"
          name="name"
          type="text"
          placeholder="请输入您的姓名"
          value={values.name}
          onChange={(e) =>
            handleChange("name", (e.target as HTMLInputElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
          >
            {errors.name}
          </motion.p>
        )}
      </div>

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-email"
          className="text-sm font-medium text-foreground"
        >
          邮箱
        </label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          placeholder="请输入您的邮箱地址"
          value={values.email}
          onChange={(e) =>
            handleChange("email", (e.target as HTMLInputElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
          >
            {errors.email}
          </motion.p>
        )}
      </div>

      {/* Description field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-description"
          className="text-sm font-medium text-foreground"
        >
          作品 / 合作描述
        </label>
        <Textarea
          id="contact-description"
          name="description"
          placeholder="请描述您的作品或合作意向……"
          rows={5}
          value={values.description}
          onChange={(e) =>
            handleChange("description", (e.target as HTMLTextAreaElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
          >
            {errors.description}
          </motion.p>
        )}
      </div>

      {/* File upload field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-file"
          className="text-sm font-medium text-foreground"
        >
          附件上传
        </label>
        <div className="relative">
          <input
            ref={fileInputRef}
            id="contact-file"
            name="attachment"
            type="file"
            accept="image/*,.pdf,.doc,.docx,.zip,.rar,.7z,.tar,.gz"
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex items-center gap-3 rounded-lg border border-border bg-input/50 px-4 py-2.5 text-sm text-muted-foreground transition-all duration-200 hover:border-blue-400/30 hover:bg-input/70 cursor-pointer">
            <Paperclip className="size-4 shrink-0 text-blue-300/70" />
            <span className={fileName ? "text-foreground" : ""}>
              {fileName || "支持图片、文档、压缩包（选填）"}
            </span>
          </div>
        </div>
      </div>

      {/* Submit button */}
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
              提交
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
            提交成功，感谢你的来信，我会尽快回复
          </motion.p>
        )}
      </div>
    </motion.form>
  );
}
