import DeviceDetailView from "./device-detail-view";

// Server wrapper so this dynamic route can be statically exported for the
// native (Capacitor) build. We emit no prerendered instances — the client view
// reads the id from the URL at runtime, and Capacitor always boots from
// index.html then routes client-side, so deep IDs resolve fine.
// In the Node/dev build this stays an on-demand dynamic route (default
// dynamicParams); under output:export it emits zero instances and the client
// resolves the id at runtime.
// One throwaway path so output:export is satisfied; real device ids are
// resolved client-side at runtime (Capacitor boots index.html then routes).
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <DeviceDetailView />;
}
