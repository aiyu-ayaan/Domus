const automations = [
    'Motion detected -> Hallway light on',
    'Sunset -> Outdoor lights on',
    'Device offline -> Send notification'
];

export default function AutomationsPage() {
    return (
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Automations</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">IF / THEN rules</h2>
            <div className="mt-6 grid gap-3">
                {automations.map((automation) => (
                    <div key={automation} className="rounded-2xl border border-border bg-background/70 p-4">
                        {automation}
                    </div>
                ))}
            </div>
        </section>
    );
}
