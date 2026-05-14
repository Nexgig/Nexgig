import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { MOCK_VENUES } from '@/lib/mock-data';

export default function DJInviteScreen() {
  const router = useRouter();
  const colors = useColors();
  const venue = MOCK_VENUES[0]; // In real app, from token params

  const handleAccept = () => {
    router.push('/(auth)/artist-setup' as Href);
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => router.replace('/(auth)/welcome' as Href) },
      ]
    );
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="mail" size={48} color={colors.primary} style={styles.mailIcon} />
          <Text style={[styles.title, { color: colors.foreground }]}>You're Invited!</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            You've been invited to join a venue lineup on Nexgig
          </Text>
        </View>

        {/* Venue Card */}
        <View style={[styles.venueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.venueHeader}>
            <View style={[styles.venueBadge, { backgroundColor: colors.navy }]}>
              <MaterialIcons name="location-on" size={20} color="#fff" />
            </View>
            <View style={styles.venueInfo}>
              <Text style={[styles.venueName, { color: colors.foreground }]}>{venue.name}</Text>
              <Text style={[styles.venueType, { color: colors.muted }]}>{venue.venueType} · {venue.googleMapsLocation?.address}</Text>
            </View>
          </View>

          {venue.vibeDescription && (
            <View style={[styles.vibeSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.vibeLabel, { color: colors.muted }]}>Vibe</Text>
              <Text style={[styles.vibeText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
            </View>
          )}

          <View style={[styles.energySection, { borderTopColor: colors.border }]}>
            <Text style={[styles.vibeLabel, { color: colors.muted }]}>Preferred Energy</Text>
            <View style={styles.chips}>
              {venue.preferredEnergy.map((e) => (
                <View key={e} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.chipText, { color: colors.foreground }]}>{e}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Rules */}
        {venue.rulesTemplate && (
          <View style={[styles.rulesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rulesHeader}>
              <MaterialIcons name="gavel" size={18} color={colors.primary} />
              <Text style={[styles.rulesTitle, { color: colors.foreground }]}>Venue Rules</Text>
            </View>
            <Text style={[styles.rulesText, { color: colors.muted }]}>{venue.rulesTemplate}</Text>
            <Text style={[styles.rulesNote, { color: colors.muted }]}>
              By accepting, you agree to these rules.
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.acceptBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleAccept}
          >
            <MaterialIcons name="check" size={20} color="#000" />
            <Text style={styles.acceptBtnText}>Accept & Create Profile</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.declineBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            onPress={handleDecline}
          >
            <Text style={[styles.declineBtnText, { color: colors.muted }]}>Decline Invitation</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 28 },
  mailIcon: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  venueCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  venueHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  venueBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  venueInfo: { flex: 1 },
  venueName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  venueType: { fontSize: 13 },
  vibeSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  vibeLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  vibeText: { fontSize: 14, lineHeight: 20 },
  energySection: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '500' },
  rulesCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 24 },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rulesTitle: { fontSize: 15, fontWeight: '700' },
  rulesText: { fontSize: 14, lineHeight: 21, marginBottom: 10 },
  rulesNote: { fontSize: 12, fontStyle: 'italic' },
  actions: { gap: 12 },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  declineBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  declineBtnText: { fontSize: 15, fontWeight: '500' },
});
