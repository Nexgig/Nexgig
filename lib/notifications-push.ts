import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Show alerts/banners even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ask for permission, obtain the Expo push token, and store it on the user's row.
 * Safe to call on every sign-in. No-ops on simulators/web (push needs a real device).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    // Push only works on physical devices.
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device — skipping.');
      return null;
    }

    // Android needs a notification channel.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });
    }

    // Request permission if not already granted.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted.');
      return null;
    }

    // Get the Expo push token (needs the EAS projectId).
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.log('No EAS projectId found — cannot get push token.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save the token to the user's row (used server-side to target pushes).
    const { error } = await supabase
      .from('users')
      .update({ push_token: token })
      .eq('id', userId);
    if (error) console.log('Failed to save push token:', error.message);

    return token;
  } catch (e) {
    console.log('registerForPushNotifications error:', e);
    return null;
  }
}

/**
 * Clear the stored push token (call on sign-out so the device stops receiving
 * pushes for the previous user).
 */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase.from('users').update({ push_token: null }).eq('id', userId);
  } catch (e) {
    console.log('clearPushToken error:', e);
  }
}
