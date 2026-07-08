// ─── Avatar picker ────────────────────────────────────────────────────────
// A modal grid of the bundled avatar set (lib/avatars.ts). Tap one to select;
// the current choice gets a coral ring. Used by edit-profile + signup so users
// who don't want to upload a real photo can pick an avatar instead.
// Pure JS, no native deps → ships OTA.

import { Modal, View, Text, Pressable, Image, ScrollView, StyleSheet } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { AVATAR_IDS, AVATAR_SOURCES, type AvatarId } from '@/lib/avatars';

interface AvatarPickerProps {
  visible: boolean;
  /** Currently-selected avatar id, if any (gets the coral ring). */
  selectedId?: string | null;
  /** User picked an avatar → apply it. */
  onSelect: (id: AvatarId) => void;
  /** Dismiss without changing. */
  onClose: () => void;
}

const GAP = 14;
const TILE = 68;

export function AvatarPicker({ visible, selectedId, onSelect, onClose }: AvatarPickerProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Choose an Avatar</Text>
          <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {AVATAR_IDS.map((id) => {
            const isSelected = id === selectedId;
            return (
              <Pressable
                key={id}
                onPress={() => onSelect(id)}
                style={({ pressed }) => [styles.tileWrap, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View
                  style={[
                    styles.tile,
                    { borderColor: isSelected ? colors.primary : 'transparent', borderWidth: isSelected ? 3 : 0 },
                  ]}
                >
                  <Image source={AVATAR_SOURCES[id as AvatarId]} style={styles.avatar} />
                </View>
                {isSelected ? (
                  <View style={[styles.check, { backgroundColor: colors.primary }]}>
                    <MaterialIcons name="check" size={13} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  title: { fontSize: 17, fontWeight: '700' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GAP,
    paddingHorizontal: 20, paddingVertical: 24, justifyContent: 'center',
  },
  tileWrap: { width: TILE, height: TILE, position: 'relative' },
  tile: { width: TILE, height: TILE, borderRadius: TILE / 2, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  check: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
});
