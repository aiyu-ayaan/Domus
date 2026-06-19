const devices = [
    { name: 'Hallway Light', integration: 'Zigbee', status: 'Online' },
    { name: 'Garden Plug', integration: 'Tapo', status: 'Online' },
    { name: 'Kitchen Sensor', integration: 'Xiaomi', status: 'Offline' }
];

export default function DevicesPage() {
    return (
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Devices</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Device management</h2>
            <div className="mt-6 grid gap-3">
                {devices.map((device) => (
                    <div key={device.name} className="flex items-center justify-between rounded-2xl border border-border bg-background/70 p-4">
                        <div>
                            <p className="font-medium">{device.name}</p>
                            <p className="text-sm text-muted-foreground">{device.integration}</p>
                        </div>
                        <span className="text-sm text-muted-foreground">{device.status}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
