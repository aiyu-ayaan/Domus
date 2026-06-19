// Forgot Password Page implementation
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Shield, Mail, ArrowLeft } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    // Simulate password reset network request
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsLoading(false);
    toast.success("Password reset link sent!", {
      description: "Please check your email inbox to reset your password.",
    });
    router.push("/auth/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary mb-4">
            <Shield className="h-6 w-6 animate-pulse-slow" />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Reset Password
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your registered email address to receive password recovery
            instructions.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl border border-border bg-card/40 p-6 sm:p-8 backdrop-blur-md shadow-glow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email input */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Registered Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="email"
                  placeholder="owner@example.com"
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-rose-500 font-semibold">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Send Recovery Link"
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-border/50 pt-4 text-center">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
