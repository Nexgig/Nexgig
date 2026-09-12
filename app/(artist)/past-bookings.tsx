import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, LayoutAnimation } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { computePastMonths } from '@/lib/artist-past-months';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function PastBookings() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const venues = useVenueStore((s) => s.venues);

  const curYear = String(new Date().getFullYear());
  const pastMonths = useMemo(
    () => computePastMonths(allBookings.filter((b) => b.artistId === currentUser?.id), slots, venues),
    [allBookings, slots, venues, currentUser?.id]
  );

  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const toggleMonth = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenMonths((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };
  // Second level: expand a venue (within a month) to see each individual gig. Keyed `month:venue`.
  const [openVenues, setOpenVenues] = useState<Set<string>>(new Set());
  const toggleVenue = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenVenues((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={6}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Past bookings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {pastMonths.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="event-note" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>No past bookings yet</Text>
          </View>
        ) : (
          pastMonths.map((m) => {
            const isOpen = openMonths.has(m.key);
            const hasFee = m.earnings > 0;
            const shortLabel = m.key.slice(0, 4) === curYear ? m.label.replace(/\s\d{4}$/, '') : m.label;
            return (
              <View key={m.key}>
                <View style={[styles.earnInsetDivider, { backgroundColor: colors.border }]} />
                <Pressable style={({ pressed }) => [styles.earnMonthRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => toggleMonth(m.key)}>
                  <Text style={[styles.earnMonthLabel, { color: colors.foreground }]} numberOfLines={1}>{shortLabel}</Text>
                  <Text style={[styles.earnMonthGigs, { color: colors.muted }]}>{m.gigCount} gig{m.gigCount !== 1 ? 's' : ''}</Text>
                  <MaterialIcons name={isOpen ? 'expand-more' : 'chevron-right'} size={20} color={colors.muted} />
                </Pressable>
                {isOpen && (
                  <>
                    {m.venues.map((v) => {
                      const vKey = m.key + ':' + v.key;
                      const vOpen = openVenues.has(vKey);
                      return (
                        <View key={v.key}>
                          <Pressable style={({ pressed }) => [styles.histVenueRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => toggleVenue(vKey)}>
                            <Text style={[styles.histVenueName, { color: colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                            <Text style={[styles.histVenueGigs, { color: colors.muted }]}>{v.gigCount} gig{v.gigCount !== 1 ? 's' : ''}</Text>
                            <Text style={[styles.histVenueAmount, { color: colors.muted }]}>{v.earnings > 0 ? `AED ${v.earnings.toLocaleString()}` : '—'}</Text>
                            <MaterialIcons name={vOpen ? 'expand-more' : 'chevron-right'} size={18} color={colors.muted} />
                          </Pressable>
                          {vOpen && v.gigs.map((g) => (
                            <Pressable
                              key={g.id}
                              style={({ pressed }) => [styles.histGigRow, { opacity: pressed ? 0.6 : 1 }]}
                              onPress={() => router.push(('/(artist)/booking-detail?id=' + g.id) as any)}
                            >
                              <Text style={[styles.histGigDate, { color: colors.foreground }]} numberOfLines={1}>
                                {g.date ? formatDate(g.date) : 'Date unknown'}{g.startTime ? ` · ${formatTime(g.startTime)}–${formatTime(g.endTime)}` : ''}
                              </Text>
                              <Text style={[styles.histGigAmount, { color: colors.muted }]}>{g.earnings > 0 ? `AED ${g.earnings.toLocaleString()}` : '—'}</Text>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}
                    <View style={[styles.histTotalRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.histTotalLabel, { color: colors.muted }]}>Total</Text>
                      <Text style={[styles.histTotalAmount, { color: hasFee ? colors.foreground : colors.muted }]}>{hasFee ? `AED ${m.earnings.toLocaleString()}` : '—'}</Text>
                    </View>
                    <View style={styles.venueBottomPad} />
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
  earnInsetDivider: { height: StyleSheet.hairlineWidth * 2 },
  earnMonthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  earnMonthLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  earnMonthGigs: { fontSize: 14 },
  histVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingTop: 12 },
  venueBottomPad: { height: 12 },
  histVenueName: { flex: 1, fontSize: 14 },
  histVenueGigs: { fontSize: 13 },
  histVenueAmount: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
  histGigRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 18, paddingTop: 10 },
  histGigDate: { flex: 1, fontSize: 13 },
  histGigAmount: { fontSize: 13, fontWeight: '600' },
  histTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  histTotalLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  histTotalAmount: { fontSize: 16, fontWeight: '800' },
});
