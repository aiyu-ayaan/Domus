import { Button } from '@/components/ui/button';

export default function RegisterPage() {
    return (
        <div className="mx-auto max-w-xl rounded-[2rem] border border-border bg-card p-6 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Create account</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Start your Domus home</h2>
            <p className="mt-2 text-sm text-muted-foreground">Register the first administrator for your local-first smart home platform.</p>
            <form className="mt-6 grid gap-4">
                <input className="rounded-2xl border border-border bg-background/70 px-4 py-3" placeholder="Email address" />
                <input className="rounded-2xl border border-border bg-background/70 px-4 py-3" placeholder="Password" type="password" />
                <input className="rounded-2xl border border-border bg-background/70 px-4 py-3" placeholder="Confirm password" type="password" />
                <Button type="submit">Create account</Button>
            </form>
        </div>
    );
}
