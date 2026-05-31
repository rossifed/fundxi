// Deep link target: fundxi://join/CODE — replaces the web `?join=CODE` param.
// Redirects into the Leagues tab with the code so its Join view opens prefilled.

import { Redirect, useLocalSearchParams } from "expo-router";

export default function JoinDeepLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={`/leagues?join=${encodeURIComponent(code ?? "")}`} />;
}
