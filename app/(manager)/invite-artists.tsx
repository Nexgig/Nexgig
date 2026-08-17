import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Alert, ScrollView } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useVenueStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { sendRosterInviteEmail } from '@/lib/send-email';
import { firstName, genreLabel } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DirArtist = {
  id: string; full_name: string; email: string;
  primary_genre?: string | null; instruments?: string[] | null;
  profile_photo_url?: string | null; avatar_id?: string | null;
};

/**
 * Find-or-invite. Search the registered artists to add one straight away, OR type an email to
 * invite someone not on Nexgig. Searching by NAME is also how you add someone who signed up under
 * a hidden/different email (e.g. Apple "Hide My Email") — find them, add, then cancel the invite.
 */
export default function InviteArtists() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const managerVenues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );
  const rosterIds = useMemo(
    () => new Set(globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active').map((r) => r.artistId)),
    [globalLineup, currentUser?.id]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(managerVenues.map((v) => v.id)));
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<DirArtist[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Load the world-readable artist directory once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('artists')
          .select('id, full_name, email, primary_genre, instruments, profile_photo_url, avatar_id');
        if (alive && data) setArtists(data as DirArtist[]);
      } catch { /* directory fetch failed — screen still works for inviting by email */ }
    })();
    return () => { alive = false; };
  }, []);

  const toggleVenue = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const pool = artists.filter((a) => !rosterIds.has(a.id));
    const list = !q ? pool : pool.filter((a) =>
      (a.full_name ?? '').toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q));
    return list
      .sort((a, b) => (a.full_name ?? '').toLowerCase().localeCompare((b.full_name ?? '').toLowerCase()))
      .slice(0, 40);
  }, [artists, rosterIds, q]);

  // Offer "invite by email" when the query is a full email that no on-app artist matches.
  const emailToInvite = q && EMAIL_RE.test(q) && !artists.some((a) => (a.email ?? '').toLowerCase() === q) ? q : null;

  // Add an ALREADY-registered artist to the roster + ticked venues (no email — in-app notify).
  const addExisting = async (a: DirArtist) => {
    if (!currentUser || busyId) return;
    setBusyId(a.id);
    const venueIds = [...selected];
    const now = new Date().toISOString();
    const { error: glErr } = await supabase.from('global_lineup').upsert(
      { manager_id: currentUser.id, artist_id: a.id, status: 'active' }, { onConflict: 'manager_id,artist_id' });
    if (glErr) { setBusyId(null); Alert.alert('Error', glErr.message); return; }
    if (venueIds.length > 0) {
      await supabase.from('venue_assignments').upsert(
        venueIds.map((id) => ({ manager_id: currentUser.id, artist_id: a.id, venue_id: id, status: 'active' })),
        { onConflict: 'venue_id,artist_id' });
    }
    const ls = useLineupStore.getState();
    ls.addArtistUser({
      id: a.id, email: '', phone: '', accountType: 'artist' as const,
      fullName: a.full_name ?? '', profilePhotoUrl: a.profile_photo_url ?? undefined,
      avatarId: a.avatar_id ?? undefined, isPhoneVerified: false, isEmailVerified: true,
      createdAt: now, updatedAt: now,
    } as any);
    ls.addToGlobalLineup({ id: `${currentUser.id}-${a.id}`, managerId: currentUser.id, artistId: a.id, status: 'active' as const, addedAt: now });
    venueIds.forEach((id) => ls.assignToVenue({
      id: `va-${id}-${a.id}`, globalLineupId: `${currentUser.id}-${a.id}`,
      venueId: id, artistId: a.id, assignedAt: now, status: 'active' as const,
    }));
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: a.id, type: 'lineup_added' as any, title: 'Added to Lineup',
      body: `${firstName(currentUser.fullName, 'A manager')} added you — you can now be booked at their venues`,
      isRead: false, relatedId: currentUser.id, relatedType: 'manager', createdAt: now,
    });
    setBusyId(null);
    router.back();
  };

  // Invite an email that's NOT on Nexgig yet.
  const inviteByEmail = async () => {
    if (!currentUser || inviting || !emailToInvite) return;
    const e = emailToInvite;
    setInviting(true);
    const inviteVenueIds = [...selected];
    const { data: inviteRow, error: invErr } = await supabase.from('roster_invites').insert({
      manager_id: currentUser.id, manager_name: currentUser.fullName ?? null,
      email: e, artist_name: null, venue_ids: inviteVenueIds, status: 'pending',
    }).select('id, created_at').single();
    setInviting(false);
    if (invErr) {
      if ((invErr as { code?: string }).code === '23505') Alert.alert('Already invited', `You've already invited ${e}.`);
      else Alert.alert('Error', invErr.message);
      return;
    }
    useLineupStore.getState().addRosterInvite({
      id: inviteRow.id, managerId: currentUser.id, email: e, artistName: undefined,
      venueIds: inviteVenueIds, status: 'pending', createdAt: inviteRow.created_at ?? new Date().toISOString(),
    });
    sendRosterInviteEmail(e, currentUser.fullName ?? 'A venue manager', undefined);
    Alert.alert('Invite sent', `We've emailed ${e} an invite. They'll join your roster automatically when they sign up.`);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 8, overflow: 'hidden' }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Add Artist</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={[styles.cancel, { color: colors.muted }]}>Cancel</Text></Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Venue picker — applies to whoever you add or invite. */}
        <Text style={[styles.label, { color: colors.muted }]}>ADD TO VENUES</Text>
        {managerVenues.length === 0 ? (
          <Text style={[styles.hint, { color: colors.muted }]}>You have no venues yet.</Text>
        ) : (
          <View style={styles.venueChips}>
            {managerVenues.map((v) => {
              const on = selected.has(v.id);
              return (
                <Pressable key={v.id} onPress={() => toggleVenue(v.id)} style={[styles.venueChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + '15' : 'transparent' }]}>
                  <MaterialIcons name={on ? 'check' : 'add'} size={14} color={on ? colors.primary : colors.muted} />
                  <Text style={[styles.venueChipText, { color: on ? colors.primary : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Search / email box */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, or type an email to invite"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={8}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable>}
        </View>

        {/* Invite-by-email option */}
        {emailToInvite && (
          <Pressable onPress={inviteByEmail} disabled={inviting} style={({ pressed }) => [styles.inviteRow, { borderColor: colors.border, opacity: pressed || inviting ? 0.7 : 1 }]}>
            <View style={[styles.inviteIcon, { backgroundColor: colors.primary + '15' }]}>
              <MaterialIcons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inviteTitle, { color: colors.primary }]} numberOfLines={1}>{inviting ? 'Sending…' : `Invite ${emailToInvite}`}</Text>
              <Text style={[styles.inviteSub, { color: colors.muted }]}>Not on Nexgig — we'll email them to join</Text>
            </View>
          </Pressable>
        )}

        {/* Results */}
        {results.map((a) => (
          <View key={a.id} style={[styles.artistRow, { borderBottomColor: colors.border }]}>
            <AvatarImage uri={a.profile_photo_url || undefined} avatarId={a.avatar_id ?? undefined} seed={a.id} name={a.full_name} size={44} variant="artist" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.artistName, { color: colors.foreground }]} numberOfLines={1}>{a.full_name}</Text>
              <Text style={[styles.artistSub, { color: colors.muted }]} numberOfLines={1}>{genreLabel(a.primary_genre, a.instruments)}</Text>
            </View>
            <Pressable onPress={() => addExisting(a)} disabled={!!busyId} style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed || busyId === a.id ? 0.7 : 1 }]}>
              <Text style={styles.addBtnText}>{busyId === a.id ? 'Adding…' : 'Add'}</Text>
            </Pressable>
          </View>
        ))}

        {results.length === 0 && !emailToInvite && (
          <Text style={[styles.empty, { color: colors.muted }]}>
            {!q ? 'Start typing a name to find an artist, or type a full email to invite someone new.'
              : 'No artists match. Type a full email to invite someone new.'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  title: { fontSize: 20, fontFamily: fonts.bodyBold, letterSpacing: -0.4 },
  cancel: { fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 13, marginTop: 4 },
  venueChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  venueChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  venueChipText: { fontSize: 13, fontWeight: '600', maxWidth: 160 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 12 },
  inviteIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { fontSize: 15, fontWeight: '700' },
  inviteSub: { fontSize: 13, marginTop: 1 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  artistName: { fontSize: 15, fontWeight: '600' },
  artistSub: { fontSize: 13, marginTop: 1 },
  addBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 12, lineHeight: 20 },
});
