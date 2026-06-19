const rooms = ['Living Room', 'Bedroom', 'Kitchen', 'Garage'];

export default function RoomsPage() {
    return (
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Rooms</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Room overview</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {rooms.map((room) => (
                    <div key={room} className="rounded-2xl border border-border bg-background/70 p-4">
                        {room}
                    </div>
                ))}
            </div>
        </section>
    );
}
