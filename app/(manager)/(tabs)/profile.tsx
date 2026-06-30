import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useLineupStore, useInvoiceStore, resetAllStores } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { clearPushToken } from '@/lib/notifications-push';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useMemo, useState, useCallback } from 'react';
import { COUNTRIES } from '@/components/country-picker';

export default function ManagerProfileScreen() {
  const router = useRouter();
  const colors = useColors();
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
          if (store.invoices.some((i) => i.id === inv.id)) return;
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

  const managerBasedIn = currentUser?.location ?? '';
  const managerBasedInCountry = managerBasedIn ? COUNTRIES.find((c) => c.name === managerBasedIn) : undefined;

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
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Profile</Text>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/(manager)/settings' as Href)}
          >
            <MaterialIcons name="settings" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.push('/(manager)/edit-profile' as Href)}
            hitSlop={8}
          >
            <MaterialIcons name="edit" size={18} color={colors.muted} />
          </Pressable>
          <AvatarImage uri={currentUser?.profilePhotoUrl} name={currentUser?.fullName} size={80} variant="manager" />
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.foreground }]}>{currentUser?.fullName}</Text>
            <Text style={[styles.role, { color: colors.foreground }]}>Venue Manager</Text>
            {managerBasedInCountry && (
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={14} color={colors.muted} />
                <Text style={[styles.locationText, { color: colors.muted }]}>{managerBasedInCountry.name}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <Pressable
              style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push((venues.length === 0 ? '/(manager)/create-venue' : '/(manager)/my-venues') as Href)}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{venues.length === 0 ? '+' : venues.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Venues</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push((djCount === 0 ? '/(manager)/(tabs)/network?tab=artists' : '/(manager)/artists') as Href)}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{djCount === 0 ? '+' : djCount}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Artists</Text>
            </Pressable>
          </View>

          {/* Invoices */}
          <InvoicesSection colors={colors} currentUserId={currentUser?.id ?? ''} router={router} />

          {/* Account */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.muted }]}>Account</Text>
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
          </View>

          {/* Sign Out */}
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
            onPress={handleSignOut}
          >
            <MaterialIcons name="logout" size={18} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Invoices Section ─────────────────────────────────────────────────────────

import type { Invoice } from '@/lib/types';
import * as Haptics from 'expo-haptics';

function InvoicesSection({ colors, currentUserId, router }: {
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  currentUserId: string;
  router: ReturnType<typeof import('expo-router').useRouter>;
}) {
  const invoices = useInvoiceStore((s) => s.invoices);
  const deleteInvoice = useInvoiceStore((s) => s.deleteInvoice);
  const [expanded, setExpanded] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const sortedInvoices = useMemo(
    () => invoices
      .filter((inv) => inv.managerId === currentUserId && !inv.isDeletedByManager)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, currentUserId]
  );

  const totalUnread = useMemo(
    () => sortedInvoices.filter((inv) => !inv.isReadByManager).length,
    [sortedInvoices]
  );

  const handleDeleteInvoice = useCallback((id: string, artistName: string) => {
    Alert.alert('Delete Invoice', `Delete invoice from ${artistName}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        deleteInvoice(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  }, [deleteInvoice]);

  const handleDownloadAll = useCallback(async () => {
    if (sortedInvoices.length === 0) return;
    setDownloadingAll(true);
    try {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const FileSystem = await import('expo-file-system/legacy');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (const inv of sortedInvoices) {
        const html = generateManagerInvoiceHTML(inv);
        const { uri } = await Print.printToFileAsync({ html });
        const sentDate = new Date(inv.sentAt);
        const day = String(sentDate.getDate()).padStart(2, '0');
        const mon = months[sentDate.getMonth()];
        const year = sentDate.getFullYear();
        const artistSlug = (inv.artistLegalName || 'Artist').replace(/[^a-zA-Z0-9]/g, '');
        const venueSlug = (inv.venueName || 'Venue').replace(/[^a-zA-Z0-9]/g, '');
        const invSlug = (inv.invoiceNumber || inv.id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, '');
        const filename = `${invSlug}.pdf`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        zip.file(filename, base64, { base64: true, compression: 'STORE' });
      }
      const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'STORE' });
      const zipPath = `${FileSystem.cacheDirectory}Nexgig_Invoices.zip`;
      await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: 'base64' });
      await Sharing.shareAsync(zipPath, { mimeType: 'application/zip', dialogTitle: 'Nexgig_Invoices.zip' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `Could not create invoice archive.\n${msg}`);
    } finally {
      setDownloadingAll(false);
    }
  }, [sortedInvoices]);

  if (sortedInvoices.length === 0) return null;

  return (
    <View style={[invStyles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        style={({ pressed }) => [invStyles.collapseHeader, { borderBottomColor: expanded ? colors.border : 'transparent', opacity: pressed ? 0.85 : 1 }]}
        onPress={() => { setExpanded((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={invStyles.collapseHeaderLeft}>
          <MaterialIcons name="receipt-long" size={20} color={colors.foreground} />
          <Text style={[invStyles.collapseTitle, { color: colors.foreground }]}>Invoices</Text>
          {totalUnread > 0 && (
            <View style={[invStyles.unreadBadge, { backgroundColor: '#F97316' }]}>
              <Text style={invStyles.unreadBadgeText}>{totalUnread}</Text>
            </View>
          )}
        </View>
        <View style={invStyles.collapseHeaderRight}>
          <Pressable
            style={({ pressed }) => [invStyles.downloadAllBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={(e) => { e.stopPropagation?.(); handleDownloadAll(); }}
            hitSlop={8}
          >
            {downloadingAll
              ? <ActivityIndicator size="small" color="#fff" />
              : <><MaterialIcons name="download" size={14} color="#fff" /><Text style={invStyles.downloadAllText}>All</Text></>
            }
          </Pressable>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={invStyles.content}>
          {sortedInvoices.map((inv, idx) => {
            const isLast = idx === sortedInvoices.length - 1;
            const isUnread = !inv.isReadByManager;
            const sentDate = new Date(inv.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <Swipeable
                key={inv.id}
                renderRightActions={() => (
                  <Pressable
                    style={({ pressed }) => [invStyles.deleteAction, { opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => handleDeleteInvoice(inv.id, inv.artistLegalName)}
                  >
                    <MaterialIcons name="delete" size={20} color="#fff" />
                    <Text style={invStyles.deleteActionText}>Delete</Text>
                  </Pressable>
                )}
              >
                <Pressable
                  style={({ pressed }) => [invStyles.invoiceCard, { backgroundColor: colors.surface, borderColor: isLast ? 'transparent' : colors.border, borderBottomWidth: isLast ? 0 : 0.5, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId: inv.id } });
                  }}
                >
                  <View style={invStyles.cardTop}>
                    <View style={invStyles.cardLeft}>
                      <Text style={[invStyles.artistNameLabel, { color: colors.primary }]} numberOfLines={1}>{inv.artistLegalName}</Text>
                      <Text style={[invStyles.venueName, { color: colors.foreground }]} numberOfLines={1}>{inv.venueName}</Text>
                      <Text style={[invStyles.sentDateText, { color: colors.muted }]}>
                        {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}
                      </Text>
                    </View>
                    <View style={invStyles.cardRight}>
                      <Text style={[invStyles.amountText, { color: colors.primary }]}>AED {inv.totalAmount.toLocaleString()}</Text>
                      {isUnread && <View style={[invStyles.unreadDot, { backgroundColor: '#F97316' }]} />}
                    </View>
                  </View>
                </Pressable>
              </Swipeable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function generateManagerInvoiceHTML(inv: Invoice): string {
  const rows = inv.gigs.map((g) => `
    <tr>
      <td>${g.date}</td><td>${g.setName}</td>
      <td>${g.startTime} – ${g.endTime}</td>
      <td style="text-align:right">${g.price.toLocaleString()}</td>
    </tr>
  `).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:40px;color:#1a1a1a}
    h1{font-size:28px;margin-bottom:4px}.inv-num{color:#E2674A;font-size:16px;margin-bottom:8px}
    .date{color:#666;font-size:14px;margin-bottom:24px}.parties{display:flex;gap:40px;margin-bottom:24px}
    .party{flex:1}.party-label{font-size:10px;font-weight:700;color:#999;letter-spacing:1px;margin-bottom:4px}
    .party-name{font-size:15px;font-weight:700;margin-bottom:2px}.party-detail{font-size:12px;color:#666}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f0f4ff;text-align:left;padding:10px 12px;font-size:12px;font-weight:700;border-bottom:1px solid #e5e7eb}
    th:last-child{text-align:right}td{padding:10px 12px;font-size:13px;border-bottom:1px solid #f0f0f0}
    td:last-child{text-align:right;font-weight:600}
    .total-row{display:flex;justify-content:flex-end;align-items:center;gap:16px;padding:16px 0;border-top:2px solid #E2674A}
    .total-label{font-size:14px;font-weight:700}.total-value{font-size:22px;font-weight:800;color:#E2674A}
  </style></head><body>
    <h1>INVOICE</h1><div class="inv-num">${inv.invoiceNumber}</div>
    <div class="date">Date: ${new Date(inv.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <div class="parties">
      <div class="party"><div class="party-label">FROM</div><div class="party-name">${inv.artistLegalName}</div>
        ${inv.artistEmail ? `<div class="party-detail">${inv.artistEmail}</div>` : ''}
        ${inv.artistLocation ? `<div class="party-detail">${inv.artistLocation}</div>` : ''}
      </div>
      <div class="party"><div class="party-label">TO</div><div class="party-name">${inv.venueLegalName}</div>
        ${inv.venueTrnNumber ? `<div class="party-detail">TRN: ${inv.venueTrnNumber}</div>` : ''}
        ${inv.venueAddress ? `<div class="party-detail">${inv.venueAddress}</div>` : ''}
      </div>
    </div>
    <table><thead><tr><th>Date</th><th>Set</th><th>Time</th><th>AED</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total-row"><span class="total-label">TOTAL</span>
      <span class="total-value">AED ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </body></html>`;
}

const invStyles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  collapseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapseTitle: { fontSize: 16, fontWeight: '700' },
  unreadBadge: { borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  downloadAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  downloadAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  content: {},
  invoiceCard: { paddingHorizontal: 16, paddingVertical: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, gap: 3 },
  artistNameLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  venueName: { fontSize: 15, fontWeight: '700' },
  sentDateText: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  amountText: { fontSize: 15, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 72, marginLeft: 8 },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '800' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  profileCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative' },
  editBtn: { position: 'absolute', top: 12, right: 12, zIndex: 1, padding: 4 },
  profileInfo: { flex: 1, gap: 4 },
  name: { fontSize: 22, fontWeight: '800' },
  role: { fontSize: 15, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13 },
  content: { paddingHorizontal: 16, paddingBottom: 22, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 28, fontWeight: '800', fontFamily: fonts.bodyBold },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountText: { fontSize: 14 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  signOutText: { fontSize: 15, fontWeight: '700' },
});
