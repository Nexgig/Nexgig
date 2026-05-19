import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, Alert, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useAuthStore, useVenueStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export default function InviteArtistScreen() {
  const router = useRouter();
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);

  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id],
  );

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [showAssignSheet, setShowAssignSheet] = useState(false);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [inviteId, setInviteId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async () => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    Alert.alert('Required', 'Please enter an email address.');
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    Alert.alert('Invalid Email', 'Please enter a valid email address.');
    return;
  }

  setIsLoading(true);

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    setIsLoading(false);
    Alert.alert('Error', 'Not authenticated. Please sign in again.');
    return;
  }

  const { data, error } = await supabase.from('invites').insert({
    manager_id: user.id,
    artist_email: trimmed,
    status: 'pending',
  }).select().single();

  if (error) {
    setIsLoading(false);
    Alert.alert('Error sending invite', error.message);
    return;
  }

  // ✅ Send invite email via Edge Function
  await supabase.functions.invoke('send-invite-email', {
    body: {
      artist_email: trimmed,
      manager_name: currentUser?.fullName ?? 'A manager',
      invite_id: data.id,
    },
  });

  setIsLoading(false);
  setInviteId(data.id);
  setInvitedEmail(trimmed);
  setSelectedVenueIds([]);
  setEmail('');
  setShowAssignSheet(true);
};

  ;

  const toggleVenue = (venueId: string) => {
    setSelectedVenueIds((prev) =>
      prev.includes(venueId) ? prev.filter((id) => id !== venueId) : [...prev, venueId],
    );
  };

  const handleAssignDone = async () => {
    // ✅ Save venue assignments to Supabase if any selected
    if (selectedVenueIds.length > 0 && inviteId) {
      const rows = selectedVenueIds.map((venueId) => ({
        invite_id: inviteId,
        venue_id: venueId,
      }));
      const { error } = await supabase.from('invite_venues').insert(rows);
      if (error) {
        Alert.alert('Warning', 'Invite sent but venue assignment failed: ' + error.message);
      }
    }

    setShowAssignSheet(false);
    const count = selectedVenueIds.length;
    const venueText = count > 0
      ? `They'll be assigned to ${count} venue${count > 1 ? 's' : ''} once they join.`
      : '';
    Alert.alert(
      'Invite Sent!',
      `An invitation has been sent to ${invitedEmail}. ${venueText}`.trim(),
    );
  };

  const handleSkip = () => {
    setShowAssignSheet(false);
    Alert.alert(
      'Invite Sent!',
      `An invitation has been sent to ${invitedEmail}.`,
    );
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Add Artist</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Enter the artist's email address. They'll receive an invite to join your lineup.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>Email Address</Text>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="artist@example.com"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.sendBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
          onPress={handleSend}
          disabled={isLoading}
        >
          <MaterialIcons name="person-add" size={20} color="#fff" />
          <Text style={styles.sendBtnText}>{isLoading ? 'Sending…' : 'Send Invite'}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showAssignSheet}
        transparent
        animationType="slide"
        onRequestClose={handleSkip}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIconBg, { backgroundColor: colors.primary + '18' }]}>
                <MaterialIcons name="check-circle" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Invite Sent!</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]} numberOfLines={1}>
                  Pre-assign a venue for {invitedEmail}
                </Text>
              </View>
              <Pressable onPress={handleSkip} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[styles.sheetHint, { color: colors.muted }]}>
              Select the venues you'd like to assign this artist to once they join. You can skip this and assign later.
            </Text>

            {venues.length === 0 ? (
              <View style={styles.emptyVenues}>
                <MaterialIcons name="location-off" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No venues yet</Text>
              </View>
            ) : (
              <FlatList
                data={venues}
                keyExtractor={(v) => v.id}
                style={styles.venueList}
                scrollEnabled={venues.length > 5}
                renderItem={({ item }) => {
                  const selected = selectedVenueIds.includes(item.id);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.venueRow,
                        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '10' : colors.surface, opacity: pressed ? 0.8 : 1 },
                      ]}
                      onPress={() => toggleVenue(item.id)}
                    >
                      <View style={[styles.venueDot, { backgroundColor: item.color ?? colors.primary }]} />
                      <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.venueType ? (
                        <Text style={[styles.venueType, { color: colors.muted }]} numberOfLines={1}>
                          {item.venueType}
                        </Text>
                      ) : null}
                      <View style={[
                        styles.checkbox,
                        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' },
                      ]}>
                        {selected && <MaterialIcons name="check" size={14} color="#fff" />}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}

            <View style={styles.sheetActions}>
              <Pressable
                style={({ pressed }) => [styles.assignBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleAssignDone}
              >
                <MaterialIcons name="add-business" size={18} color="#fff" />
                <Text style={styles.assignBtnText}>
                  {selectedVenueIds.length > 0
                    ? `Assign to ${selectedVenueIds.length} Venue${selectedVenueIds.length > 1 ? 's' : ''}`
                    : 'Done'}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.skipBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={handleSkip}
              >
                <Text style={[styles.skipBtnText, { color: colors.muted }]}>Skip for now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start', padding: 4 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 20, marginBottom: 32 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 16,
  },
  sendBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sheetIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSubtitle: { fontSize: 13, marginTop: 2 },
  sheetHint: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  venueList: { maxHeight: 280, marginBottom: 20 },
  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  venueDot: { width: 10, height: 10, borderRadius: 5 },
  venueName: { flex: 1, fontSize: 15, fontWeight: '600' },
  venueType: { fontSize: 12, maxWidth: 90 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emptyVenues: { alignItems: 'center', paddingVertical: 32, gap: 8, marginBottom: 20 },
  emptyText: { fontSize: 14 },
  sheetActions: { gap: 10 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  assignBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  skipBtnText: { fontSize: 15, fontWeight: '500' },
});