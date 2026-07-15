"use client";

import { useState, useCallback, type FormEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  "focus-visible:border-slate-400 focus-visible:ring-slate-400/30";

const INITIAL_VALUES: FormValues = { name: "", email: "", description: "" };

export function ContactForm() {
  const { t } = useTranslation();
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
      next.name = t("contact.form.errorName");
    }
    if (!values.email.trim()) {
      next.email = t("contact.form.errorEmail");
    } else if (!EMAIL_REGEX.test(values.email)) {
      next.email = t("contact.form.errorEmailInvalid");
    }
    if (!values.description.trim()) {
      next.description = t("contact.form.errorDescription");
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
      <input type="hidden" name="form-name" value="contact-form" />
      <input type="hidden" name="bot-field" />

      {/* Name field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-name"
          className="text-sm font-medium text-foreground"
        >
          {t("contact.form.name")}
        </label>
        <Input
          id="contact-name"
          name="name"
          type="text"
          placeholder={t("contact.form.namePlaceholder")}
          value={values.name}
          onChange={(e) =>
            handleChange("name", (e.target as HTMLInputElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
        />
        {errors.name && (
          <motion.p
            id="contact-name-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-600 dark:text-red-400"
            role="alert"
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
          {t("contact.form.email")}
        </label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          placeholder={t("contact.form.emailPlaceholder")}
          value={values.email}
          onChange={(e) =>
            handleChange("email", (e.target as HTMLInputElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
        />
        {errors.email && (
          <motion.p
            id="contact-email-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-600 dark:text-red-400"
            role="alert"
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
          {t("contact.form.description")}
        </label>
        <Textarea
          id="contact-description"
          name="description"
          placeholder={t("contact.form.descriptionPlaceholder")}
          rows={5}
          value={values.description}
          onChange={(e) =>
            handleChange("description", (e.target as HTMLTextAreaElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "contact-desc-error" : undefined}
        />
        {errors.description && (
          <motion.p
            id="contact-desc-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-600 dark:text-red-400"
            role="alert"
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
          {t("contact.form.attachment")}
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
            aria-label={t("contact.form.attachment")}
          />
          <div className="flex items-center gap-3 rounded-lg border border-border bg-input/50 px-4 py-2.5 text-sm text-muted-foreground transition-all duration-200 hover:border-slate-400/30 hover:bg-input/70 cursor-pointer">
            <Paperclip className="size-4 shrink-0 text-slate-600/70 dark:text-slate-300/70" />
            <span className={fileName ? "text-foreground" : ""}>
              {fileName || t("contact.form.attachmentHint")}
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
              {t("contact.form.submitting")}
            </>
          ) : (
            <>
              <Send className="size-4" />
              {t("contact.form.submit")}
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
            {t("contact.form.success")}
          </motion.p>
        )}
      </div>
    </motion.form>
  );
}
