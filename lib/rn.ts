/**
 * Re-export of react-native with our custom <Text> swapped in.
 *
 * App/component files import from '@/lib/rn' instead of 'react-native' so that
 * every <Text> automatically uses General Sans / Clash Display. Everything else
 * (View, Pressable, StyleSheet, Image, etc.) passes straight through unchanged.
 */
export * from 'react-native';
export { Text } from '@/components/ui/app-text';
