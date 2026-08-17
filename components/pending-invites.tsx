import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import { sendRosterInviteEmail } from '@/lib/send-email';
import type { RosterInvite } from '@/lib/types';

/**
 * "INVITED · NOT JOINED YET" — pending email invites (people not on Nexgig yet), each with
 * resend/cancel. Shown at the top of BOTH manager roster views (the Roster tab and the My
 * Artists screen). Renders nothing when there are no pending invites.
 */
export function PendingInvites() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const rosterInvites = useLineupStore((s) => s.rosterInvites);
  const removeRosterInvite = useLineupStore((s) => s.removeRosterInvite);

  const pending = useMemo(() =>
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
              console.warn('cancel invite:', error.message);
              useLineupStore.getState().addRosterInvite(inv); // roll back
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

  if (pending.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: colors.muted }]}>INVITED · NOT JOINED YET</Text>
      {pending.map((inv) => (
        <View key={inv.id} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="mail-outline" size={20} color={colors.muted} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{inv.artistName || inv.email}</Text>
            <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>{inv.artistName ? inv.email : 'Invited to Nexgig'}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.chipText, { color: colors.muted }]}>Invited</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => resendInvite(inv)} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="refresh" size={20} color={colors.primary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => cancelInvite(inv)} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 1 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 11, fontWeight: '700' },
  action: { padding: 2 },
});
