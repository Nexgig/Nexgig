import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';

type InviteData = {
  id: string;
  manager_id: string;
  artist_email: string;
  status: string;
  manager: {
    full_name: string;
    email: string;
  } | null;
  venues: {
    id: string;
    name: string;
    venue_type: string;
    address: string;
  }[];
};

export default function ArtistInviteScreen() {
  const router = useRouter();
  const colors = useColors();
  const { invite_id } = useLocalSearchParams<{ invite_id: string }>();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!invite_id) {
      setIsLoading(false);
      return;
    }
    fetchInvite();
  }, [invite_id]);

  const fetchInvite = async () => {
    setIsLoading(true);

    // Fetch invite
    const { data: inviteData, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('id', invite_id)
      .single();

    if (inviteError || !inviteData) {
      setIsLoading(false);
      Alert.alert('Invalid Invite', 'This invite link is invalid or has expired.');
      return;
    }

    // Fetch manager profile
    const { data: managerData } = await supabase
      .from('managers')
      .select('full_name, email')
      .eq('id', inviteData.manager_id)
      .single();

    // Fetch assigned venues
    const { data: inviteVenues } = await supabase
      .from('invite_venues')
      .select('venue_id')
      .eq('invite_id', invite_id);

    let venues: InviteData['venues'] = [];
    if (inviteVenues && inviteVenues.length > 0) {
      const venueIds = inviteVenues.map((iv) => iv.venue_id);
      const { data: venuesData } = await supabase
        .from('venues')
        .select('id, name, venue_type, address')
        .in('id', venueIds);
      venues = venuesData ?? [];
    }

    setInvite({
      ...inviteData,
      manager: managerData ?? null,
      venues,
    });
    setIsLoading(false);
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    // Update invite status to accepted
    await supabase
      .from('invites')
      .update({ status: 'accepted' })
      .eq('id', invite_id);
    setIsAccepting(false);
    router.push('/(auth)/artist-setup' as Href);
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive', onPress: async () => {
            await supabase
              .from('invites')
              .update({ status: 'declined' })
              .eq('id', invite_id);
            router.replace('/(auth)/welcome' as Href);
          }
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading invite...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!invite) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={48} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>Invalid or expired invite</Text>
          <Pressable onPress={() => router.replace('/(auth)/welcome' as Href)} style={[styles.backHomeBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.backHomeBtnText}>Go to Home</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="mail" size={48} color={colors.primary} style={styles.mailIcon} />
          <Text style={[styles.title, { color: colors.foreground }]}>You're Invited!</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {invite.manager?.full_name ?? 'A manager'} has invited you to join their artist lineup on Nexgig
          </Text>
        </View>

        {/* Venues */}
        {invite.venues.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Assigned Venue{invite.venues.length > 1 ? 's' : ''}
            </Text>
            {invite.venues.map((v) => (
              <View key={v.id} style={[styles.venueRow, { borderTopColor: colors.border }]}>
                <View style={[styles.venueBadge, { backgroundColor: colors.primary + '20' }]}>
                  <MaterialIcons name="location-on" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.venueName, { color: colors.foreground }]}>{v.name}</Text>
                  <Text style={[styles.venueType, { color: colors.muted }]}>
                    {v.venue_type}{v.address ? ` · ${v.address}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>About Nexgig</Text>
          <Text style={[styles.cardBody, { color: colors.muted }]}>
            Nexgig is a booking platform connecting DJs and artists with top venues. By accepting, you'll create your artist profile and join {invite.manager?.full_name ?? 'this manager'}'s lineup.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.acceptBtn, { opacity: pressed || isAccepting ? 0.85 : 1 }]}
            onPress={handleAccept}
            disabled={isAccepting}
          >
            <MaterialIcons name="check" size={20} color="#000" />
            <Text style={styles.acceptBtnText}>
              {isAccepting ? 'Accepting...' : 'Accept & Create Profile'}
            </Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  loadingText: { fontSize: 15, marginTop: 8 },
  errorText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  backHomeBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  backHomeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 28 },
  mailIcon: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  cardBody: { fontSize: 14, lineHeight: 21 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, marginTop: 8, borderTopWidth: 1 },
  venueBadge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  venueName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  venueType: { fontSize: 13 },
  actions: { gap: 12, marginTop: 8 },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  declineBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  declineBtnText: { fontSize: 15, fontWeight: '500' },
});