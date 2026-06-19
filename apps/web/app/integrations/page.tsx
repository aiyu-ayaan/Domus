const integrations = ['Tapo', 'Xiaomi', 'Tuya', 'MQTT', 'Matter', 'Zigbee'];

export default function IntegrationsPage() {
    return (
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Integrations</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Adapter management</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {integrations.map((integration) => (
                    <div key={integration} className="rounded-2xl border border-border bg-background/70 p-4">
                        {integration}
                    </div>
                ))}
            </div>
        </section>
    );
}
