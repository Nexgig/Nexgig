import { Redirect } from 'expo-router';

// The "Requests" tab is an ACTION, not a screen: its tab button opens the calendar's send sheet
// and never navigates here. This placeholder only exists so the Tabs.Screen has a route; if it's
// ever reached directly (deep link, etc.) it bounces to the calendar.
export default function SendPlaceholder() {
  return <Redirect href="/(manager)/(tabs)/calendar" />;
}
