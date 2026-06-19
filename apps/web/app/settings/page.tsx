// Settings page implementation with profile, appearance, and security forms
"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuthStore } from "@/stores/auth-store";
import { useHomeStore } from "@/stores/home-store";
import { useTheme } from "next-themes";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authRepository } from "@/repositories";
import { toast } from "sonner";
import {
  User,
  Sun,
  Moon,
  Laptop,
  ShieldAlert,
  Home,
  Check,
  Lock,
  KeyRound,
} from "lucide-react";

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  avatarUrl: z.string().url("Please enter a valid image URL").or(z.literal("")),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user, updateProfile } = useAuthStore();
  const { homes } = useHomeStore();
  const { theme, setTheme } = useTheme();

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Profile Form
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.full_name || "",
      avatarUrl: user?.avatar_url || "",
    },
  });

  // Password Form
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onProfileSubmit = async (data: ProfileFormValues) => {
    setIsSavingProfile(true);
    try {
      await updateProfile({
        full_name: data.fullName,
        avatar_url: data.avatarUrl || null,
      });
      toast.success("Profile updated successfully!");
    } catch {
      toast.error("Failed to update profile settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormValues) => {
    setIsSavingPassword(true);
    try {
      await authRepository.changePassword({
        current_password: data.currentPassword,
        new_password: data.newPassword,
      });
      toast.success("Password changed successfully!");
      resetPassword();
    } catch (err: any) {
      toast.error(err?.error?.message || "Current password check failed.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure profile parameters, appearance modes, and security."
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Sun className="h-4 w-4 mr-2" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="homes">
            <Home className="h-4 w-4 mr-2" />
            Workspaces
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* PROFILE SETTINGS */}
        <TabsContent value="profile">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 max-w-xl backdrop-blur-sm space-y-5">
            <div>
              <h3 className="font-semibold text-base">Profile Parameters</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Manage details linked to your account.
              </p>
            </div>

            <form
              onSubmit={handleProfileSubmit(onProfileSubmit)}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Full Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...registerProfile("fullName")}
                />
                {profileErrors.fullName && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {profileErrors.fullName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Avatar Image URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...registerProfile("avatarUrl")}
                />
                {profileErrors.avatarUrl && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {profileErrors.avatarUrl.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {isSavingProfile ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>Save Profile Details</span>
              </button>
            </form>
          </div>
        </TabsContent>

        {/* APPEARANCE SETTINGS */}
        <TabsContent value="appearance">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 max-w-xl backdrop-blur-sm space-y-5">
            <div>
              <h3 className="font-semibold text-base">Appearance Mode</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Select theme styles for the Domus OS interface.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "light", label: "Light Theme", icon: Sun },
                { value: "dark", label: "Dark Theme (OLED)", icon: Moon },
                { value: "system", label: "System Default", icon: Laptop },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <Icon className="h-5 w-5 mb-2" />
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* HOMES OVERVIEW */}
        <TabsContent value="homes">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 max-w-xl backdrop-blur-sm space-y-4">
            <div>
              <h3 className="font-semibold text-base">Workspaces Summary</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Homes managed under this account scope.
              </p>
            </div>
            <div className="space-y-2.5">
              {homes.map((home) => (
                <div
                  key={home.id}
                  className="flex justify-between items-center rounded-xl border border-border/50 bg-background/30 p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Home className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-semibold">{home.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {home.timezone}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md border border-border bg-background/80 px-2 py-0.5 font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
                    {home.owner_id === user?.id ? "Owner" : "Member"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* SECURITY SETTINGS */}
        <TabsContent value="security">
          <div className="rounded-3xl border border-border/60 bg-card/25 p-5 max-w-xl backdrop-blur-sm space-y-5">
            <div>
              <h3 className="font-semibold text-base">Change Password</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Update login password credentials.
              </p>
            </div>

            <form
              onSubmit={handlePasswordSubmit(onPasswordSubmit)}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Current Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 h-4.5 w-4.5 text-muted-foreground/60" />
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-11 pr-4 text-sm outline-none focus:border-primary"
                    {...registerPassword("currentPassword")}
                  />
                </div>
                {passwordErrors.currentPassword && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {passwordErrors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    New Password
                  </label>
                  <input
                    type="password"
                    placeholder="Min 8 chars"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                    {...registerPassword("newPassword")}
                  />
                  {passwordErrors.newPassword && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {passwordErrors.newPassword.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                    {...registerPassword("confirmPassword")}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {passwordErrors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 flex items-start gap-2.5">
                <ShieldAlert className="h-4.5 w-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Saving a new password invalidates all other active session
                  refresh tokens. You will need to log in again on other
                  devices.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSavingPassword}
                className="rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {isSavingPassword ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>Change Password</span>
              </button>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
