const scenes = ['Movie Night', 'Away Mode', 'Sleep Mode', 'Morning Routine'];

export default function ScenesPage() {
    return (
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Scenes</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Scene library</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {scenes.map((scene) => (
                    <div key={scene} className="rounded-2xl border border-border bg-background/70 p-4">
                        {scene}
                    </div>
                ))}
            </div>
        </section>
    );
}
