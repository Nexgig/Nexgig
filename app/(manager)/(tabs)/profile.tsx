import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Modal, TextInput, Keyboard, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useNotificationStore, useLineupStore, useBookingStore, useInvoiceStore } from '@/lib/store';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type { VenueAssignment } from '@/lib/types';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useMemo, useState, useRef, useCallback } from 'react';
import { COUNTRIES } from '@/components/country-picker';

export default function ManagerProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const signOut = useAuthStore((s) => s.signOut);
  const allVenues = useVenueStore((s) => s.venues);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const djCount = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active').length,
    [globalLineup, currentUser?.id]
  );

  // Manager does not have an ArtistProfile, so we store basedIn in currentUser.location
  // (manager edit-profile saves to form.basedIn but we need to also persist it to currentUser.location)
  const managerBasedIn = currentUser?.location ?? '';
  const managerBasedInCountry = managerBasedIn ? COUNTRIES.find((c) => c.name === managerBasedIn) : undefined;

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );


  // ── Lineup store ──────────────────────────────────────────────────────────
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const removeFromGlobalLineup = useLineupStore((s) => s.removeFromGlobalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const bookings = useBookingStore((s) => s.bookings);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const myGlobalLineup = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active'),
    [globalLineup, currentUser?.id]
  );

  const activeAssignments = useMemo(
    () => venueAssignments.filter((a) => a.status === 'active'),
    [venueAssignments]
  );

  const djListGlobal = useMemo(() => {
    return myGlobalLineup.map((entry) => {
      const user = getArtistUser(entry.artistId);
      const profile = getArtistProfile(entry.artistId);
      const assignedVenueIds = activeAssignments
        .filter((a) => a.artistId === entry.artistId)
        .map((a) => a.venueId);
      const assignedVenues = venues.filter((v) => assignedVenueIds.includes(v.id));
      return { entry, user, profile, assignedVenues, assignedVenueIds };
    }).filter((item) => item.user)
      .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));
  }, [myGlobalLineup, activeAssignments, venues, getArtistUser, getArtistProfile]);

  const getCompletedGigs = (artistId: string) =>
    bookings.filter((b) => b.artistId === artistId && b.managerId === currentUser?.id && b.isCompleted).length;

  // ── Lineup UI state ───────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [showAssignSheet, setShowAssignSheet] = useState(false);
  const [assignDJId, setAssignDJId] = useState('');

  const assignDJName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
  const assignArtistProfile = getArtistProfile(assignDJId);
  const assignDJUser = getArtistUser(assignDJId);

  const assignedVenueIdsForDJ = useMemo(
    () => activeAssignments.filter((a) => a.artistId === assignDJId).map((a) => a.venueId),
    [activeAssignments, assignDJId]
  );
  const unassignedVenues = useMemo(
    () => venues.filter((v) => !assignedVenueIdsForDJ.includes(v.id)),
    [venues, assignedVenueIdsForDJ]
  );
  const assignedVenuesForSheet = useMemo(
    () => venues.filter((v) => assignedVenueIdsForDJ.includes(v.id)),
    [venues, assignedVenueIdsForDJ]
  );

  const handleRemoveDJ = (artistId: string, djName: string) => {
    const completedCount = getCompletedGigs(artistId);
    const message = completedCount > 0
      ? `${djName} has ${completedCount} completed gig${completedCount > 1 ? 's' : ''} on record. Their gig history will be preserved. This will remove them from your lineup and all venues.`
      : `Remove ${djName} from your lineup? This will also remove them from all venues.`;
    Alert.alert('Remove from Lineup', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        removeFromGlobalLineup(artistId);
        addNotification({
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          userId: artistId,
          type: 'lineup_removed',
          title: 'Removed from Lineup',
          body: `${currentUser?.fullName ?? 'A manager'} removed you from their artist lineup.`,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }},
    ]);
  };

  const openAssignSheet = (artistId: string) => {
    setAssignDJId(artistId);
    setShowAssignSheet(true);
  };

  const handleAddToVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert('Add to Venue', `Add ${djName} to ${venueName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => {
          const grEntry = myGlobalLineup.find((r) => r.artistId === assignDJId);
          const newAssignment: VenueAssignment = {
            id: `va-${Date.now()}`,
            globalLineupId: grEntry?.id ?? '',
            venueId,
            artistId: assignDJId,
            assignedAt: new Date().toISOString(),
            status: 'active',
          };
          assignToVenue(newAssignment);
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: assignDJId,
            type: 'venue_assigned',
            title: 'Assigned to Venue',
            body: `${currentUser?.fullName ?? 'A manager'} assigned you to ${venueName}.`,
            isRead: false,
            relatedId: venueId,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  const handleRemoveFromVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert(
      'Remove from Venue',
      `Remove ${djName} from ${venueName}? They will stay on your global lineup.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => {
          removeFromVenue(venueId, assignDJId);
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: assignDJId,
            type: 'venue_removed',
            title: 'Removed from Venue',
            body: `${currentUser?.fullName ?? 'A manager'} removed you from ${venueName}.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { Alert.alert('Required', 'Please enter an email address.'); return; }
    setIsInviting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsInviting(false);
    Alert.alert('Invite Sent', `An invitation has been sent to ${inviteEmail}.`);
    setInviteEmail('');
    setShowInviteModal(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { signOut(); router.replace('/(auth)/welcome' as Href); } },
    ]);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Profile</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={({ pressed }) => [styles.notifBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push('/(manager)/settings' as Href)}
            >
              <MaterialIcons name="settings" size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Edit icon top-right */}
          <Pressable
            style={({ pressed }) => [styles.heroEditBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.push('/(manager)/edit-profile' as Href)}
            hitSlop={8}
          >
            <MaterialIcons name="edit" size={18} color={colors.muted} />
          </Pressable>
          <AvatarImage uri={currentUser?.profilePhotoUrl} name={currentUser?.fullName} size={80} />
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.foreground }]}>{currentUser?.fullName}</Text>
            <Text style={[styles.role, { color: colors.primary }]}>Venue Manager</Text>
            {managerBasedInCountry && (
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={14} color={colors.muted} />
                <Text style={[styles.locationText, { color: colors.muted }]}>{managerBasedInCountry.name}</Text>
              </View>
            )}
          </View>

        </View>

        <View style={styles.content}>
          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <Pressable
              style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              onPress={() => venues.length === 0 ? router.push('/(manager)/create-venue' as Href) : router.push('/(manager)/my-venues' as Href)}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{venues.length === 0 ? '+' : venues.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Venues</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              onPress={() => djCount === 0 ? router.push('/(manager)/invite-artist' as Href) : router.push('/(manager)/artists' as Href)}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{djCount === 0 ? '+' : djCount}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Artists</Text>
            </Pressable>
          </View>

          {/* Bio */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.muted }]}>Bio</Text>
            <Text style={[styles.cardText, { color: currentUser?.bio ? colors.foreground : colors.muted }]}>
              {currentUser?.bio ?? 'No bio yet. Tap the edit button above to add one.'}
            </Text>
          </View>




          {/* Invoices Section */}
          <InvoicesSection colors={colors} currentUserId={currentUser?.id ?? ''} router={router} />

          {/* Account */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.muted }]}>Account</Text>
            <View style={styles.accountRow}>
              <MaterialIcons name="email" size={16} color={colors.muted} />
              <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser?.email}</Text>
            </View>
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

      {/* ── Assign Venue Sheet ── */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={lineupSheetStyles.overlay}>
          <View style={[lineupSheetStyles.sheet, { backgroundColor: colors.background }]}>
            <View style={[lineupSheetStyles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={lineupSheetStyles.sheetArtistRow}>
              <AvatarImage uri={assignDJUser?.profilePhotoUrl} name={assignDJUser?.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[lineupSheetStyles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>{assignDJName}</Text>
                <Text style={[lineupSheetStyles.sheetSub, { color: colors.muted }]} numberOfLines={1}>{assignArtistProfile?.primaryGenre ?? 'Artist'}</Text>
              </View>
            </View>
            <ScrollView style={lineupSheetStyles.venueScrollList} showsVerticalScrollIndicator={false}>
              {unassignedVenues.length > 0 && (
                <>
                  <Text style={[lineupSheetStyles.sectionLabel, { color: colors.muted }]}>ADD TO VENUE</Text>
                  {unassignedVenues.map((v) => (
                    <Pressable
                      key={v.id}
                      style={({ pressed }) => [
                        lineupSheetStyles.venueRow,
                        { backgroundColor: pressed ? colors.surface : colors.background, borderColor: colors.border },
                      ]}
                      onPress={() => handleAddToVenue(v.id)}
                    >
                      <View style={[lineupSheetStyles.venueRowIcon, { backgroundColor: colors.border + '60' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.muted} />
                      </View>
                      <View style={lineupSheetStyles.venueRowInfo}>
                        <Text style={[lineupSheetStyles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[lineupSheetStyles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
                    </Pressable>
                  ))}
                </>
              )}
              {assignedVenuesForSheet.length > 0 && (
                <>
                  <Text style={[lineupSheetStyles.sectionLabel, { color: colors.muted, marginTop: unassignedVenues.length > 0 ? 16 : 0 }]}>ASSIGNED</Text>
                  {assignedVenuesForSheet.map((v) => (
                    <View
                      key={v.id}
                      style={[lineupSheetStyles.venueRow, { backgroundColor: colors.primary + '0A', borderColor: colors.primary + '40' }]}
                    >
                      <View style={[lineupSheetStyles.venueRowIcon, { backgroundColor: colors.primary + '15' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.primary} />
                      </View>
                      <View style={lineupSheetStyles.venueRowInfo}>
                        <Text style={[lineupSheetStyles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[lineupSheetStyles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [lineupSheetStyles.removeVenueBtn, { backgroundColor: colors.error + '15', opacity: pressed ? 0.6 : 1 }]}
                        onPress={() => handleRemoveFromVenue(v.id)}
                      >
                        <MaterialIcons name="remove-circle" size={16} color={colors.error} />
                        <Text style={[lineupSheetStyles.removeVenueBtnText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              {venues.length === 0 && (
                <Text style={[lineupSheetStyles.emptyVenues, { color: colors.muted }]}>No venues yet. Add a venue first.</Text>
              )}
            </ScrollView>
            <Pressable
              style={({ pressed }) => [lineupSheetStyles.doneBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setShowAssignSheet(false)}
            >
              <Text style={[lineupSheetStyles.doneBtnText, { color: colors.foreground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Invite Artist floating sheet ── */}
      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}>
        <Pressable style={inviteSheetStyles.kavWrapper} onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}>
          <Pressable style={[inviteSheetStyles.sheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={inviteSheetStyles.handleRow}>
              <View style={[inviteSheetStyles.handle, { backgroundColor: colors.border }]} />
            </View>
            <View style={inviteSheetStyles.header}>
              <View>
                <Text style={[inviteSheetStyles.sheetTitle, { color: colors.foreground }]}>Add Artist</Text>
                <Text style={[inviteSheetStyles.sheetSub, { color: colors.muted }]}>Send an invite to join your lineup</Text>
              </View>
              <Pressable
                style={[inviteSheetStyles.closeBtn, { backgroundColor: colors.surface }]}
                onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
            <View style={inviteSheetStyles.fieldBlock}>
              <Text style={[inviteSheetStyles.fieldLabel, { color: colors.muted }]}>EMAIL ADDRESS</Text>
              <TextInput
                style={[inviteSheetStyles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="artist@example.com"
                placeholderTextColor={colors.muted}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={handleInvite}
              />
            </View>
            <View style={inviteSheetStyles.actions}>
              <Pressable
                style={({ pressed }) => [inviteSheetStyles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
              >
                <Text style={[inviteSheetStyles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [inviteSheetStyles.confirmBtn, { opacity: (isInviting || pressed) ? 0.7 : 1 }]}
                onPress={handleInvite}
                disabled={isInviting}
              >
                <MaterialIcons name="person-add" size={16} color="#fff" />
                <Text style={inviteSheetStyles.confirmBtnText}>{isInviting ? 'Sending…' : 'Send Invite'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Invoices Section Component ──────────────────────────────────────────────

import type { Invoice } from '@/lib/types';
import * as Haptics from 'expo-haptics';

function InvoicesSection({ colors, currentUserId, router }: {
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  currentUserId: string;
  router: ReturnType<typeof import('expo-router').useRouter>;
}) {
  const invoices = useInvoiceStore((s) => s.invoices);
  const deleteInvoice = useInvoiceStore((s) => s.deleteInvoice);
  const [expanded, setExpanded] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const sortedInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => inv.managerId === currentUserId && !inv.isDeletedByManager)
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, currentUserId]
  );

  const totalUnread = useMemo(
    () => sortedInvoices.filter((inv) => !inv.isReadByManager).length,
    [sortedInvoices]
  );

  const handleDeleteInvoice = useCallback((id: string, artistName: string) => {
    Alert.alert(
      'Delete Invoice',
      `Delete invoice from ${artistName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteInvoice(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
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
        const filename = `NX_${artistSlug}_${venueSlug}_${day}${mon}${year}.pdf`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        // STORE = no compression, much faster for already-compressed PDFs
        zip.file(filename, base64, { base64: true, compression: 'STORE' });
      }
      // Generate zip without compression for speed
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
      {/* Header */}
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
              : <>
                  <MaterialIcons name="download" size={14} color="#fff" />
                  <Text style={invStyles.downloadAllText}>All</Text>
                </>
            }
          </Pressable>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
        </View>
      </Pressable>
      {/* Invoice list */}
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
      <td>${g.date}</td>
      <td>${g.setName}</td>
      <td>${g.startTime} – ${g.endTime}</td>
      <td style="text-align:right">${g.price.toLocaleString()}</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1a1a1a; }
      h1 { font-size: 28px; margin-bottom: 4px; }
      .inv-num { color: #2563EB; font-size: 16px; margin-bottom: 8px; }
      .date { color: #666; font-size: 14px; margin-bottom: 24px; }
      .parties { display: flex; gap: 40px; margin-bottom: 24px; }
      .party { flex: 1; }
      .party-label { font-size: 10px; font-weight: 700; color: #999; letter-spacing: 1px; margin-bottom: 4px; }
      .party-name { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
      .party-detail { font-size: 12px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #f0f4ff; text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 700; border-bottom: 1px solid #e5e7eb; }
      th:last-child { text-align: right; }
      td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
      td:last-child { text-align: right; font-weight: 600; }
      .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 16px 0; border-top: 2px solid #2563EB; }
      .total-label { font-size: 14px; font-weight: 700; }
      .total-value { font-size: 22px; font-weight: 800; color: #2563EB; }
    </style>
  </head>
  <body>
    <h1>INVOICE</h1>
    <div class="inv-num">${inv.invoiceNumber}</div>
    <div class="date">Date: ${new Date(inv.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <div class="parties">
      <div class="party">
        <div class="party-label">FROM</div>
        <div class="party-name">${inv.artistLegalName}</div>
        ${inv.artistEmail ? `<div class="party-detail">${inv.artistEmail}</div>` : ''}
        ${inv.artistLocation ? `<div class="party-detail">${inv.artistLocation}</div>` : ''}
      </div>
      <div class="party">
        <div class="party-label">TO</div>
        <div class="party-name">${inv.venueLegalName}</div>
        ${inv.venueTrnNumber ? `<div class="party-detail">TRN: ${inv.venueTrnNumber}</div>` : ''}
        ${inv.venueAddress ? `<div class="party-detail">${inv.venueAddress}</div>` : ''}
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Date</th><th>Set</th><th>Time</th><th>AED</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-row">
      <span class="total-label">TOTAL</span>
      <span class="total-value">AED ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </body>
  </html>
  `;
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
  content: { paddingHorizontal: 0, paddingVertical: 0 },
  invoiceCard: { paddingHorizontal: 16, paddingVertical: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, gap: 3 },
  artistNameLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  venueName: { fontSize: 15, fontWeight: '700' },
  sentDateText: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  amountText: { fontSize: 15, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 72, marginLeft: 8, borderRadius: 0 },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '800' },
  headerRight: { flexDirection: 'row', gap: 8 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  profileCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative' },
  heroEditBtn: { position: 'absolute', top: 12, right: 12, zIndex: 1, padding: 4 },
  profileInfo: { flex: 1, gap: 4 },
  name: { fontSize: 22, fontWeight: '800' },
  role: { fontSize: 15, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13 },
  editBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 22, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 14, lineHeight: 21 },
  venuesSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  venueHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  ghostBtnText: { fontSize: 12, fontWeight: '600' },
  addVenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addVenueBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  iconPlusBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyVenuesText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  positionBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  positionText: { fontSize: 11, fontWeight: '700' },
  reorderDot: { width: 10, height: 10, borderRadius: 5 },
  reorderName: { fontSize: 14, fontWeight: '700' },
  reorderType: { fontSize: 11, marginTop: 1 },
  arrowGroup: { flexDirection: 'row', gap: 2 },
  arrowBtn: { padding: 2 },
  venueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5 },
  venueInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700' },
  venueType: { fontSize: 12, marginTop: 1 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountText: { fontSize: 14 },
  settingsBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  settingsBtnText: { fontSize: 15, fontWeight: '600' },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  editProfileBtnText: { fontSize: 15, fontWeight: '700' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  signOutText: { fontSize: 15, fontWeight: '700' },
  // Lineup card
  lineupCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginTop: 8 },
  lineupCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  lineupCardInfo: { flex: 1, gap: 2 },
  lineupCardName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  lineupCardGenre: { fontSize: 13 },
  lineupStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  lineupStatChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lineupStatText: { fontSize: 12, fontWeight: '500' },
  lineupStatDot: { width: 3, height: 3, borderRadius: 2 },
  lineupActionRow: { flexDirection: 'row', borderTopWidth: 0.5 },
  lineupActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  lineupActionBtnText: { fontSize: 13, fontWeight: '600' },
  lineupActionDivider: { width: 0.5, marginVertical: 8 },
  hiddenHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hiddenVenueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5 },
  hiddenVenuePhoto: { width: 36, height: 36, borderRadius: 8 },
  hiddenVenuePhotoPlaceholder: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  unhideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E' + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  unhideBtnText: { color: '#22C55E', fontSize: 12, fontWeight: '700' },
  discoverVenuesBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginTop: 10 },
  discoverVenuesBtnText: { fontSize: 13, fontWeight: '700' },
});

// ─── Lineup Assign Venue sheet styles ────────────────────────────────────────
const lineupSheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0,
    maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetArtistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  venueScrollList: { flexGrow: 0, maxHeight: 380 },
  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  venueRowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  venueRowInfo: { flex: 1 },
  venueRowName: { fontSize: 15, fontWeight: '700' },
  venueRowType: { fontSize: 12, marginTop: 1 },
  removeVenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  removeVenueBtnText: { fontSize: 12, fontWeight: '600' },
  emptyVenues: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 44 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },
});

// ─── Invite Artist floating sheet styles ─────────────────────────────────────
const inviteSheetStyles = StyleSheet.create({
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 260,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderRadius: 24,
    marginHorizontal: 8,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
  },
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingTop: 4, paddingBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  sheetSub: { fontSize: 13, fontWeight: '500' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fieldBlock: { marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 14 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
