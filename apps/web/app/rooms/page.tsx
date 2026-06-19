// Rooms dashboard page implementation
'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useHomeStore } from '@/stores/home-store';
import { useRoomStore } from '@/stores/room-store';
import { useDeviceStore } from '@/stores/device-store';
import { PageHeader } from '@/components/shared/page-header';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import {
    FolderKanban,
    Plus,
    Edit2,
    Trash2,
    Sofa,
    Bed,
    Refrigerator,
    Laptop,
    Car,
    Bath,
    Tv,
    Lightbulb,
} from 'lucide-react';

const roomSchema = z.object({
    name: z.string().min(2, 'Room name must be at least 2 characters'),
    icon: z.string().min(1, 'Please select an icon'),
});

type RoomFormValues = z.infer<typeof roomSchema>;

const iconMap: Record<string, any> = {
    sofa: Sofa,
    bed: Bed,
    refrigerator: Refrigerator,
    laptop: Laptop,
    car: Car,
    bath: Bath,
    tv: Tv,
    lightbulb: Lightbulb,
};

const iconOptions = [
    { value: 'sofa', label: 'Living Room', icon: Sofa },
    { value: 'bed', label: 'Bedroom', icon: Bed },
    { value: 'refrigerator', label: 'Kitchen', icon: Refrigerator },
    { value: 'laptop', label: 'Office', icon: Laptop },
    { value: 'car', label: 'Garage', icon: Car },
    { value: 'bath', label: 'Bathroom', icon: Bath },
    { value: 'tv', label: 'Media Room', icon: Tv },
    { value: 'lightbulb', label: 'Utility', icon: Lightbulb },
];

export default function RoomsPage() {
    const { activeHomeId } = useHomeStore();
    const { rooms, createRoom, updateRoom, deleteRoom } = useRoomStore();
    const { devices } = useDeviceStore();

    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<RoomFormValues>({
        resolver: zodResolver(roomSchema),
        defaultValues: { name: '', icon: 'sofa' },
    });

    const selectedIcon = watch('icon');

    const handleCreateSubmit = async (data: RoomFormValues) => {
        if (!activeHomeId) return;
        try {
            await createRoom({
                home_id: activeHomeId,
                name: data.name,
                icon: data.icon,
            });
            toast.success('Room created successfully!');
            setIsCreateOpen(false);
            reset();
        } catch (err: any) {
            toast.error(err?.error?.message || 'Failed to create room');
        }
    };

    const handleEditClick = (room: any) => {
        setEditingRoomId(room.id);
        setValue('name', room.name);
        setValue('icon', room.icon);
        setIsEditOpen(true);
    };

    const handleEditSubmit = async (data: RoomFormValues) => {
        if (!editingRoomId) return;
        try {
            await updateRoom(editingRoomId, {
                name: data.name,
                icon: data.icon,
            });
            toast.success('Room updated successfully!');
            setIsEditOpen(false);
            setEditingRoomId(null);
            reset();
        } catch (err: any) {
            toast.error(err?.error?.message || 'Failed to update room');
        }
    };

    const handleDeleteClick = async (id: string, name: string) => {
        if (confirm(`Are you sure you want to delete "${name}"? Devices inside this room will become unassigned.`)) {
            try {
                await deleteRoom(id);
                toast.success(`Room "${name}" deleted.`);
            } catch (err: any) {
                toast.error(err?.error?.message || 'Failed to delete room');
            }
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Rooms" description="Manage physical partitions and group smart accessories.">
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <button
                            onClick={() => reset({ name: '', icon: 'sofa' })}
                            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Add Room</span>
                        </button>
                    </DialogTrigger>
                    <DialogContent title="Create New Room" description="Group devices under a physical room in your home.">
                        <form onSubmit={handleSubmit(handleCreateSubmit)} className="space-y-4 mt-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Room Name</label>
                                <input
                                    type="text"
                                    placeholder="Living Room"
                                    className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-xs text-rose-500 font-semibold">{errors.name.message}</p>}
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Icon Symbol</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {iconOptions.map((opt) => {
                                        const Icon = opt.icon;
                                        const isSelected = selectedIcon === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setValue('icon', opt.value)}
                                                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition cursor-pointer ${
                                                    isSelected
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-border bg-background/40 text-muted-foreground hover:bg-accent/40'
                                                }`}
                                            >
                                                <Icon className="h-5 w-5 mb-1" />
                                                <span className="text-[10px] truncate max-w-[64px]">{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-2 text-sm transition cursor-pointer"
                            >
                                Create Room
                            </button>
                        </form>
                    </DialogContent>
                </Dialog>
            </PageHeader>

            {rooms.length === 0 ? (
                <EmptyState
                    title="No Rooms Added"
                    description="Get started by creating rooms like Living Room, Kitchen, or Bedroom."
                    icon={FolderKanban}
                    actionLabel="Create Room"
                    onAction={() => setIsCreateOpen(true)}
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {rooms.map((room) => {
                        const RoomIcon = iconMap[room.icon] || FolderKanban;
                        const roomDevices = devices.filter((d) => d.room_id === room.id);
                        const devCount = roomDevices.length;
                        const onlineDevCount = roomDevices.filter((d) => d.online).length;

                        return (
                            <div
                                key={room.id}
                                className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm flex flex-col justify-between h-44 transition hover:bg-card/30"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-xl border border-border/80 p-2.5 bg-background/80 text-primary">
                                            <RoomIcon className="h-5.5 w-5.5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-base">{room.name}</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {devCount} {devCount === 1 ? 'device' : 'devices'} configured
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEditClick(room)}
                                            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
                                            title="Edit Room"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(room.id, room.name)}
                                            className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                                            title="Delete Room"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="border-t border-border/40 pt-3 flex items-center justify-between text-xs text-muted-foreground mt-4">
                                    <span className="flex items-center gap-1.5">
                                        <span className={`h-2 w-2 rounded-full ${onlineDevCount > 0 ? 'bg-cyan-500 animate-pulse' : 'bg-muted-foreground'}`} />
                                        <span>{onlineDevCount} Online</span>
                                    </span>
                                    
                                    <Link
                                        href={`/devices?room=${room.id}`}
                                        className="text-primary hover:underline cursor-pointer font-semibold"
                                    >
                                        Manage Devices
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Edit Room Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent title="Edit Room Details" description="Modify details for this room partition.">
                    <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-4 mt-2">
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Room Name</label>
                            <input
                                type="text"
                                className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                                {...register('name')}
                            />
                            {errors.name && <p className="text-xs text-rose-500 font-semibold">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Icon Symbol</label>
                            <div className="grid grid-cols-4 gap-2">
                                {iconOptions.map((opt) => {
                                    const Icon = opt.icon;
                                    const isSelected = selectedIcon === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setValue('icon', opt.value)}
                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition cursor-pointer ${
                                                isSelected
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border bg-background/40 text-muted-foreground hover:bg-accent/40'
                                            }`}
                                        >
                                            <Icon className="h-5 w-5 mb-1" />
                                            <span className="text-[10px] truncate max-w-[64px]">{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
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
