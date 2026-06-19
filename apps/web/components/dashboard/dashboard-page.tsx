const rooms = [
    { name: 'Living Room', devices: 12, status: 'Synced' },
    { name: 'Bedroom', devices: 8, status: 'Stable' },
    { name: 'Kitchen', devices: 6, status: 'Energy saving' }
];

const devices = [
    { name: 'Hallway Light', state: 'On', integration: 'Zigbee' },
    { name: 'Thermostat', state: '21.5°C', integration: 'Matter' },
    { name: 'Air Purifier', state: 'Auto', integration: 'Tuya' }
];

export function DashboardPage() {
    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Domus dashboard</p>
                        <h2 className="mt-3 font-display text-4xl font-semibold text-balance sm:text-5xl">
                            A unified command center for your smart home.
                        </h2>
                        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                            Discover devices, orchestrate scenes, and monitor home health with live updates, fast controls, and a local-first architecture.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[28rem]">
                        {[
                            ['Active devices', '42'],
                            ['Automations', '18'],
                            ['Energy today', '12.8 kWh']
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-3xl border border-border bg-background/70 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                                <p className="mt-3 text-2xl font-semibold">{value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-border bg-card p-5 xl:col-span-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Recent events</p>
                            <h3 className="mt-2 text-xl font-semibold">Live activity stream</h3>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-500">Realtime</span>
                    </div>
                    <div className="mt-5 space-y-3">
                        {[
                            'Motion detected in hallway, automation triggered.',
                            'Outdoor lights turned on at sunset.',
                            'Bedroom climate switched to sleep mode.'
                        ].map((event) => (
                            <div key={event} className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                                {event}
                            </div>
                        ))}
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Quick controls</p>
                    <h3 className="mt-2 text-xl font-semibold">Home actions</h3>
                    <div className="mt-5 grid gap-3">
                        {['Away Mode', 'Movie Night', 'Sleep Mode'].map((action) => (
                            <button key={action} className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-left text-sm font-medium transition hover:bg-accent/60">
                                {action}
                            </button>
                        ))}
                    </div>
                </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Room overview</p>
                    <div className="mt-5 space-y-3">
                        {rooms.map((room) => (
                            <div key={room.name} className="flex items-center justify-between rounded-2xl border border-border bg-background/70 p-4">
                                <div>
                                    <p className="font-medium">{room.name}</p>
                                    <p className="text-sm text-muted-foreground">{room.devices} devices</p>
                                </div>
                                <span className="text-sm text-cyan-500">{room.status}</span>
                            </div>
                        ))}
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Device overview</p>
                    <div className="mt-5 space-y-3">
                        {devices.map((device) => (
                            <div key={device.name} className="rounded-2xl border border-border bg-background/70 p-4">
                                <div className="flex items-center justify-between">
                                    <p className="font-medium">{device.name}</p>
                                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{device.integration}</span>
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">State: {device.state}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}
const rooms = [
    { name: 'Living Room', devices: 12, status: 'Synced' },
    { name: 'Bedroom', devices: 8, status: 'Stable' },
    { name: 'Kitchen', devices: 6, status: 'Energy saving' }
];

const devices = [
    { name: 'Hallway Light', state: 'On', integration: 'Zigbee' },
    { name: 'Thermostat', state: '21.5°C', integration: 'Matter' },
    { name: 'Air Purifier', state: 'Auto', integration: 'Tuya' }
];

export function DashboardPage() {
    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Domus dashboard</p>
                        <h2 className="mt-3 font-display text-4xl font-semibold text-balance sm:text-5xl">
                            A unified command center for your smart home.
                        </h2>
                        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                            Discover devices, orchestrate scenes, and monitor home health with live updates, fast controls, and a local-first architecture.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[28rem]">
                        {[
                            ['Active devices', '42'],
                            ['Automations', '18'],
                            ['Energy today', '12.8 kWh']
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-3xl border border-border bg-background/70 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                                <p className="mt-3 text-2xl font-semibold">{value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-border bg-card p-5 xl:col-span-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Recent events</p>
                            <h3 className="mt-2 text-xl font-semibold">Live activity stream</h3>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-500">Realtime</span>
                    </div>
                    <div className="mt-5 space-y-3">
                        {[
                            'Motion detected in hallway, automation triggered.',
                            'Outdoor lights turned on at sunset.',
                            'Bedroom climate switched to sleep mode.'
                        ].map((event) => (
                            <div key={event} className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                                {event}
                            </div>
                        ))}
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Quick controls</p>
                    <h3 className="mt-2 text-xl font-semibold">Home actions</h3>
                    <div className="mt-5 grid gap-3">
                        {['Away Mode', 'Movie Night', 'Sleep Mode'].map((action) => (
                            <button key={action} className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-left text-sm font-medium transition hover:bg-accent/60">
                                {action}
                            </button>
                        ))}
                    </div>
                </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Room overview</p>
                    <div className="mt-5 space-y-3">
                        {rooms.map((room) => (
                            <div key={room.name} className="flex items-center justify-between rounded-2xl border border-border bg-background/70 p-4">
                                <div>
                                    <p className="font-medium">{room.name}</p>
                                    <p className="text-sm text-muted-foreground">{room.devices} devices</p>
                                </div>
                                <span className="text-sm text-cyan-500">{room.status}</span>
                            </div>
                        ))}
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Device overview</p>
                    <div className="mt-5 space-y-3">
                        {devices.map((device) => (
                            <div key={device.name} className="rounded-2xl border border-border bg-background/70 p-4">
                                <div className="flex items-center justify-between">
                                    <p className="font-medium">{device.name}</p>
                                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{device.integration}</span>
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">State: {device.state}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}
