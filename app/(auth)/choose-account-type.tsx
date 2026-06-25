import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

// Shown to brand-new OAuth users (Apple/Google) who don't yet have a
// manager or artist profile. They pick a role, then continue into the
// matching registration wizard in OAuth mode (name/email pre-filled, no password).
export default function ChooseAccountTypeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { name, email, oauth } = useLocalSearchParams<{ name?: string; email?: string; oauth?: string }>();

  const go = (type: 'manager' | 'artist') => {
    const route = type === 'manager' ? '/(auth)/manager-register' : '/(auth)/artist-setup';
    const params = new URLSearchParams();
    // Only carry oauth mode when arriving from an Apple/Google sign-in. New
    // email/password signups omit it so the wizard collects email + password.
    if (oauth === '1') params.set('oauth', '1');
    if (name) params.set('name', name);
    if (email) params.set('email', email);
    router.push(`${route}?${params.toString()}` as Href);
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>One last step</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {name ? `Welcome, ${name}! ` : ''}How will you use Nexgig?
          </Text>
        </View>

        <View style={styles.options}>
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => go('manager')}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
              <MaterialIcons name="business-center" size={28} color={colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>I&apos;m a Manager</Text>
              <Text style={[styles.cardDesc, { color: colors.muted }]}>I book artists for my venues</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => go('artist')}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
              <MaterialIcons name="headset" size={28} color={colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>I&apos;m an Artist</Text>
              <Text style={[styles.cardDesc, { color: colors.muted }]}>I perform at venues and events</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 60, justifyContent: 'flex-start' },
  header: { marginBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  options: { gap: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderRadius: 16, padding: 18 },
  iconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardDesc: { fontSize: 13, lineHeight: 18 },
});
