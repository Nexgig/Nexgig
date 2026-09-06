import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from '@/lib/rn';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { useAuthStore, useDraftStore, useSlotStore, useVenueStore, useLineupStore } from '@/lib/store';
import { AvatarImage } from '@/components/ui/avatar-image';
import { VenueFilterRow, type VenueChip } from '@/components/venue-filter-row';
import { useFormatTime } from '@/lib/conflict-detection';
import { isPastStart } from '@/lib/utils';
import { sendDraftRequest } from '@/lib/gig-requests';

// The "Requests" tab: a full screen (not a slide-up) listing every drafted artist that hasn't been
// sent yet — across ALL future slots — with a venue filter (All / one venue). Tick the ones to send
// and hit Send; each becomes a real gig request the artist is notified about (via sendDraftRequest).
export default function RequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { formatTime: fmtTime } = useFormatTime();

  const currentUser = useAuthStore((s) => s.currentUser);
  const drafts = useDraftStore((s) => s.drafts);
  const slots = useSlotStore((s) => s.slots);
  const venues = useVenueStore((s) => s.venues);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  const [venueFilter, setVenueFilter] = useState<string | null>(null);   // null = All venues
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Every future unsent draft of this manager, enriched with slot / artist / venue.
  const allItems = useMemo(() => {
    if (!currentUser) return [];
    return drafts
      .filter((d) => d.managerId === currentUser.id)
      .map((d) => {
        const slot = slots.find((s) => s.id === d.slotId);
        return slot ? { draft: d, slot, key: `${d.slotId}::${d.artistId}` } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !isPastStart(x.slot.date, x.slot.startTime))
      .map((x) => ({ ...x, djUser: getArtistUser(x.draft.artistId), venue: getVenueById(x.slot.venueId) }))
      .sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.startTime.localeCompare(b.slot.startTime));
  }, [drafts, slots, currentUser, getArtistUser, getVenueById]);

  // Chips only for venues that actually have unsent drafts.
  const venueChips: VenueChip[] = useMemo(() => {
    const ids = new Set(allItems.map((i) => i.slot.venueId));
    return venues.filter((v) => ids.has(v.id)).map((v) => ({ id: v.id, name: v.name }));
  }, [allItems, venues]);

  const items = useMemo(
    () => (venueFilter ? allItems.filter((i) => i.slot.venueId === venueFilter) : allItems),
    [allItems, venueFilter],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((i) => { const arr = m.get(i.slot.date) ?? []; arr.push(i); m.set(i.slot.date, arr); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.key));
  const selectedCount = items.filter((i) => selected.has(i.key)).length;

  const toggle = (key: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev);
    items.forEach((i) => { if (allSelected) n.delete(i.key); else n.add(i.key); });
    return n;
  });

  const send = () => {
    if (!currentUser) return;
    const toSend = items.filter((i) => selected.has(i.key));
    if (toSend.length === 0) return;
    Alert.alert(
      'Send Gig Requests?',
      `Send ${toSend.length} gig request${toSend.length !== 1 ? 's' : ''}? The artists will be notified and can accept or decline.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            let sent = 0;
            toSend.forEach((i) => {
              const id = sendDraftRequest({
                slotId: i.slot.id, artistId: i.draft.artistId, managerId: currentUser.id, managerName: currentUser.fullName,
                slot: { venueId: i.slot.venueId, date: i.slot.date, name: i.slot.name, startTime: i.slot.startTime, endTime: i.slot.endTime },
                draftPrice: i.draft.price ?? null, venueName: i.venue?.name ?? null, venueType: i.venue?.venueType ?? null,
              });
              if (id) sent++;
            });
            setSelected(new Set());
            Alert.alert('Sent!', `${sent} gig request${sent !== 1 ? 's' : ''} sent successfully.`);
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.bodyBold, letterSpacing: -0.5, color: colors.foreground }}>Requests</Text>
          {items.length > 0 && (
            <Pressable onPress={toggleAll} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
            </Pressable>
          )}
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
          {allItems.length === 0 ? 'Nothing to send' : `${allItems.length} draft${allItems.length !== 1 ? 's' : ''} waiting to send`}
        </Text>
      </View>

      {/* Venue filter (All / one venue) — hidden when fewer than 2 venues have drafts */}
      <VenueFilterRow venues={venueChips} selectedId={venueFilter} onSelect={setVenueFilter} />

      {/* List */}
      {items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 }}>
          <MaterialIcons name="outgoing-mail" size={48} color={colors.border} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>No requests to send</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
            Draft an artist onto a set from the calendar and it'll show up here to send.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: selectedCount > 0 ? 120 : 24 }} showsVerticalScrollIndicator={false}>
          {byDate.map(([dateStr, group]) => {
            const d = new Date(dateStr + 'T00:00:00');
            const dateLabel = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <View key={dateStr}>
                <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{dateLabel}</Text>
                </View>
                {group.map((item, i) => {
                  const isSelected = selected.has(item.key);
                  const last = i === group.length - 1;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => toggle(item.key)}
                      style={({ pressed }) => [{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 20, paddingVertical: 14,
                        borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border,
                        backgroundColor: isSelected ? colors.primary + '0A' : (pressed ? colors.surface : colors.background),
                      }]}
                    >
                      <View style={{
                        width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      }}>
                        {isSelected && <MaterialIcons name="check" size={13} color="#fff" />}
                      </View>
                      <AvatarImage uri={item.djUser?.profilePhotoUrl} avatarId={(item.djUser as any)?.avatarId} seed={item.djUser?.id} name={item.djUser?.fullName} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }} numberOfLines={1}>{item.djUser?.fullName ?? 'Unknown Artist'}</Text>
                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{item.venue?.name ?? 'Unknown Venue'} · {fmtTime(item.slot.startTime)}–{fmtTime(item.slot.endTime)}</Text>
                      </View>
                      {item.draft.price != null && (
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>AED {item.draft.price.toLocaleString()}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Footer: Send button (only when something's ticked) */}
      {selectedCount > 0 && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 14,
          borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background,
        }}>
          <Pressable
            onPress={send}
            style={({ pressed }) => [{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Send {selectedCount} request{selectedCount !== 1 ? 's' : ''}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
