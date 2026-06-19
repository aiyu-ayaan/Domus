// Login Page implementation with form validation and remember me controls
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Shield, Eye, EyeOff, Lock, Mail } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, setRememberMe, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@example.com",
      password: "supersecret1",
      rememberMe: true,
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setRememberMe(data.rememberMe);
    try {
      await login({ email: data.email, password: data.password });
      toast.success("Welcome to Domus!", {
        description: "Logged in successfully.",
      });
      router.push("/");
    } catch (err: any) {
      toast.error(err?.error?.message || err?.message || "Login failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Logo */}
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary mb-4">
            <Shield className="h-6 w-6 animate-pulse-slow" />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Welcome Back
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your credentials to access your smart home dashboard.
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-3xl border border-border bg-card/40 p-6 sm:p-8 backdrop-blur-md shadow-glow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email input */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="email"
                  placeholder="email@example.com"
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

            {/* Password input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-11 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4.5 w-4.5" />
                  ) : (
                    <Eye className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-rose-500 font-semibold">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me Checkbox */}
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-background/50 text-primary focus:ring-primary focus:ring-offset-0 outline-none cursor-pointer"
                {...register("rememberMe")}
              />
              <label
                htmlFor="remember-me"
                className="ml-2 text-xs font-medium text-muted-foreground cursor-pointer select-none"
              >
                Keep me logged in on this device
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Footer redirection */}
        <div className="text-center text-xs text-muted-foreground">
          Don't have a Domus account?{" "}
          <Link
            href="/auth/register"
            className="font-semibold text-primary hover:underline cursor-pointer"
          >
            Register Home Owner
          </Link>
        </div>
      </div>
    </div>
  );
}
