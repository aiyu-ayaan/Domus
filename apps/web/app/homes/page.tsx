// Homes workspace management page implementation
'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useHomeStore } from '@/stores/home-store';
import { PageHeader } from '@/components/shared/page-header';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Home, Plus, Edit2, Trash2, Calendar, MapPin, CheckCircle2 } from 'lucide-react';

const homeSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().optional(),
    timezone: z.string().min(1, 'Please select a timezone'),
});

type HomeFormValues = z.infer<typeof homeSchema>;

export default function HomesPage() {
    const { homes, activeHomeId, createHome, updateHome, deleteHome, setActiveHomeId } = useHomeStore();
    const [editingHomeId, setEditingHomeId] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors },
    } = useForm<HomeFormValues>({
        resolver: zodResolver(homeSchema),
        defaultValues: { name: '', description: '', timezone: 'Europe/Berlin' },
    });

    const handleCreateSubmit = async (data: HomeFormValues) => {
        try {
            await createHome({
                name: data.name,
                description: data.description || null,
                timezone: data.timezone,
            });
            toast.success('Home created successfully!');
            setIsCreateOpen(false);
            reset();
        } catch (err: any) {
            toast.error(err?.error?.message || 'Failed to create home');
        }
    };

    const handleEditClick = (home: any) => {
        setEditingHomeId(home.id);
        setValue('name', home.name);
        setValue('description', home.description || '');
        setValue('timezone', home.timezone);
        setIsEditOpen(true);
    };

    const handleEditSubmit = async (data: HomeFormValues) => {
        if (!editingHomeId) return;
        try {
            await updateHome(editingHomeId, {
                name: data.name,
                description: data.description || null,
                timezone: data.timezone,
            });
            toast.success('Home updated successfully!');
            setIsEditOpen(false);
            setEditingHomeId(null);
            reset();
        } catch (err: any) {
            toast.error(err?.error?.message || 'Failed to update home');
        }
    };

    const handleDeleteClick = async (id: string, name: string) => {
        if (homes.length === 1) {
            toast.error('Cannot delete the only remaining home workspace.');
            return;
        }
        if (confirm(`Are you sure you want to delete the home "${name}"? This deletes all associated rooms, integrations, and devices.`)) {
            try {
                await deleteHome(id);
                toast.success(`Deleted ${name}`);
            } catch (err: any) {
                toast.error(err?.error?.message || 'Failed to delete home');
            }
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Homes Switcher" description="Create and switch between home workspaces.">
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <button
                            onClick={() => reset({ name: '', description: '', timezone: 'Europe/Berlin' })}
                            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Add Home</span>
                        </button>
                    </DialogTrigger>
                    <DialogContent title="Create New Home" description="Configure parameters for your new smart home workspace.">
                        <form onSubmit={handleSubmit(handleCreateSubmit)} className="space-y-4 mt-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Home Name</label>
                                <input
                                    type="text"
                                    placeholder="Main House"
                                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-xs text-rose-500 font-semibold">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                                <input
                                    type="text"
                                    placeholder="Primary residence in Berlin"
                                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                    {...register('description')}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Timezone</label>
                                <select
                                    className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                    {...register('timezone')}
                                >
                                    <option value="Europe/Berlin">Europe/Berlin (GMT+1)</option>
                                    <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
                                    <option value="America/New_York">America/New_York (EST)</option>
                                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-2 text-sm transition cursor-pointer"
                            >
                                Create Workspace
                            </button>
                        </form>
                    </DialogContent>
                </Dialog>
            </PageHeader>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {homes.map((home) => {
                    const isActive = home.id === activeHomeId;
                    return (
                        <div
                            key={home.id}
                            className={`rounded-3xl border p-5 backdrop-blur-sm relative flex flex-col justify-between h-48 transition hover:bg-card/30 ${
                                isActive ? 'border-primary/45 bg-primary/5 shadow-glow' : 'border-border/60 bg-card/25'
                            }`}
                        >
                            <div>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`rounded-xl border p-2 bg-background/80 ${isActive ? 'text-primary border-primary/20' : 'text-foreground/60 border-border/80'}`}>
                                            <Home className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-base">{home.name}</h3>
                                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{home.description || 'No description provided'}</p>
                                        </div>
                                    </div>
                                    {isActive && (
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider border border-primary/20 bg-primary/10 px-2 py-0.5 rounded-lg">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Active
                                        </span>
                                    )}
                                </div>

                                <div className="grid gap-1.5 text-xs text-muted-foreground mt-4">
                                    <p className="flex items-center gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" />
                                        <span>Timezone: {home.timezone}</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                                        <span>Registered: {new Date(home.created_at).toLocaleDateString()}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-border/40 pt-3 mt-4">
                                <button
                                    onClick={() => setActiveHomeId(home.id)}
                                    disabled={isActive}
                                    className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition cursor-pointer ${
                                        isActive
                                            ? 'text-muted-foreground bg-muted/40 cursor-not-allowed'
                                            : 'text-primary hover:bg-primary/10 bg-primary/5'
                                    }`}
                                >
                                    Activate Workspace
                                </button>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => handleEditClick(home)}
                                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
                                        title="Edit Home"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClick(home.id, home.name)}
                                        className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                                        title="Delete Home"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Edit Home Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent title="Edit Home Workspace" description="Update parameters for this smart home workspace.">
                    <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-4 mt-2">
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Home Name</label>
                            <input
                                type="text"
                                className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                {...register('name')}
                            />
                            {errors.name && <p className="text-xs text-rose-500 font-semibold">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                            <input
                                type="text"
                                className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                {...register('description')}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Timezone</label>
                            <select
                                className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                {...register('timezone')}
                            >
                                <option value="Europe/Berlin">Europe/Berlin (GMT+1)</option>
                                <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-2 text-sm transition cursor-pointer"
                        >
                            Save Changes
                        </button>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
