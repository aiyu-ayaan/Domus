import SceneBuilderView from "./scene-builder-view";

// Server wrapper so this dynamic route can be statically exported for the
// native (Capacitor) build. See devices/[id]/page.tsx for the rationale —
// no prerendered instances; the client view resolves the id at runtime.
// One throwaway path so output:export is satisfied; real scene ids (and the
// "new" route) are resolved client-side at runtime.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <SceneBuilderView />;
}
