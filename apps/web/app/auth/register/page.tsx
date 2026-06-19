// Register page implementation for creating the owner/admin account
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Shield, Lock, Mail, User } from "lucide-react";

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        full_name: data.fullName,
      });
      toast.success("Registration successful!", {
        description: "Welcome to your new Domus home server.",
      });
      router.push("/");
    } catch (err: any) {
      toast.error(err?.error?.message || err?.message || "Registration failed");
    }
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
            Create Owner Account
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            The first account registered on this server is granted the **Owner**
            role.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl border border-border bg-card/40 p-6 sm:p-8 backdrop-blur-md shadow-glow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                  {...register("fullName")}
                />
              </div>
              {errors.fullName && (
                <p className="text-xs text-rose-500 font-semibold">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email Address
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

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-rose-500 font-semibold">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                  {...register("confirmPassword")}
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-rose-500 font-semibold">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 mt-2 text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Register Server"
              )}
            </button>
          </form>
        </div>

        {/* Footer redirection */}
        <div className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-primary hover:underline cursor-pointer"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
