import { Stack } from 'expo-router';

export default function DJLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="requests" />
      <Stack.Screen name="confirmed-gigs" />
      <Stack.Screen name="pending-requests" />
      <Stack.Screen name="my-venues" />
      <Stack.Screen name="venue-detail" />
      <Stack.Screen name="discovery" />
      <Stack.Screen name="artist-profile-view" />
      <Stack.Screen name="invoices" />
      <Stack.Screen name="invoice-gigs" />
      <Stack.Screen name="invoice-preview" />
      <Stack.Screen
        name="send-feedback"
        options={{
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
