import { Suspense } from "react";
import DeviceDetailView from "./device-detail-view";

export default function Page() {
  return (
    <Suspense>
      <DeviceDetailView />
    </Suspense>
  );
}
