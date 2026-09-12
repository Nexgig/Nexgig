import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, LayoutAnimation, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { computePastMonths } from '@/lib/artist-past-months';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { venueImageFor } from '@/lib/venue-images';

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

  // Expand a venue (within a month) to see each individual gig. Keyed `month:venue`.
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
          pastMonths.map((m, mi) => {
            const hasFee = m.earnings > 0;
            const shortLabel = m.key.slice(0, 4) === curYear ? m.label.replace(/\s\d{4}$/, '') : m.label;
            return (
              <View key={m.key}>
                {mi > 0 && <View style={[styles.monthSep, { backgroundColor: colors.surface }]} />}

                {/* Month header — name + N gigs · N venues on the left, the total on the right. */}
                <View style={styles.monthHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.monthName, { color: colors.foreground }]} numberOfLines={1}>{shortLabel}</Text>
                    <Text style={[styles.monthSub, { color: colors.muted }]}>
                      {m.gigCount} gig{m.gigCount !== 1 ? 's' : ''} · {m.venues.length} venue{m.venues.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.monthTotal, { color: hasFee ? colors.foreground : colors.muted }]}>
                    {hasFee ? `AED ${m.earnings.toLocaleString()}` : '—'}
                  </Text>
                </View>

                {m.venues.map((v, vi) => {
                  const vKey = m.key + ':' + v.key;
                  const vOpen = openVenues.has(vKey);
                  const isPrivate = v.key === '__private__';
                  const venueObj = isPrivate ? undefined : venues.find((vn) => vn.id === v.key);
                  return (
                    <View key={v.key}>
                      {vi > 0 && <View style={[styles.venueDivider, { backgroundColor: colors.border }]} />}
                      <Pressable style={({ pressed }) => [styles.venueRow, { opacity: pressed ? 0.7 : 1 }]} onPress={() => toggleVenue(vKey)}>
                        {isPrivate ? (
                          <View style={[styles.thumb, styles.privateThumb, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.pbText, { color: colors.primary }]}>PB</Text>
                          </View>
                        ) : (
                          <Image source={venueImageFor(venueObj)} style={styles.thumb} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                          <Text style={[styles.venueGigs, { color: colors.muted }]}>{v.gigCount} gig{v.gigCount !== 1 ? 's' : ''}</Text>
                        </View>
                        <Text style={[styles.venueAmount, { color: colors.foreground }]}>{v.earnings > 0 ? `AED ${v.earnings.toLocaleString()}` : '—'}</Text>
                        <MaterialIcons name={vOpen ? 'expand-less' : 'chevron-right'} size={22} color={colors.muted} />
                      </Pressable>
                      {vOpen && v.gigs.map((g) => (
                        <Pressable
                          key={g.id}
                          style={({ pressed }) => [styles.gigRow, { opacity: pressed ? 0.6 : 1 }]}
                          onPress={() => router.push(('/(artist)/booking-detail?id=' + g.id) as any)}
                        >
                          <Text style={[styles.gigDate, { color: colors.foreground }]} numberOfLines={1}>
                            {g.date ? formatDate(g.date) : 'Date unknown'}{g.name ? ` · ${g.name}` : g.startTime ? ` · ${formatTime(g.startTime)}–${formatTime(g.endTime)}` : ''}
                          </Text>
                          <Text style={[styles.gigAmount, { color: colors.muted }]}>{g.earnings > 0 ? `AED ${g.earnings.toLocaleString()}` : '—'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
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
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },

  // Full-bleed soft band between months.
  monthSep: { height: 10, marginHorizontal: -20, marginVertical: 10 },

  monthHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 8, paddingBottom: 8 },
  monthName: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, marginBottom: 3 },
  monthSub: { fontSize: 14 },
  monthTotal: { fontSize: 18, fontWeight: '800' },

  venueDivider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  privateThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pbText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  venueName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  venueGigs: { fontSize: 14 },
  venueAmount: { fontSize: 16, fontWeight: '700' },

  gigRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 60, paddingVertical: 8 },
  gigDate: { flex: 1, fontSize: 14 },
  gigAmount: { fontSize: 14, fontWeight: '500' },
});
