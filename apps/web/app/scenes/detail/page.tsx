import { Suspense } from "react";
import SceneBuilderView from "./scene-builder-view";

export default function Page() {
  return (
    <Suspense>
      <SceneBuilderView />
    </Suspense>
  );
}
