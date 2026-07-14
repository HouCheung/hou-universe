'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';

interface FormValues {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_FOCUS_CLASS =
  'focus-visible:border-blue-400 focus-visible:ring-blue-400/30';

const INITIAL_VALUES: FormValues = { name: '', email: '', message: '' };

export function ContactForm() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!values.name.trim()) {
      next.name = '请输入您的姓名。';
    }
    if (!values.email.trim()) {
      next.email = '请输入您的邮箱。';
    } else if (!EMAIL_REGEX.test(values.email)) {
      next.email = '请输入有效的邮箱地址。';
    }
    if (!values.message.trim()) {
      next.message = '请输入您的留言内容。';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setIsSuccess(true);
    setValues(INITIAL_VALUES);

    // Reset success message after 5 seconds
    setTimeout(() => setIsSuccess(false), 5000);
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
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
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
          type="text"
          placeholder="请输入您的姓名"
          value={values.name}
          onChange={(e) =>
            handleChange('name', (e.target as HTMLInputElement).value)
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
          type="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={(e) =>
            handleChange('email', (e.target as HTMLInputElement).value)
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

      {/* Message field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-message"
          className="text-sm font-medium text-foreground"
        >
          留言
        </label>
        <Textarea
          id="contact-message"
          placeholder="请输入您的留言内容……"
          rows={5}
          value={values.message}
          onChange={(e) =>
            handleChange('message', (e.target as HTMLTextAreaElement).value)
          }
          className={INPUT_FOCUS_CLASS}
          aria-invalid={!!errors.message}
        />
        {errors.message && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-400"
          >
            {errors.message}
          </motion.p>
        )}
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
              发送中……
            </>
          ) : (
            <>
              <Send className="size-4" />
              发送消息
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
            消息发送成功！我会尽快回复您。
          </motion.p>
        )}
      </div>
    </motion.form>
  );
}
