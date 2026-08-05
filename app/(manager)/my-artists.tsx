import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { genreLabel } from '@/lib/utils';

export default function MyArtistsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);

  const artists = useMemo(() => {
    return globalLineup
      .filter((r) => r.managerId === currentUser?.id && r.status === 'active')
      .map((r) => ({ user: getArtistUser(r.artistId), profile: getArtistProfile(r.artistId) }))
      .filter((a) => !!a.user)
      .sort((a, b) => (a.user!.fullName ?? '').toLowerCase().localeCompare((b.user!.fullName ?? '').toLowerCase()));
  }, [globalLineup, currentUser?.id, getArtistUser, getArtistProfile]);

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
                  {item.profile?.hasCompletedBooking && (
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
});
