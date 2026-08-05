import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useVenueStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/send-email';
import { firstName } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteArtists() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const managerVenues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  const [email, setEmail] = useState('');
  // Default: every venue ticked (matches the "add from profile" all-venues behavior).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(managerVenues.map((v) => v.id)));
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleSend = async () => {
    if (submitting || !currentUser) return;
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { Alert.alert('Invalid email', 'Please enter a valid email address.'); return; }
    setSubmitting(true);

    // Look up an EXISTING artist account by email.
    const { data: artist, error } = await supabase
      .from('artists')
      .select('id, full_name, profile_photo_url, avatar_id')
      .ilike('email', e)
      .maybeSingle();
    if (error) { setSubmitting(false); Alert.alert('Error', error.message); return; }
    if (!artist) {
      setSubmitting(false);
      Alert.alert('No artist account', `No artist uses ${e} yet. They need to sign up for Nexgig first, then you can add them.`);
      return;
    }

    const artistId = artist.id as string;
    const venueIds = [...selected];
    const now = new Date().toISOString();

    // 1. Roster (prerequisite — block on error).
    const { error: glErr } = await supabase.from('global_lineup').upsert(
      { manager_id: currentUser.id, artist_id: artistId, status: 'active' },
      { onConflict: 'manager_id,artist_id' }
    );
    if (glErr) { setSubmitting(false); Alert.alert('Error', glErr.message); return; }

    // 2. Assign to the ticked venues.
    if (venueIds.length > 0) {
      const rows = venueIds.map((id) => ({ manager_id: currentUser.id, artist_id: artistId, venue_id: id, status: 'active' }));
      await supabase.from('venue_assignments').upsert(rows, { onConflict: 'venue_id,artist_id' });
    }

    // 3. Local store so the roster shows them immediately.
    const ls = useLineupStore.getState();
    ls.addArtistUser({
      id: artistId, email: '', phone: '', accountType: 'artist' as const,
      fullName: artist.full_name ?? '', profilePhotoUrl: artist.profile_photo_url ?? undefined,
      avatarId: artist.avatar_id ?? undefined,
      isPhoneVerified: false, isEmailVerified: true, createdAt: now, updatedAt: now,
    } as any);
    ls.addToGlobalLineup({ id: `${currentUser.id}-${artistId}`, managerId: currentUser.id, artistId, status: 'active' as const, addedAt: now });
    venueIds.forEach((id) => ls.assignToVenue({
      id: `va-${id}-${artistId}`, globalLineupId: `${currentUser.id}-${artistId}`,
      venueId: id, artistId, assignedAt: now, status: 'active' as const,
    }));

    // 4. Notify + email the artist (same as adding from a profile).
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artistId, type: 'lineup_added' as any,
      title: 'Added to Lineup',
      body: `${firstName(currentUser.fullName, 'A manager')} added you — you can now be booked at their venues`,
      isRead: false, relatedId: currentUser.id, relatedType: 'manager', createdAt: now,
    });
    sendEmail(artistId, 'lineup_added', { managerName: currentUser.fullName ?? 'A manager', managerId: currentUser.id });

    setSubmitting(false);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 8, overflow: 'hidden' }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Add Artist</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.cancel, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: colors.muted }]}>ARTIST EMAIL</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          placeholder="artist@email.com"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Text style={[styles.hint, { color: colors.muted }]}>They must already have a Nexgig artist account.</Text>

        <Text style={[styles.label, { color: colors.muted, marginTop: 22 }]}>ADD TO VENUES</Text>
        {managerVenues.length === 0 ? (
          <Text style={[styles.hint, { color: colors.muted }]}>You have no venues yet.</Text>
        ) : (
          managerVenues.map((v) => {
            const on = selected.has(v.id);
            return (
              <Pressable key={v.id} style={({ pressed }) => [styles.venueRow, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]} onPress={() => toggle(v.id)}>
                <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={24} color={on ? colors.primary : colors.muted} />
              </Pressable>
            );
          })
        )}

        <Pressable
          style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.85 : 1, marginBottom: Math.max(insets.bottom, 12) + 8 }]}
          onPress={handleSend}
          disabled={submitting}
        >
          <Text style={styles.sendBtnText}>{submitting ? 'Adding…' : 'Add artist'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  title: { fontSize: 20, fontFamily: fonts.bodyBold, letterSpacing: -0.4 },
  cancel: { fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  hint: { fontSize: 13, marginTop: 8 },
  venueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  venueName: { flex: 1, fontSize: 16, fontWeight: '600', paddingRight: 12 },
  sendBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
