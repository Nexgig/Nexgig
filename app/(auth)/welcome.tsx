import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { OAuthButtons } from '@/components/oauth-buttons';
import { useColors } from '@/hooks/use-colors';

export default function WelcomeScreen() {
  const router = useRouter();
  const colors = useColors();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2563EB' }]}>
      <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.container}>
          {/* Logo */}
          <View style={styles.logoSection}>
            <Image
              source={require('@/assets/images/nexgig-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Every booking, verified.</Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(auth)/sign-in' as Href)}
            >
              <Text style={styles.primaryBtnText}>Sign In</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(auth)/manager-register' as Href)}
            >
              <Text style={styles.secondaryBtnText}>Register as Manager</Text>
            </Pressable>

            <Pressable
  style={({ pressed }) => [styles.secondaryBtn, { borderColor: 'rgba(255,255,255,0.5)' }, pressed && { opacity: 0.85 }]}
  onPress={() => router.push('/(auth)/artist-setup' as Href)}
>
  <Text style={styles.secondaryBtnText}>Join as Artist</Text>
</Pressable>

            <OAuthButtons variant="onDark" />
          </View>
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  logoSection: {
    alignItems: 'center',
    gap: 16,
    marginTop: 40,
  },
  logo: {
    width: 220,
    height: 220,
    borderRadius: 24,
  },
  tagline: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '500',
    opacity: 0.85,
  },
  actionsSection: {
    gap: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
