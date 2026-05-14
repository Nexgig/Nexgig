import { useMemo, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, Image, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useVenueStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { Venue } from '@/lib/types';

export default function VenuesScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const reorderVenues = useVenueStore((s) => s.reorderVenues);
  const getAssignmentsByVenue = useLineupStore((s) => s.getAssignmentsByVenue);

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  // ── Reorder state ──────────────────────────────────────────────────────────
  const [isReordering, setIsReordering] = useState(false);
  const [orderedVenues, setOrderedVenues] = useState<Venue[]>([]);

  const enterReorder = useCallback(() => {
    setOrderedVenues([...venues]);
    setIsReordering(true);
  }, [venues]);

  const saveReorder = useCallback(() => {
    reorderVenues(orderedVenues.map((v) => v.id));
    setIsReordering(false);
  }, [reorderVenues, orderedVenues]);

  const cancelReorder = useCallback(() => {
    setIsReordering(false);
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setOrderedVenues((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setOrderedVenues((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  // ── Normal venue card ──────────────────────────────────────────────────────
  const renderVenue = ({ item }: { item: Venue }) => {
    const lineupCount = getAssignmentsByVenue(item.id).length;
    return (
      <Pressable
        style={({ pressed }) => [styles.venueCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
        onPress={() => router.push(('/(manager)/venue-detail?id=' + item.id) as Href)}
      >
        {item.photoUrls[0] ? (
          <Image source={{ uri: item.photoUrls[0] }} style={styles.venuePhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.venuePhotoPlaceholder, { backgroundColor: colors.navy }]}>
            <MaterialIcons name="business" size={32} color="#2563EB" />
          </View>
        )}
        <View style={styles.venueContent}>
          <View style={styles.venueHeader}>
            <View style={styles.venueTitleRow}>
              <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
              {item.isHidden && <StatusBadge status="hidden" />}
            </View>
            <Text style={[styles.venueType, { color: colors.muted }]}>{item.venueType}</Text>
          </View>
          <View style={styles.venueFooter}>
            <View style={styles.venueMetaItem}>
              <MaterialIcons name="location-on" size={14} color={colors.muted} />
              <Text style={[styles.venueMeta, { color: colors.muted }]} numberOfLines={1}>
                {item.googleMapsLocation?.address ?? 'No location'}
              </Text>
            </View>
            <View style={styles.venueMetaItem}>
              <MaterialIcons name="group" size={14} color={colors.muted} />
              <Text style={[styles.venueMeta, { color: colors.muted }]}>{lineupCount} DJs</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} style={styles.chevron} />
      </Pressable>
    );
  };

  // ── Reorder row ────────────────────────────────────────────────────────────
  const renderReorderRow = (item: Venue, index: number, total: number) => (
    <View
      key={item.id}
      style={[styles.reorderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Position number */}
      <View style={[styles.positionBadge, { backgroundColor: colors.primary + '20' }]}>
        <Text style={[styles.positionText, { color: colors.primary }]}>{index + 1}</Text>
      </View>
      {/* Venue color dot */}
      <View style={[styles.reorderDot, { backgroundColor: item.color ?? colors.primary }]} />
      {/* Venue info */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.reorderName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.reorderType, { color: colors.muted }]} numberOfLines={1}>{item.venueType}</Text>
      </View>
      {/* Up / Down arrows */}
      <View style={styles.arrowGroup}>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, { opacity: (pressed || index === 0) ? 0.35 : 1 }]}
          onPress={() => moveUp(index)}
          disabled={index === 0}
        >
          <MaterialIcons name="keyboard-arrow-up" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, { opacity: (pressed || index === total - 1) ? 0.35 : 1 }]}
          onPress={() => moveDown(index)}
          disabled={index === total - 1}
        >
          <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Venues</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {venues.length > 1 && !isReordering && (
            <Pressable
              style={({ pressed }) => [styles.reorderBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={enterReorder}
            >
              <MaterialIcons name="swap-vert" size={18} color={colors.foreground} />
              <Text style={[styles.reorderBtnText, { color: colors.foreground }]}>Reorder</Text>
            </Pressable>
          )}
          {isReordering ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={cancelReorder}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.8 : 1 }]}
                onPress={saveReorder}
              >
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push('/(manager)/create-venue' as Href)}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.addBtnText}>New Venue</Text>
            </Pressable>
          )}
        </View>
      </View>

      {isReordering ? (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.reorderHint, { color: colors.muted }]}>
            Use the arrows to set your preferred order. This applies everywhere in the app.
          </Text>
          {orderedVenues.map((item, index) =>
            renderReorderRow(item, index, orderedVenues.length)
          )}
        </ScrollView>
      ) : (
        <FlatList
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
          data={venues}
          keyExtractor={(item) => item.id}
          renderItem={renderVenue}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="business"
              title="No venues yet"
              subtitle="Create your first venue to start managing bookings and lineups."
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  title: { fontSize: 22, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  reorderBtnText: { fontSize: 14, fontWeight: '600' },
  cancelBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  list: { padding: 20, gap: 14, flexGrow: 1 },
  // Normal card
  venueCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  venuePhoto: { width: 80, height: 80 },
  venuePhotoPlaceholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  venueContent: { flex: 1, padding: 14, gap: 8 },
  venueHeader: { gap: 2 },
  venueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  venueName: { fontSize: 16, fontWeight: '700', flex: 1 },
  venueType: { fontSize: 13 },
  venueFooter: { flexDirection: 'row', gap: 14 },
  venueMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueMeta: { fontSize: 12 },
  chevron: { marginRight: 12 },
  // Reorder mode
  reorderHint: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  reorderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14,
  },
  positionBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  positionText: { fontSize: 13, fontWeight: '800' },
  reorderDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  reorderName: { fontSize: 15, fontWeight: '700' },
  reorderType: { fontSize: 12, marginTop: 2 },
  arrowGroup: { flexDirection: 'column', alignItems: 'center', gap: 0, marginRight: -4 },
  arrowBtn: { padding: 4 },
});
