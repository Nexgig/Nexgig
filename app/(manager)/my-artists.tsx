import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { genreLabel } from '@/lib/utils';
import { SHOW_ARTIST_VERIFIED_BADGE } from '@/lib/features';
import { supabase } from '@/lib/supabase';
import { sendRosterInviteEmail } from '@/lib/send-email';
import type { RosterInvite } from '@/lib/types';

export default function MyArtistsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const rosterInvites = useLineupStore((s) => s.rosterInvites);
  const removeRosterInvite = useLineupStore((s) => s.removeRosterInvite);

  const artists = useMemo(() => {
    return globalLineup
      .filter((r) => r.managerId === currentUser?.id && r.status === 'active')
      .map((r) => ({ user: getArtistUser(r.artistId), profile: getArtistProfile(r.artistId) }))
      .filter((a) => !!a.user)
      .sort((a, b) => (a.user!.fullName ?? '').toLowerCase().localeCompare((b.user!.fullName ?? '').toLowerCase()));
  }, [globalLineup, currentUser?.id, getArtistUser, getArtistProfile]);

  // Invited-by-email but not signed up yet — shown above the roster with an "Invited" chip.
  const pendingInvites = useMemo(() =>
    rosterInvites
      .filter((i) => i.managerId === currentUser?.id && i.status === 'pending')
      .sort((a, b) => (a.artistName ?? a.email).toLowerCase().localeCompare((b.artistName ?? b.email).toLowerCase())),
    [rosterInvites, currentUser?.id]);

  const cancelInvite = (inv: RosterInvite) => {
    Alert.alert('Cancel invite', `Cancel the invite to ${inv.artistName || inv.email}?`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel invite', style: 'destructive', onPress: () => {
        removeRosterInvite(inv.id); // optimistic
        supabase.from('roster_invites').update({ status: 'cancelled' }).eq('id', inv.id)
          .then(({ error }) => {
            if (error) {
              // Roll back — the row is still pending, so restore the chip + tell them.
              console.warn('cancel invite:', error.message);
              useLineupStore.getState().addRosterInvite(inv);
              Alert.alert('Could not cancel', 'Something went wrong — please try again.');
            }
          });
      } },
    ]);
  };

  const resendInvite = (inv: RosterInvite) => {
    sendRosterInviteEmail(inv.email, currentUser?.fullName ?? 'A venue manager', inv.artistName);
    Alert.alert('Invite resent', `We've emailed ${inv.email} again.`);
  };

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My Artists</Text>
        <Pressable style={({ pressed }) => [styles.iconBtn, { alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 }]} onPress={() => router.push('/(manager)/invite-artists' as Href)} hitSlop={8}>
          <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={artists}
        keyExtractor={(item) => item.user!.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          pendingInvites.length > 0 ? (
            <View style={styles.pendingSection}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>INVITED · NOT JOINED YET</Text>
              {pendingInvites.map((inv) => (
                <View key={inv.id} style={styles.pendingRow}>
                  <View style={[styles.pendingAvatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="mail-outline" size={20} color={colors.muted} />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{inv.artistName || inv.email}</Text>
                    <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>{inv.artistName ? inv.email : 'Invited to Nexgig'}</Text>
                  </View>
                  <View style={[styles.invitedChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.invitedChipText, { color: colors.muted }]}>Invited</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => resendInvite(inv)} style={({ pressed }) => [styles.pendingAction, { opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="refresh" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => cancelInvite(inv)} style={({ pressed }) => [styles.pendingAction, { opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="close" size={20} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
              {artists.length > 0 && <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 14 }]}>ON YOUR ROSTER</Text>}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="people" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Artists Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Connect artists from the Network tab</Text>
          </View>
        }
        renderItem={({ item }) => {
          const u = item.user!;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + u.id) as Href)}
            >
              <AvatarImage uri={u.profilePhotoUrl || undefined} avatarId={(u as any).avatarId ?? undefined} seed={u.id} name={u.fullName} size={48} variant="artist" />
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text style={[styles.name, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{u.fullName}</Text>
                  {SHOW_ARTIST_VERIFIED_BADGE && item.profile?.hasCompletedBooking && (
                    <MaterialIcons name="verified" size={15} color={colors.primary} />
                  )}
                </View>
                <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
                  {genreLabel(item.profile?.primaryGenre, item.profile?.instruments)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  iconBtn: { width: 36 },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingVertical: 8, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  pendingSection: { marginBottom: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 2 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  pendingAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  invitedChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  invitedChipText: { fontSize: 11, fontWeight: '700' },
  pendingAction: { padding: 2 },
});
