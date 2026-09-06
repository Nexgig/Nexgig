import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from '@/lib/rn';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { ScreenContainer } from '@/components/screen-container';
import { VenueFilterHeader } from '@/components/venue-filter-header';
import { useAuthStore, useDraftStore, useSlotStore, useVenueStore, useLineupStore, useVenueFilterStore } from '@/lib/store';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useFormatTime } from '@/lib/conflict-detection';
import { isPastStart } from '@/lib/utils';
import { sendDraftRequest } from '@/lib/gig-requests';

// The "Requests" tab: a full screen listing every drafted artist that hasn't been sent yet — across
// all future slots. Layout mirrors the Roster tab: the SHARED venue-filter header (the same one on
// the calendar/overview) as the title, then a "REQUESTS" label bar. Tick the ones to send and Send.
export default function RequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { formatTime: fmtTime } = useFormatTime();

  const currentUser = useAuthStore((s) => s.currentUser);
  const drafts = useDraftStore((s) => s.drafts);
  const slots = useSlotStore((s) => s.slots);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  // The ONE shared venue filter — set by the header on any of calendar / overview / roster / here.
  const venueId = useVenueFilterStore((s) => s.venueId);

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

  // Scope to the shared venue filter (null = All Venues).
  const items = useMemo(
    () => (venueId ? allItems.filter((i) => i.slot.venueId === venueId) : allItems),
    [allItems, venueId],
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
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Shared venue-filter header (the title) — same one on calendar / overview / roster */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, minHeight: 72 }}>
        <VenueFilterHeader />
      </View>

      {/* REQUESTS label + Select all — mirrors the Roster tab's "ROSTER" bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.muted }}>REQUESTS</Text>
        {items.length > 0 && (
          <Pressable onPress={toggleAll} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 }}>
          <MaterialIcons name="outgoing-mail" size={48} color={colors.border} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>No requests to send</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
            Draft an artist onto a set from the calendar and it'll show up here to send.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
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

      {/* Footer: Send button — always visible, muted until an artist is ticked */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 14,
        borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background,
      }}>
        <Pressable
          onPress={send}
          disabled={selectedCount === 0}
          style={({ pressed }) => [{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: selectedCount > 0 ? colors.primary : colors.border, opacity: pressed && selectedCount > 0 ? 0.85 : 1 }]}
        >
          <Text style={{ color: selectedCount > 0 ? '#fff' : colors.muted, fontSize: 15, fontWeight: '800' }}>
            {selectedCount > 0 ? `Send ${selectedCount} request${selectedCount !== 1 ? 's' : ''}` : 'Send'}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}
