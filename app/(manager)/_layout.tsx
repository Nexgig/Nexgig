import { Stack } from 'expo-router';

export default function ManagerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="venue-detail" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="assign-artist" />
      <Stack.Screen name="create-venue" />
      <Stack.Screen name="invite-artist" />
      <Stack.Screen name="artist-profile-view" />
      <Stack.Screen name="artist-bookings" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="pending-requests" />
      <Stack.Screen name="confirmed-bookings" />
      <Stack.Screen name="my-venues" />
      <Stack.Screen name="artists" />
      <Stack.Screen name="completed-gigs" />
      <Stack.Screen name="discovery" />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="edit-venue" options={{ gestureEnabled: false }} />
      <Stack.Screen name="manager-artist-invoices" />
      <Stack.Screen name="manager-invoice-detail" />
      <Stack.Screen name="settings" />
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
