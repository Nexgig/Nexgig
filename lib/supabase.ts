import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jgzuzkwzoceuzytwadvc.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnenV6a3d6b2NldXp5dHdhZHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTA3OTksImV4cCI6MjA5NDE2Njc5OX0.OVzepl6LdMVyNsZJiXlR33eayu5S_JF0zFFPw3b3SK0';

const CHUNK_SIZE = 1800; // safely under the 2048 byte SecureStore limit

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const total = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!total) return SecureStore.getItemAsync(key); // fallback for existing single-chunk values
    const count = parseInt(total, 10);
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      // Small enough — store directly and clear any old chunks
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}_chunks`);
      return;
    }
    // Split into chunks
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]);
    }
    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length));
    await SecureStore.deleteItemAsync(key); // remove any old single-chunk value
  },
  removeItem: async (key: string): Promise<void> => {
    const total = await SecureStore.getItemAsync(`${key}_chunks`);
    if (total) {
      const count = parseInt(total, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS !== 'web' ? ExpoSecureStoreAdapter : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});