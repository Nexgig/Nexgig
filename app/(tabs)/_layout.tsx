import { Slot } from "expo-router";

// This group is purely the launch-time redirect gate (its only child, index.tsx,
// decides where to send the user). It used to be a Tabs navigator, which rendered
// a visible "Home" tab bar for a frame on every cold start before the redirect
// fired. A plain Slot renders the child with no navigator chrome — nothing to
// flash. Works identically on iOS and Android.
export default function TabLayout() {
  return <Slot />;
}
