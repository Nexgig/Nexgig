import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';
import { supabase } from '@/lib/supabase';

type Application = {
  id: string;
  artist_id: string;
  venue_id: string;
  status: string;
  created_at: string;
  artist: {
    full_name: string;
    primary_genre: string;
    based_in: string;
    profile_photo_url: string;
  } | null;
  venue: {
    name: string;
  } | null;
};

export default function ExploreScreen() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    if (!currentUser) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from('applications')
      .select('id, artist_id, venue_id, status, created_at')
      .eq('manager_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const artistIds = data.map((a) => a.artist_id);
      const venueIds = data.map((a) => a.venue_id);

      const { data: artistsData } = await supabase
        .from('artists')
        .select('id, full_name, primary_genre, based_in, profile_photo_url')
        .in('id', artistIds);

      const { data: venuesData } = await supabase
        .from('venues')
        .select('id, name')
        .in('id', venueIds);

      const artistMap = Object.fromEntries((artistsData ?? []).map((a) => [a.id, a]));
      const venueMap = Object.fromEntries((venuesData ?? []).map((v) => [v.id, v]));

      const enriched = data.map((app) => ({
        ...app,
        artist: artistMap[app.artist_id] ?? null,
        venue: venueMap[app.venue_id] ?? null,
      }));

      setApplications(enriched as any);
    }

    setIsLoading(false);
  };

  const handleAccept = async (app: Application) => {
    Alert.alert(
      'Accept Application',
      `Accept ${app.artist?.full_name} for ${app.venue?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            if (!currentUser) return;
            setProcessingId(app.id);

            const { error } = await supabase
              .from('applications')
              .update({ status: 'accepted', updated_at: new Date().toISOString() })
              .eq('id', app.id);

            if (error) {
              setProcessingId(null);
              Alert.alert('Error', error.message);
              return;
            }

            // Add to global lineup
            const { error: lineupError } = await supabase.from('global_lineup').upsert({
              manager_id: currentUser.id,
              artist_id: app.artist_id,
              status: 'active',
            }, { onConflict: 'manager_id,artist_id' });
            console.log('lineup error:', JSON.stringify(lineupError));

            // Add to venue assignments
            const { error: vaError } = await supabase.from('venue_assignments').upsert({
              manager_id: currentUser.id,
              artist_id: app.artist_id,
              venue_id: app.venue_id,
              status: 'active',
            }, { onConflict: 'venue_id,artist_id' });
            console.log('venue assignment error:', JSON.stringify(vaError));

            // Update local store immediately
            const lineupStore = useLineupStore.getState();
            lineupStore.addArtistUser({
              id: app.artist_id,
              email: '',
              phone: '',
              accountType: 'artist' as const,
              fullName: app.artist?.full_name ?? '',
              username: undefined,
              profilePhotoUrl: app.artist?.profile_photo_url ?? undefined,
              isPhoneVerified: false,
              isEmailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            lineupStore.addToGlobalLineup({
              id: `${currentUser.id}-${app.artist_id}`,
              managerId: currentUser.id,
              artistId: app.artist_id,
              status: 'active' as const,
              addedAt: new Date().toISOString(),
            });
            lineupStore.assignToVenue({
              id: `va-${app.venue_id}-${app.artist_id}`,
              globalLineupId: `${currentUser.id}-${app.artist_id}`,
              venueId: app.venue_id,
              artistId: app.artist_id,
              assignedAt: new Date().toISOString(),
              status: 'active' as const,
            });
            setProcessingId(null);
            setApplications((prev) => prev.filter((a) => a.id !== app.id));
            Alert.alert('Accepted!', `${app.artist?.full_name} has been added to your lineup.`);
          },
        },
      ]
    );
  };

  const handleDecline = async (app: Application) => {
    Alert.alert(
      'Decline Application',
      `Decline ${app.artist?.full_name} for ${app.venue?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(app.id);
            const { error } = await supabase
              .from('applications')
              .update({ status: 'declined', updated_at: new Date().toISOString() })
              .eq('id', app.id);
            setProcessingId(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setApplications((prev) => prev.filter((a) => a.id !== app.id));
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.foreground }]}>Applications</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Artists applying to your venues</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={applications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialIcons name="inbox" size={48} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Applications</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Artists who apply to your venues will appear here
              </Text>
            </View>
          }
          renderItem={({ item: app }) => {
            const isProcessing = processingId === app.id;
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <AvatarImage uri={app.artist?.profile_photo_url} name={app.artist?.full_name ?? ''} size={48} />
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {app.artist?.full_name ?? 'Unknown Artist'}
                    </Text>
                    <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                      {app.artist?.primary_genre ?? 'Artist'}{app.artist?.based_in ? ` · ${app.artist.based_in}` : ''}
                    </Text>
                    <Text style={[styles.cardVenue, { color: colors.primary }]} numberOfLines={1}>
                      → {app.venue?.name ?? 'Unknown Venue'}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.declineBtn, { borderColor: colors.border }]}
                    onPress={() => handleDecline(app)}
                    disabled={isProcessing}
                  >
                    <Text style={[styles.declineBtnText, { color: colors.muted }]}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleAccept(app)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14, gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 13, marginBottom: 2 },
  cardVenue: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  declineBtnText: { fontSize: 14, fontWeight: '600' },
  acceptBtn: {
    flex: 1, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});