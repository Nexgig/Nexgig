import { RoleSwitcher } from '@/components/ui/role-switcher';
import { useRoleSwitching } from '@/lib/roles';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { Section, Divider, StatRow, SoftButton } from '@/components/ui/card-free';
import { useAuthStore, useVenueStore, useLineupStore, useInvoiceStore, resetAllStores } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { clearPushToken } from '@/lib/notifications-push';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useMemo, useState, useCallback } from 'react';

export default function ManagerProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  // Drops the RefreshControl during a role switch — see useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const signOut = useAuthStore((s) => s.signOut);
  const allVenues = useVenueStore((s) => s.venues);
  const globalLineup = useLineupStore((s) => s.globalLineup);

  const djCount = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active').length,
    [globalLineup, currentUser?.id]
  );

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  const addInvoice = useInvoiceStore((s) => s.addInvoice);
  const invoicesList = useInvoiceStore((s) => s.invoices);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    const { data } = await supabase.from('invoices').select('*').eq('manager_id', currentUser.id).order('sent_at', { ascending: false });
    if (data) {
      data.forEach((inv: any) => {
        if (invoicesList.some((i) => i.id === inv.id)) return;
        addInvoice({
          id: inv.id, venueId: inv.venue_id, venueName: inv.venue_name,
          artistId: inv.artist_id, artistLegalName: inv.artist_legal_name,
          artistEmail: inv.artist_email ?? '', artistLocation: inv.artist_location ?? '',
          managerId: inv.manager_id, managerName: '',
          venueLegalName: inv.venue_legal_name ?? inv.venue_name,
          venueTrnNumber: inv.venue_trn_number ?? '', venueAddress: inv.venue_address ?? '',
          gigs: inv.gigs ?? [], totalAmount: parseFloat(inv.total_amount),
          invoiceNumber: inv.invoice_number ?? '', sentAt: inv.sent_at, status: inv.status,
        });
      });
    }
    setRefreshing(false);
  }, [currentUser?.id, invoicesList]);

  // Re-pull invoices from Supabase every time the Profile tab gains focus, so a newly
  // sent invoice shows up without depending on the realtime INSERT firing or an app
  // restart. Reads store state via getState() to avoid a stale-closure dedupe check.
  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.id) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .eq('manager_id', currentUser.id)
          .order('sent_at', { ascending: false });
        if (cancelled || !data) return;
        const store = useInvoiceStore.getState();
        data.forEach((inv: any) => {
          if (store.invoices.some((i) => i.id === inv.id)) {
            // Already in store — just sync the status so a cancellation done while
            // away propagates on focus (the dedupe below would otherwise skip it).
            store.updateInvoiceStatus(inv.id, inv.status);
            return;
          }
          store.addInvoice({
            id: inv.id, venueId: inv.venue_id, venueName: inv.venue_name,
            artistId: inv.artist_id, artistLegalName: inv.artist_legal_name,
            artistEmail: inv.artist_email ?? '', artistLocation: inv.artist_location ?? '',
            managerId: inv.manager_id, managerName: '',
            venueLegalName: inv.venue_legal_name ?? inv.venue_name,
            venueTrnNumber: inv.venue_trn_number ?? '', venueAddress: inv.venue_address ?? '',
            gigs: inv.gigs ?? [], totalAmount: parseFloat(inv.total_amount),
            invoiceNumber: inv.invoice_number ?? '', sentAt: inv.sent_at, status: inv.status,
            isReadByManager: inv.is_read_by_manager ?? false,
            isDeletedByManager: inv.is_deleted_by_manager ?? false,
          });
        });
      })();
      return () => { cancelled = true; };
    }, [currentUser?.id])
  );

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        const uid = currentUser?.id;
        if (uid) await clearPushToken(uid);
        resetAllStores(); signOut(); router.replace('/(auth)/welcome' as Href);
      } },
    ]);
  };

  return (
    <ScreenContainer>
      {/* Frozen header — stays fixed while the profile content scrolls. */}
      <View style={styles.header}>
        <RoleSwitcher role="manager" />
        <Pressable
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push('/(manager)/settings' as Href)}
        >
          <MaterialIcons name="settings" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>

        {/* Hero — centred avatar + name */}
        <View style={styles.hero}>
          <AvatarImage uri={currentUser?.profilePhotoUrl} avatarId={currentUser?.avatarId} seed={currentUser?.id} name={currentUser?.fullName} size={80} variant="manager" />
          <Text style={[styles.name, { color: colors.foreground }]}>{currentUser?.fullName}</Text>
        </View>

        {/* Stats — inline, no boxes */}
        <StatRow
          items={[
            {
              value: venues.length === 0 ? '+' : venues.length,
              label: 'VENUES',
              color: venues.length === 0 ? colors.primary : colors.foreground,
              // Dedicated My Venues page (Network is for browsing/connecting). Empty
              // still shortcuts straight to create-venue.
              onPress: () => router.push((venues.length === 0
                ? '/(manager)/create-venue'
                : '/(manager)/my-venues') as Href),
            },
            {
              value: djCount === 0 ? '+' : djCount,
              label: 'ARTISTS',
              color: djCount === 0 ? colors.primary : colors.foreground,
              // Dedicated My Artists page. With none connected, drop into Network to
              // go find some.
              onPress: () => router.push((djCount === 0
                ? '/(manager)/(tabs)/network?tab=artists'
                : '/(manager)/my-artists') as Href),
            },
          ]}
        />

        <Divider />


        {/* Account */}
        <Section label="Account">
          <View style={styles.accountRow}>
            <MaterialIcons name="email" size={16} color={colors.muted} />
            <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser?.email}</Text>
          </View>
          {currentUser?.companyName ? (
            <View style={styles.accountRow}>
              <MaterialIcons name="business" size={16} color={colors.muted} />
              <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser.companyName}</Text>
            </View>
          ) : null}
          {currentUser?.phone && (
            <View style={styles.accountRow}>
              <MaterialIcons name="phone" size={16} color={colors.muted} />
              <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser.phone}</Text>
            </View>
          )}
        </Section>

        {/* Sign Out */}
        <View style={styles.signOutWrap}>
          <SoftButton tone="danger" icon="logout" label="Sign Out" onPress={handleSignOut} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}


const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 22, paddingHorizontal: 20, gap: 6, position: 'relative' },
  editBtn: { position: 'absolute', top: 12, right: 16, zIndex: 1, padding: 4 },
  name: { fontSize: 22, fontFamily: fonts.bodyBold, marginTop: 8 },
  content: { paddingHorizontal: 20, paddingVertical: 16 },
  signOutWrap: { paddingHorizontal: 20, paddingVertical: 20 },
  statNumber: { fontSize: 28, fontWeight: '800', fontFamily: fonts.bodyBold },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountText: { fontSize: 14 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  signOutText: { fontSize: 15, fontWeight: '700' },
});
