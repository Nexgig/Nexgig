import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput, Keyboard } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useAvailabilityStore, useBookingStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { isPastStart } from '@/lib/utils';
import type { AvailabilityBlock, Booking } from '@/lib/types';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

// Next ~120 days as YYYY-MM-DD, used by the range date dropdowns.
function buildDateOptions(): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 120; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}
const DATE_OPTIONS = buildDateOptions();

function formatDateLabel(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AE', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatDateShort(dateStr: string) {
  if (!dateStr) return 'Select';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Simple UUID generator for Supabase rows
const genUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

// Every YYYY-MM-DD from start..end inclusive
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return [start];
  const cur = new Date(s);
  while (cur <= e) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

type Mode = 'single' | 'range';
type BlockKind = 'block' | 'private_event';

export default function AddBlockScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    date?: string;
    editBlockId?: string;
    editBookingId?: string;
    ev?: string;      // prefill event name (edit private event)
    loc?: string;     // prefill location
    st?: string;      // prefill start
    et?: string;      // prefill end
    fd?: string;      // prefill fullDay '1'|'0'
    kind?: string;    // prefill kind 'block'|'private_event'
  }>();

  const currentUser = useAuthStore((s) => s.currentUser);
  const addBlock = useAvailabilityStore((s) => s.addBlock);
  const deleteBlock = useAvailabilityStore((s) => s.deleteBlock);
  const addBooking = useBookingStore((s) => s.addBooking);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);

  const editBlockId = params.editBlockId ?? null;
  const editBookingId = params.editBookingId ?? null;
  const isEditing = !!(editBlockId || editBookingId);
  const baseDate = params.date ?? new Date().toISOString().slice(0, 10);

  const [mode, setMode] = useState<Mode>('single');
  const [kind, setKind] = useState<BlockKind>((params.kind as BlockKind) || 'block');
  const [eventName, setEventName] = useState(params.ev ?? '');
  const [location, setLocation] = useState(params.loc ?? '');
  const [startTime, setStartTime] = useState(params.st ?? '21:00');
  const [endTime, setEndTime] = useState(params.et ?? '01:00');
  const [fullDay, setFullDay] = useState(params.fd === '1');

  // Range dates
  const [rangeStart, setRangeStart] = useState(baseDate);
  const [rangeEnd, setRangeEnd] = useState(baseDate);

  // Dropdown open states
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [rangeStartOpen, setRangeStartOpen] = useState(false);
  const [rangeEndOpen, setRangeEndOpen] = useState(false);
  const startScrollRef = useRef<ScrollView>(null);
  const endScrollRef = useRef<ScrollView>(null);

  const headerTitle = mode === 'range'
    ? 'Block Dates'
    : formatDateLabel(baseDate);

  const closeSheet = () => { Keyboard.dismiss(); router.back(); };

  const insertBlockRow = (id: string, date: string, s: string, e: string, fd: boolean) => {
    if (!currentUser?.id) return;
    supabase.from('availability_blocks').insert({
      id, artist_id: currentUser.id, date,
      start_time: s, end_time: e, is_full_day: fd, block_type: 'block',
    }).then(({ error }) => { if (error) console.warn('block insert error:', error.message); });
  };

  const handleSave = () => {
    if (!currentUser?.id) { closeSheet(); return; }

    // ── RANGE MODE: full-day block for each day in the span ──
    if (mode === 'range') {
      const days = datesInRange(rangeStart, rangeEnd);
      days.forEach((date) => {
        const id = genUUID();
        const block: AvailabilityBlock = {
          id, artistId: currentUser.id, date,
          startTime: '00:00', endTime: '23:59', fullDay: true,
          label: 'Unavailable', blockType: 'block',
          createdAt: new Date().toISOString(),
        };
        addBlock(block);
        insertBlockRow(id, date, '00:00', '23:59', true);
      });
      closeSheet();
      return;
    }

    // ── SINGLE DAY ──
    const targetDate = baseDate;

    if (kind === 'private_event') {
      if (!eventName.trim()) { Alert.alert('Required', 'Please enter an event name.'); return; }
      if (!fullDay && (!startTime || !endTime)) { Alert.alert('Required', 'Please select start and end time.'); return; }

      if (editBookingId) {
        updateBookingStatus(editBookingId, 'confirmed', {
          slotDate: targetDate,
          slotStartTime: fullDay ? '00:00' : startTime,
          slotEndTime: fullDay ? '23:59' : endTime,
          slotName: eventName.trim(),
          venueName: eventName.trim(),
        });
        // keep availability_blocks row in sync
        supabase.from('availability_blocks').update({
          date: targetDate,
          start_time: fullDay ? '00:00' : startTime,
          end_time: fullDay ? '23:59' : endTime,
          is_full_day: fullDay,
          event_name: eventName.trim(),
          location: location.trim() || null,
        }).eq('id', editBookingId).then(({ error }) => { if (error) console.warn('pe update error:', error.message); });
      } else {
        const isPast = isPastStart(targetDate, fullDay ? '00:00' : startTime);
        const newId = genUUID();
        const newBooking: Booking = {
          id: newId, slotId: 'private-slot-' + Date.now(), venueId: '',
          artistId: currentUser.id, managerId: '', status: 'confirmed',
          isCompleted: isPast, isArtistCreated: true,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          slotDate: targetDate,
          slotStartTime: fullDay ? '00:00' : startTime,
          slotEndTime: fullDay ? '23:59' : endTime,
          slotName: eventName.trim(), venueName: eventName.trim(),
          privateEventLocation: location.trim() || undefined,
        };
        addBooking(newBooking);
        supabase.from('availability_blocks').insert({
          id: newId, artist_id: currentUser.id, date: targetDate,
          start_time: fullDay ? '00:00' : startTime,
          end_time: fullDay ? '23:59' : endTime,
          is_full_day: fullDay, block_type: 'private_event',
          event_name: eventName.trim(), location: location.trim() || null,
        }).then(({ error }) => { if (error) console.warn('availability_blocks insert error:', error.message); });
      }
    } else {
      // block
      if (!fullDay && (!startTime || !endTime)) { Alert.alert('Required', 'Please select start and end time.'); return; }

      if (editBlockId) {
        deleteBlock(editBlockId);
        supabase.from('availability_blocks').delete().eq('id', editBlockId)
          .then(({ error }) => { if (error) console.warn('block delete error:', error.message); });
      }
      const newId = genUUID();
      const block: AvailabilityBlock = {
        id: newId, artistId: currentUser.id, date: targetDate,
        startTime: fullDay ? '00:00' : startTime,
        endTime: fullDay ? '23:59' : endTime,
        fullDay, label: 'Unavailable', blockType: 'block',
        createdAt: new Date().toISOString(),
      };
      addBlock(block);
      insertBlockRow(newId, targetDate, block.startTime, block.endTime, fullDay);
    }

    closeSheet();
  };

  const scrollToTime = (ref: React.RefObject<ScrollView | null>, time: string) => {
    const idx = TIME_OPTIONS.indexOf(time);
    if (idx >= 0 && ref.current) {
      setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, idx * 36 - 72), animated: false }), 80);
    }
  };

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, flex: 1 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{headerTitle}</Text>
        <Pressable style={[styles.closeBtn, { backgroundColor: colors.surface }]} onPress={closeSheet} hitSlop={8}>
          <MaterialIcons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Mode toggle — hidden while editing (edit is always single-day) */}
        {!isEditing && (
          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>WHEN</Text>
            <View style={[styles.segment, { borderColor: colors.border }]}>
              {(['single', 'range'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segmentBtn, mode === m && { backgroundColor: colors.primary }]}
                  onPress={() => { setMode(m); setStartOpen(false); setEndOpen(false); }}
                >
                  <MaterialIcons
                    name={m === 'single' ? 'event' : 'date-range'}
                    size={15}
                    color={mode === m ? '#fff' : colors.muted}
                  />
                  <Text style={[styles.segmentText, { color: mode === m ? '#fff' : colors.muted }]}>
                    {m === 'single' ? 'Single Day' : 'Date Range'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ─────────── RANGE MODE ─────────── */}
        {mode === 'range' && (
          <>
            <Text style={[styles.helperText, { color: colors.muted }]}>
              Block a full range of days — handy when you&apos;re travelling or away.
            </Text>
            <View style={styles.dateRangeRow}>
              {/* FROM */}
              <View style={{ flex: 1, zIndex: rangeStartOpen ? 30 : 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>FROM</Text>
                <Pressable
                  style={[styles.timeDropdownBtn, { borderColor: rangeStartOpen ? colors.primary : colors.border }]}
                  onPress={() => { setRangeStartOpen((v) => !v); setRangeEndOpen(false); }}
                >
                  <MaterialIcons name="calendar-today" size={14} color={rangeStartOpen ? colors.primary : colors.muted} />
                  <Text style={[styles.timeDropdownText, { color: colors.foreground }]} numberOfLines={1}>{formatDateShort(rangeStart)}</Text>
                  <MaterialIcons name={rangeStartOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
                </Pressable>
                {rangeStartOpen && (
                  <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <ScrollView style={styles.dateDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {DATE_OPTIONS.map((d) => {
                        const sel = rangeStart === d;
                        return (
                          <Pressable key={d} style={[styles.timeOption, sel && { backgroundColor: colors.primary + '15' }]} onPress={() => {
                            setRangeStart(d);
                            if (rangeEnd < d) setRangeEnd(d);
                            setRangeStartOpen(false);
                          }}>
                            <Text style={[styles.timeOptionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{formatDateShort(d)}</Text>
                            {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.timeSep}>
                <MaterialIcons name="arrow-forward" size={16} color={colors.muted} />
              </View>

              {/* TO */}
              <View style={{ flex: 1, zIndex: rangeEndOpen ? 30 : 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>TO</Text>
                <Pressable
                  style={[styles.timeDropdownBtn, { borderColor: rangeEndOpen ? colors.primary : colors.border }]}
                  onPress={() => { setRangeEndOpen((v) => !v); setRangeStartOpen(false); }}
                >
                  <MaterialIcons name="calendar-today" size={14} color={rangeEndOpen ? colors.primary : colors.muted} />
                  <Text style={[styles.timeDropdownText, { color: colors.foreground }]} numberOfLines={1}>{formatDateShort(rangeEnd)}</Text>
                  <MaterialIcons name={rangeEndOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
                </Pressable>
                {rangeEndOpen && (
                  <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <ScrollView style={styles.dateDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {DATE_OPTIONS.filter((d) => d >= rangeStart).map((d) => {
                        const sel = rangeEnd === d;
                        return (
                          <Pressable key={d} style={[styles.timeOption, sel && { backgroundColor: colors.primary + '15' }]} onPress={() => { setRangeEnd(d); setRangeEndOpen(false); }}>
                            <Text style={[styles.timeOptionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{formatDateShort(d)}</Text>
                            {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.infoPill, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
              <MaterialIcons name="flight" size={14} color={colors.primary} />
              <Text style={[styles.infoPillText, { color: colors.primary }]}>
                {datesInRange(rangeStart, rangeEnd).length} day{datesInRange(rangeStart, rangeEnd).length !== 1 ? 's' : ''} will be blocked (full day)
              </Text>
            </View>
          </>
        )}

        {/* ─────────── SINGLE DAY MODE ─────────── */}
        {mode === 'single' && (
          <>
            {/* Type toggle: Block / Private Event */}
            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>TYPE</Text>
              <View style={[styles.segment, { borderColor: colors.border }]}>
                {(['block', 'private_event'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.segmentBtn, kind === t && { backgroundColor: colors.primary }]}
                    onPress={() => setKind(t)}
                  >
                    <Text style={[styles.segmentText, { color: kind === t ? '#fff' : colors.muted }]}>
                      {t === 'block' ? 'Block' : 'Private Event'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Private event fields */}
            {kind === 'private_event' && (
              <>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>EVENT NAME *</Text>
                  <View style={[styles.textInputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.textInputField, { color: colors.foreground }]}
                      placeholder="e.g. Wedding, Corporate Party"
                      placeholderTextColor={colors.muted}
                      value={eventName}
                      onChangeText={setEventName}
                      returnKeyType="next"
                    />
                  </View>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>LOCATION (OPTIONAL)</Text>
                  <View style={[styles.textInputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.textInputField, { color: colors.foreground }]}
                      placeholder="e.g. Dubai Marina"
                      placeholderTextColor={colors.muted}
                      value={location}
                      onChangeText={setLocation}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Time pickers + Full Day */}
            <View style={styles.timeRow}>
              {!fullDay && (
                <View style={{ flex: 1, zIndex: startOpen ? 20 : 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>START</Text>
                  <Pressable
                    style={[styles.timeDropdownBtn, { borderColor: startOpen ? colors.primary : colors.border }]}
                    onPress={() => { Keyboard.dismiss(); setStartOpen((v) => !v); setEndOpen(false); }}
                  >
                    <MaterialIcons name="access-time" size={14} color={startOpen ? colors.primary : colors.muted} />
                    <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{startTime}</Text>
                    <MaterialIcons name={startOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
                  </Pressable>
                  {startOpen && (
                    <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <ScrollView ref={startScrollRef} onLayout={() => scrollToTime(startScrollRef, startTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {TIME_OPTIONS.map((t) => {
                          const sel = startTime === t;
                          return (
                            <Pressable key={t} style={[styles.timeOption, sel && { backgroundColor: colors.primary + '15' }]} onPress={() => { setStartTime(t); setStartOpen(false); }}>
                              <Text style={[styles.timeOptionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{t}</Text>
                              {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              {!fullDay && (
                <View style={styles.timeSep}>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.muted} />
                </View>
              )}

              {!fullDay && (
                <View style={{ flex: 1, zIndex: endOpen ? 20 : 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>END</Text>
                  <Pressable
                    style={[styles.timeDropdownBtn, { borderColor: endOpen ? colors.primary : colors.border }]}
                    onPress={() => { Keyboard.dismiss(); setEndOpen((v) => !v); setStartOpen(false); }}
                  >
                    <MaterialIcons name="access-time" size={14} color={endOpen ? colors.primary : colors.muted} />
                    <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{endTime}</Text>
                    <MaterialIcons name={endOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
                  </Pressable>
                  {endOpen && (
                    <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <ScrollView ref={endScrollRef} onLayout={() => scrollToTime(endScrollRef, endTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {TIME_OPTIONS.map((t) => {
                          const sel = endTime === t;
                          return (
                            <Pressable key={t} style={[styles.timeOption, sel && { backgroundColor: colors.primary + '15' }]} onPress={() => { setEndTime(t); setEndOpen(false); }}>
                              <Text style={[styles.timeOptionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{t}</Text>
                              {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              {/* Full Day toggle */}
              <View style={{ alignItems: 'flex-end', justifyContent: 'flex-start', paddingLeft: fullDay ? 0 : 4, flex: fullDay ? 1 : 0 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 6 }]}>FULL DAY</Text>
                <View style={{ height: 42, justifyContent: 'center' }}>
                  <Pressable
                    style={[styles.toggle, fullDay ? { backgroundColor: colors.primary } : { backgroundColor: colors.border }]}
                    onPress={() => setFullDay((v) => !v)}
                  >
                    <View style={[styles.toggleThumb, fullDay ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                  </Pressable>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Actions */}
        <View style={styles.modalActions}>
          <Pressable style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]} onPress={closeSheet}>
            <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]} onPress={handleSave}>
            <MaterialIcons name="check" size={16} color="#fff" />
            <Text style={styles.confirmBtnText}>{isEditing ? 'Update' : 'Save'}</Text>
          </Pressable>
        </View>

        <View style={{ flexGrow: 1, minHeight: 600, backgroundColor: colors.background }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 13, paddingTop: 8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 1, flex: 1, marginRight: 10 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  helperText: { fontSize: 12, marginBottom: 12, lineHeight: 17 },

  // Segmented control (mode + type) — pill style consistent with app
  segment: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, gap: 3 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 7 },
  segmentText: { fontSize: 12, fontWeight: '700' },

  // Date range
  dateRangeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14, alignSelf: 'flex-start' },
  infoPillText: { fontSize: 12, fontWeight: '700' },

  // Text inputs
  textInputBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  textInputField: { fontSize: 13 },

  // Time row + dropdowns (mirror add-slot)
  timeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4, marginTop: 2 },
  timeSep: { paddingTop: 28 },
  timeDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 },
  timeDropdownText: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  timeDropdownAbsolute: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 },
  timeDropdownList: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  timeDropdownScroll: { maxHeight: 160 },
  dateDropdownScroll: { maxHeight: 200 },
  timeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  timeOptionText: { fontSize: 14 },

  // Full day toggle
  toggle: { width: 44, height: 26, borderRadius: 13, padding: 2 },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOff: { alignSelf: 'flex-start' },
  toggleThumbOn: { alignSelf: 'flex-end' },

  // Actions
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 },
  confirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
