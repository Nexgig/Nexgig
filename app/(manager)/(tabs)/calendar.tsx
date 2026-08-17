import { VenueFilterRow } from '@/components/venue-filter-row';
import { VenueFilterHeader } from '@/components/venue-filter-header';
import { useRoleSwitching } from '@/lib/roles';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, FlatList, Keyboard, TouchableWithoutFeedback, Platform, Dimensions, PanResponder, Animated as RNAnimated, RefreshControl } from '@/lib/rn';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
// react-native-reanimated Animated not used in this file (using RNAnimated from react-native instead)
// TimeSelector removed — using dropdown time picker instead
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useSlotStore, useBookingStore, useLineupStore, useDraftStore, useNotificationStore, useCalendarJumpStore, useVenueFilterStore, useCalendarSelectionStore, useCalendarBulkStore } from '@/lib/store';
import { fonts } from '@/lib/fonts';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastStart, isUpcoming, nowLocalDateTimeStr, displayStatus, isExpiredRequest, firstName } from '@/lib/utils';
import { ensureScheduleSlots } from '@/lib/venue-schedule-sync';
import { persistGigRequestBooking } from '@/lib/gig-requests';
import type { Slot, Booking } from '@/lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_MONTH_START_DAY, STORAGE_KEY_SHOW_LINEUP_BALANCE, STORAGE_KEY_DEFAULT_CALENDAR_VIEW, STORAGE_KEY_LINEUP_STATUSES, LINEUP_STATUS_DEFAULT, type LineupStatusFilter } from '@/app/(manager)/settings';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { syncBookingStatus } from '@/lib/booking-sync';

// Monday-first day labels
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// 30-minute interval time options for the dropdown picker (covers full 24h cycle)
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

// Preset slot names with auto-filled times
const SLOT_PRESETS = [
  { name: 'Day',    start: '13:00', end: '17:00' },
  { name: 'Sunset', start: '17:00', end: '21:00' },
  { name: 'Night',  start: '21:00', end: '01:00' },
] as const;

// Top-level view: monthly calendar, weekly list, or today-only
type CalendarMode = 'month' | 'week' | 'today';
// Venue filter: 'all' = show all venues, otherwise a specific venueId
type VenueFilter = 'all' | string;

// Get Monday as start of week
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days; otherwise go back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Convert JS getDay() (0=Sun) to Monday-first index (0=Mon)
function toMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function CalendarScreen() {
  const router = useRouter();
  const colors = useColors();
  // Drops the RefreshControl during a role switch — unmounting one with the group
  // crashes natively. See useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // The saved default view
  const [defaultCalendarView, setDefaultCalendarView] = useState<CalendarMode>('month');
  // Track whether the default view has already been applied (only apply once per app session)
  const defaultViewApplied = useRef(false);
  // Venue filter: 'all' or a specific venueId
  // Shared venue filter (dashboard/calendar/roster). Derived so the existing
  // `venueFilter !== 'all'` checks keep working; the header title (VenueFilterHeader) sets it.
  const sharedVenueId = useVenueFilterStore((s) => s.venueId);
  const venueFilter: VenueFilter = sharedVenueId ?? 'all';
  const allSlots = useSlotStore((s) => s.slots);
  const addSlot = useSlotStore((s) => s.addSlot);
  const bulkAddSlots = useSlotStore((s) => s.bulkAddSlots);
  const updateSlot = useSlotStore((s) => s.updateSlot);
  const deleteSlot = useSlotStore((s) => s.deleteSlot);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getSlotsByMonth = useSlotStore((s) => s.getSlotsByMonth);
  const allDrafts = useDraftStore((s) => s.drafts);
  const getDraftBySlot = useDraftStore((s) => s.getDraftBySlot);
  const getDraftsBySlot = useDraftStore((s) => s.getDraftsBySlot);
  const removeDraftByDJ = useDraftStore((s) => s.removeDraftByDJ);
  const removeDraft = useDraftStore((s) => s.removeDraft);
  const getDraftCountPerDJ = useDraftStore((s) => s.getDraftCountPerDJ);
  const sendAllDrafts = useDraftStore((s) => s.sendAllDrafts);
  const sendDraftsBySlotIds = useDraftStore((s) => s.sendDraftsBySlotIds);
  const sendDraftByDJ = useDraftStore((s) => s.sendDraftByDJ);
  const addBooking = useBookingStore((s) => s.addBooking);
  const allBookings = useBookingStore((s) => s.bookings);
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromCalendar = useBookingStore((s) => s.hideFromCalendar);
  const hideFromManagerCalendar = useBookingStore((s) => s.hideFromManagerCalendar);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getGlobalLineupByManager = useLineupStore((s) => s.getGlobalLineupByManager);
  const getBookingBySlot = useBookingStore((s) => s.getBookingBySlot);
  const getBookingsBySlot = useBookingStore((s) => s.getBookingsBySlot);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const addNotification = useNotificationStore((s) => s.addNotification);
  // Thin wrapper over the shared persistGigRequestBooking (lib/gig-requests) — the pick
  // screens (add-slot / assign-artist) use the same helper, so the booking row shape stays
  // in lockstep. Signature kept so the call sites below don't change.
  const saveBookingToSupabase = (bookingId: string, slotId: string, venueId: string, artistId: string, slotDate: string, slotName: string, slotStartTime: string, slotEndTime: string, venueName: string | null) =>
    persistGigRequestBooking({
      bookingId, slotId, venueId, artistId, managerId: currentUser?.id ?? '',
      slotDate, slotName, slotStartTime, slotEndTime, venueName,
      venueType: getVenueById(venueId)?.venueType ?? null,
    });

  const clearSlots = useSlotStore((s) => s.clearSlots);
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);

  const handleCalendarRefresh = useCallback(async () => {
    if (!currentUser) return;
    setCalendarRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [slotsRes] = await Promise.all([
        supabase.from('slots').select('*').eq('manager_id', user.id),
      ]);
      if (slotsRes.data) {
        clearSlots();
        slotsRes.data.forEach((s: any) => addSlot({ id: s.id, venueId: s.venue_id, name: s.name, date: s.date, startTime: s.start_time, endTime: s.end_time, createdAt: s.created_at }));
      }
    }
    setCalendarRefreshing(false);
  }, [currentUser]);

  // Auto-cleanup: delete the manager's PAST slots that have no real booking
  // (i.e. empty or draft-only). Reads authoritative Supabase data — NOT the local
  // store — so it can never wrongly delete history slots before bookings have loaded.
  // A slot is KEPT if it has any booking with status requested / past_confirmation /
  // confirmed / completed / expired.
  const sweepPastEmptySlots = useCallback(async () => {
    if (!currentUser) return;
    const { data: slotRows } = await supabase.from('slots').select('id, date, start_time').eq('manager_id', currentUser.id);
    if (!slotRows) return;
    const pastIds = slotRows.filter((s: any) => isPastStart(s.date, s.start_time)).map((s: any) => s.id);
    if (pastIds.length === 0) return;
    const { data: bks, error: bkErr } = await supabase.from('bookings').select('slot_id, status, hidden_from_manager_calendar').in('slot_id', pastIds);
    // If the bookings read failed we know nothing — deleting on a failed read would be
    // destroying slots we simply couldn't see. Do nothing and try again next focus.
    if (bkErr) { console.warn('sweep past slots (bookings read):', bkErr.message); return; }
    // Keep a slot as long as it still has ANY booking the manager hasn't dismissed — regardless
    // of status. A cancelled/declined booking stays visible (with its ✕) until the manager
    // clears it; only once dismissed (hidden_from_manager_calendar) does the slot become sweepable.
    // Before, cancelled/declined were excluded from the keep-set, so a fresh cancellation on a
    // gig whose start had just passed was deleted out from under the manager before they saw it.
    const keepSlotIds = new Set((bks ?? []).filter((b: any) => !b.hidden_from_manager_calendar).map((b: any) => b.slot_id));
    // Also protect any slot the LOCAL store knows has a non-dismissed booking or a draft on it. A
    // booking written moments ago may not be readable yet; the sweep must not race the write and
    // delete the slot out from under it.
    const localBookings = useBookingStore.getState().bookings;
    const localDrafts = useDraftStore.getState().drafts;
    const toDelete = pastIds.filter((id: string) =>
      !keepSlotIds.has(id) &&
      !localBookings.some((b) => b.slotId === id && !b.hiddenFromManagerCalendar) &&
      !localDrafts.some((d) => d.slotId === id)
    );
    if (toDelete.length === 0) return;
    const { error } = await supabase.from('slots').delete().in('id', toDelete);
    if (error) { console.warn('sweep past slots:', error.message); return; }
    toDelete.forEach((id: string) => deleteSlot(id));
  }, [currentUser, deleteSlot]);

  useFocusEffect(
    useCallback(() => {
      sweepPastEmptySlots();
    }, [sweepPastEmptySlots])
  );
  const managerVenueIds = useMemo(() => venues.map((v) => v.id), [venues]);
  // Hidden ("deleted") venues for this manager. Their completed gigs must stay on the
  // calendar, so we still render their slots — but ONLY ones that already have a booking
  // (history), never empty future slots, so a removed venue adds no clutter.
  const hiddenVenueIds = useMemo(
    () => new Set(allVenues.filter((v) => v.managerId === currentUser?.id && v.isHidden).map((v) => v.id)),
    [allVenues, currentUser?.id]
  );
  const allManagerSlots = useMemo(
    () => allSlots.filter((s) => {
      if (managerVenueIds.includes(s.venueId)) return true;
      if (hiddenVenueIds.has(s.venueId)) return allBookings.some((b) => b.slotId === s.id);
      return false;
    }),
    [allSlots, managerVenueIds, hiddenVenueIds, allBookings]
  );
  const monthSlots = useMemo(() => {
    if (venueFilter !== 'all') return allSlots.filter((s) => s.venueId === venueFilter);
    return allManagerSlots;
  }, [allSlots, venueFilter, allManagerSlots]);

  const today = new Date();
  // Use LOCAL date, not UTC. toISOString() returns UTC, so after local midnight
  // (e.g. 1 AM in Dubai, UTC+4) it still reports the previous day — which made the
  // manager calendar show "today" a day behind the artist side. formatDateStr reads
  // local getFullYear/Month/Date, matching the artist calendar.
  const todayStr = formatDateStr(today);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // Publish the selected day so the center tab-bar "+" can add a slot on it (see _layout).
  const setSharedCalendarDate = useCalendarSelectionStore((s) => s.setSelectedDate);
  useEffect(() => { setSharedCalendarDate(selectedDate); }, [selectedDate, setSharedCalendarDate]);

  // Week view state
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  // Day view state — starts on today, can navigate between days
  const [viewedDayStr, setViewedDayStr] = useState(todayStr);

  // Create/Edit slot modal
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [createSlotVenueId, setCreateSlotVenueId] = useState('');
  const [createSlotDate, setCreateSlotDate] = useState(todayStr);
  const [slotForm, setSlotForm] = useState({ name: '', startTime: '21:00', endTime: '01:00' });
  // Dropdown time picker open state
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  // Merged Add-Set sheet mode: 'single' = one slot, 'multiple' = bulk templates.
  // A ref mirrors the state so the swipe-down pan responder (created once) can read
  // the current mode without being recreated — swipe-to-dismiss only in single mode
  // so the bulk body's ScrollView can scroll freely in multiple mode.
  const [slotSheetMode, setSlotSheetMode] = useState<'single' | 'multiple'>('single');
  const slotSheetModeRef = useRef<'single' | 'multiple'>('single');
  const setSlotMode = (m: 'single' | 'multiple') => { slotSheetModeRef.current = m; setSlotSheetMode(m); };
  const startTimeScrollRef = useRef<ScrollView>(null);
  const endTimeScrollRef = useRef<ScrollView>(null);

  // Scroll time dropdown to current selection (each option is ~36px)
  const scrollToTimeOption = (ref: React.RefObject<ScrollView | null>, time: string) => {
    const idx = TIME_OPTIONS.indexOf(time);
    if (idx >= 0 && ref.current) {
      setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, idx * 36 - 72), animated: false }), 80);
    }
  };

  // Swipe-down-to-dismiss for Add Slot modal
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const HEADER_HEIGHT = insets.top + 53;
  // Partial height: leave calendar header + month title + week row visible (~230px from top)
  const MONTH_TITLE_OFFSET = HEADER_HEIGHT + 190;
  const slotModalHeight = SCREEN_HEIGHT - MONTH_TITLE_OFFSET;
  const slotModalTranslateY = useRef(new RNAnimated.Value(0)).current;
  const slotPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => slotSheetModeRef.current === 'single' && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_, g) => { if (g.dy > 0) slotModalTranslateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          RNAnimated.timing(slotModalTranslateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
            setShowSlotModal(false);
            setEditingSlot(null);
            slotModalTranslateY.setValue(0);
          });
        } else {
          RNAnimated.spring(slotModalTranslateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Bulk Add Sets modal
  type BulkSlotTemplate = { id: string; name: string; startTime: string; endTime: string };
  const [bulkVenueIds, setBulkVenueIds] = useState<string[]>([]);
  const [bulkDays, setBulkDays] = useState<number[]>([]); // 0=Mon,1=Tue,...,6=Sun
  const [bulkTemplates, setBulkTemplates] = useState<BulkSlotTemplate[]>([
    { id: '1', name: '', startTime: '20:00', endTime: '00:00' },
  ]);
  const [bulkStartOpen, setBulkStartOpen] = useState<string | null>(null); // template id
  const [bulkEndOpen, setBulkEndOpen] = useState<string | null>(null); // template id
  const [bulkIsWeekMode, setBulkIsWeekMode] = useState(false);

  // Slot action menu
  const [activeSlotMenu, setActiveSlotMenu] = useState<string | null>(null);

  // Send booking action sheet (new bulk send modal)
  const [showSendSheet, setShowSendSheet] = useState(false);
  // Selected draft keys for bulk send: "slotId::artistId"
  const [selectedDraftKeys, setSelectedDraftKeys] = useState<Set<string>>(new Set());
  // Venue filter INSIDE the send sheet, so a manager can send for one venue at a time.
  const [sendVenueFilter, setSendVenueFilter] = useState<string | null>(null);

  // Lineup Balance panel state
  const [lineupBalanceOpen, setLineupBalanceOpen] = useState(false);
  const [showLineupBalance, setShowLineupBalance] = useState(false);   // off by default; managers opt in
  const [lineupStatuses, setLineupStatuses] = useState<LineupStatusFilter[]>(LINEUP_STATUS_DEFAULT);
  // Custom month-cycle start day — loaded from AsyncStorage (set in Settings screen)
  const [monthStartDay, setMonthStartDay] = useState(1);

  // On every focus: sync monthStartDay, showLineupBalance, and the saved default view label.
  // calendarMode (the active view) is only set from the default on FIRST mount —
  // after that the user's in-session choice is preserved when navigating between tabs.
  // If a pendingDate was set (via Show on Calendar), jump to that date in month view.
  useFocusEffect(
    useCallback(() => {
      const pending = useCalendarJumpStore.getState().pendingDate;
      if (pending) {
        const d = new Date(pending + 'T00:00:00');
        setCalendarMode('month');
        setCurrentMonth(d.getMonth());
        setCurrentYear(d.getFullYear());
        setSelectedDate(pending);
        useCalendarJumpStore.getState().setPendingDate(null);
      }
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [msd, slb, dcv, ls] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_MONTH_START_DAY),
          AsyncStorage.getItem(STORAGE_KEY_SHOW_LINEUP_BALANCE),
          AsyncStorage.getItem(STORAGE_KEY_DEFAULT_CALENDAR_VIEW),
          AsyncStorage.getItem(STORAGE_KEY_LINEUP_STATUSES),
        ]);
        if (!active) return;
        if (msd !== null) setMonthStartDay(Number(msd));
        if (slb !== null) setShowLineupBalance(slb !== 'false');
        if (ls !== null) {
          try {
            const parsed = JSON.parse(ls) as LineupStatusFilter[];
            if (Array.isArray(parsed) && parsed.length > 0) setLineupStatuses(parsed);
          } catch { /* ignore */ }
        }
        if (dcv !== null) {
          const mapped: CalendarMode = 'month';   // week/day views removed — month only
          // Always keep the toggle order in sync with the saved default
          setDefaultCalendarView(mapped);
          // Only apply the default to the active view on the very first mount
          if (!defaultViewApplied.current) {
            setCalendarMode(mapped);
            defaultViewApplied.current = true;
          }
        } else {
          if (!defaultViewApplied.current) {
            setCalendarMode('month');
            defaultViewApplied.current = true;
          }
        }
        setSettingsLoaded(true);
      })();
      return () => { active = false; };
    }, [])
  );



  // Venue color lookup — always reads fresh from allVenues (no memoization)
  const getVenueColor = useCallback((venueId: string): string => {
    const v = allVenues.find((venue) => venue.id === venueId);
    return v?.color ?? colors.primary;
  }, [allVenues]);

  // ─── Week View Helpers ────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const days: { date: Date; dateStr: string; dayName: string; dayShort: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateStr(d);
      const mondayIdx = toMondayIndex(d.getDay());
      days.push({ date: d, dateStr, dayName: DAYS_FULL[mondayIdx], dayShort: DAYS_SHORT[mondayIdx], isToday: dateStr === todayStr });
    }
    return days;
  }, [weekStart, todayStr]);

  const weekLabel = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    return `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekDays]);

  const getSlotsForDateAll = (dateStr: string) => {
    const base = venueFilter !== 'all'
      ? allManagerSlots.filter((s) => s.venueId === venueFilter)
      : allManagerSlots;
    return base.filter((s) => s.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  // ─── Month View Helpers ───────────────────────────────────────────────────
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  // Monday-first: get offset for first day of month (0=Mon, 6=Sun)
  const getFirstDayOffset = (month: number, year: number) => {
    const jsDay = new Date(year, month, 1).getDay();
    return toMondayIndex(jsDay);
  };
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOffset = getFirstDayOffset(currentMonth, currentYear);

  const getMonthDateString = (day: number) => {
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${currentYear}-${m}-${d}`;
  };

  const getSlotsForDate = (date: string) => monthSlots.filter((s) => s.date === date);

  const selectedSlots = useMemo(() => {
    const daySlots = getSlotsForDate(selectedDate);
    return daySlots.sort((a, b) => {
      const venueA = getVenueById(a.venueId)?.name ?? '';
      const venueB = getVenueById(b.venueId)?.name ?? '';
      if (venueA !== venueB) return venueA.localeCompare(venueB);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [selectedDate, monthSlots]);

  // Generic helper: group any array of slots by venue (sorted by store venue order)
  const groupSlotsByVenue = useCallback((slots: Slot[]) => {
    const venueMap = new Map<string, Slot[]>();
    for (const slot of slots) {
      const existing = venueMap.get(slot.venueId);
      if (existing) existing.push(slot);
      else venueMap.set(slot.venueId, [slot]);
    }
    const groups: { venueId: string; venueName: string; slots: Slot[] }[] = [];
    for (const [venueId, venueSlots] of venueMap) {
      const venue = getVenueById(venueId);
      groups.push({ venueId, venueName: venue?.name ?? 'Unknown', slots: venueSlots });
    }
    const venueOrder = venues.map((v) => v.id);
    return groups.sort((a, b) => {
      const ia = venueOrder.indexOf(a.venueId);
      const ib = venueOrder.indexOf(b.venueId);
      if (ia === -1 && ib === -1) return a.venueName.localeCompare(b.venueName);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [getVenueById, venues]);

  const slotsByVenue = useMemo(() => {
    const groups: { venueId: string; venueName: string; slots: Slot[] }[] = [];
    const venueMap = new Map<string, Slot[]>();
    for (const slot of selectedSlots) {
      const existing = venueMap.get(slot.venueId);
      if (existing) existing.push(slot);
      else venueMap.set(slot.venueId, [slot]);
    }
    for (const [venueId, venueSlots] of venueMap) {
      const venue = getVenueById(venueId);
      groups.push({ venueId, venueName: venue?.name ?? 'Unknown', slots: venueSlots });
    }
    const venueOrder = venues.map((v) => v.id);
    return groups.sort((a, b) => {
      const ia = venueOrder.indexOf(a.venueId);
      const ib = venueOrder.indexOf(b.venueId);
      if (ia === -1 && ib === -1) return a.venueName.localeCompare(b.venueName);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [selectedSlots, getVenueById, venues]);

  // ─── Lineup Balance Data ──────────────────────────────────────────────────
  // Compute the monthly period boundaries respecting the custom monthStartDay
  // Standard calendar month bounds — always 1st to last day of the displayed month.
  // Used for: calendar dots, Send modal, slot display, draft counts.
  // monthStartDay does NOT affect this — it only affects Lineup Balance.
  const standardMonthBounds = useMemo(() => {
    const m = String(currentMonth + 1).padStart(2, '0');
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    return {
      start: `${currentYear}-${m}-01`,
      end: `${currentYear}-${m}-${String(lastDay).padStart(2, '0')}`,
      label: `${MONTHS[currentMonth]} ${currentYear}`,
    };
  }, [currentMonth, currentYear]);

  // Auto-fill the visible month from each venue's weekly programme (materialize-on-view).
  // Idempotent + only inserts missing nights, so it's safe to run on every month change.
  const scheduleSig = useMemo(
    () => JSON.stringify(venues.map((v) => [v.id, v.schedule ?? []])),
    [venues]
  );
  useEffect(() => {
    // Only materialise schedule nights from TODAY forward (like the dashboard). Filling the whole
    // month from the 1st re-created PAST empty schedule slots, which sweepPastEmptySlots then
    // deleted — so past schedule slots flickered in and out on every month change.
    const from = standardMonthBounds.start > todayStr ? standardMonthBounds.start : todayStr;
    if (from <= standardMonthBounds.end) ensureScheduleSlots(from, standardMonthBounds.end);
  }, [standardMonthBounds.start, standardMonthBounds.end, scheduleSig]);

  // Custom period bounds — respects monthStartDay. Used ONLY for Lineup Balance.
  const monthPeriodBounds = useMemo(() => {
    // If monthStartDay is 1, it's the standard calendar month
    if (monthStartDay === 1) {
      const m = String(currentMonth + 1).padStart(2, '0');
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      return {
        start: `${currentYear}-${m}-01`,
        end: `${currentYear}-${m}-${String(lastDay).padStart(2, '0')}`,
        label: `${MONTHS[currentMonth]} ${currentYear}`,
      };
    }
    // Custom cycle: from monthStartDay of PREVIOUS month to (monthStartDay - 1) of CURRENT month
    // e.g. monthStartDay=21, viewing May → Apr 21 to May 20
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const clampedStartDay = Math.min(monthStartDay, prevMonthLastDay);
    const startDate = new Date(currentYear, currentMonth - 1, clampedStartDay);
    // End: (monthStartDay - 1) of current month, clamped to last valid day of current month
    const curMonthLastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const endDay = Math.min(monthStartDay - 1, curMonthLastDay);
    const endDate = new Date(currentYear, currentMonth, endDay);
    const startLabel = `${MONTHS[startDate.getMonth()].slice(0, 3)} ${startDate.getDate()}`;
    const endLabel = `${MONTHS[endDate.getMonth()].slice(0, 3)} ${endDate.getDate()}, ${endDate.getFullYear()}`;
    return {
      start: formatDateStr(startDate),
      end: formatDateStr(endDate),
      label: `${startLabel} – ${endLabel}`,
    };
  }, [monthStartDay, currentMonth, currentYear]);

  const lineupPeriodLabel = useMemo(() => {
    if (calendarMode === 'week') return weekLabel;
    if (calendarMode === 'today') {
      const d = new Date(viewedDayStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }
    // Month view: use custom period bounds so the label reflects the monthStartDay setting
    return monthPeriodBounds.label;
  }, [calendarMode, weekLabel, monthPeriodBounds, viewedDayStr]);

  // Venue name for Send Bookings dialog
  const sendBookingsVenueName = venueFilter !== 'all'
    ? (venues.find((v) => v.id === venueFilter)?.name ?? 'this venue')
    : 'all venues';

  // Today's date string — must be defined before lineupRows so Today view date comparisons work
  const todayDateStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const nowDT = nowLocalDateTimeStr();

  const lineupRows = useMemo(() => {
    if (!currentUser) return [];
    const lineupEntries = getGlobalLineupByManager(currentUser.id);

    // Build a slot-date lookup for quick access
    const slotDateMap: Record<string, string> = {};
    allSlots.forEach((s) => { slotDateMap[s.id] = s.date; });

    // Determine the date range for the active view
    let periodStart: string;
    let periodEnd: string;
    if (calendarMode === 'week') {
      periodStart = formatDateStr(weekDays[0].date);
      periodEnd = formatDateStr(weekDays[6].date);
    } else if (calendarMode === 'today') {
      periodStart = viewedDayStr;
      periodEnd = viewedDayStr;
    } else {
      periodStart = monthPeriodBounds.start;
      periodEnd = monthPeriodBounds.end;
    }

    // Count gigs per artist in the period — respects lineupStatuses filter
    const gigCounts: Record<string, number> = {};

    // 1. Drafts (only if 'draft' is in the active filter)
    if (lineupStatuses.includes('draft')) {
      allDrafts
        .filter((d) => d.managerId === currentUser.id)
        .forEach((d) => {
          const date = slotDateMap[d.slotId];
          if (date && date >= periodStart && date <= periodEnd) {
            gigCounts[d.artistId] = (gigCounts[d.artistId] ?? 0) + 1;
          }
        });
    }

    // 2. Bookings — filter by selected statuses, avoid double-counting draft slots
    const draftSlotIds = lineupStatuses.includes('draft')
      ? new Set(allDrafts.filter((d) => d.managerId === currentUser.id).map((d) => d.slotId))
      : new Set<string>();
    const allowedBookingStatuses = (['requested', 'confirmed', 'completed'] as const)
      .filter((s) => lineupStatuses.includes(s));
    if (allowedBookingStatuses.length > 0) {
      allBookings
        .filter((b) => b.managerId === currentUser.id && allowedBookingStatuses.includes(b.status as any))
        .forEach((b) => {
          if (draftSlotIds.has(b.slotId)) return; // already counted as draft
          const date = slotDateMap[b.slotId];
          if (date && date >= periodStart && date <= periodEnd) {
            gigCounts[b.artistId] = (gigCounts[b.artistId] ?? 0) + 1;
          }
        });
    }

    return lineupEntries
      .map((entry) => {
        const user = getArtistUser(entry.artistId);
        if (!user) return null;
        return { artistId: entry.artistId, user, gigCount: gigCounts[entry.artistId] ?? 0 };
      })
      .filter((row): row is { artistId: string; user: NonNullable<ReturnType<typeof getArtistUser>>; gigCount: number } => row !== null && row.gigCount > 0)
      .sort((a, b) => b.gigCount - a.gigCount || a.user.fullName.localeCompare(b.user.fullName));
  }, [currentUser, allDrafts, allBookings, allSlots, calendarMode, weekDays, monthPeriodBounds, getGlobalLineupByManager, getArtistUser, lineupStatuses, todayDateStr, viewedDayStr]);

  // Period-aware draft count for the Send Bookings button
  const periodDraftSlotIds = useMemo(() => {
    if (!currentUser) return [];
    const managerDrafts = allDrafts.filter((d) => d.managerId === currentUser.id);
    return managerDrafts.filter((d) => {
      const slot = allSlots.find((s) => s.id === d.slotId);
      if (!slot) return false;
      if (isPastStart(slot.date, slot.startTime)) return false; // exclude past slots
      if (calendarMode === 'week') {
        const weekStartStr = weekDays[0]?.dateStr ?? '';
        const weekEndStr = weekDays[6]?.dateStr ?? '';
        const inWeek = slot.date >= weekStartStr && slot.date <= weekEndStr;
        if (!inWeek) return false;
        if (venueFilter !== 'all') return slot.venueId === venueFilter;
        return true;
      }
      if (calendarMode === 'today') {
        if (slot.date !== viewedDayStr) return false;
        if (venueFilter !== 'all') return slot.venueId === venueFilter;
        return true;
      }
      // month mode
      const inPeriod = slot.date >= standardMonthBounds.start && slot.date <= standardMonthBounds.end;
      if (!inPeriod) return false;
      if (venueFilter !== 'all') return slot.venueId === venueFilter;
      return true;
    }).map((d) => d.slotId);
  }, [currentUser, allDrafts, allSlots, calendarMode, weekDays, venueFilter, standardMonthBounds, nowDT, viewedDayStr]);
  const managerDraftCount = periodDraftSlotIds.length;

  // Total draft count across ALL venues and ALL (future) months — drives the header
  // "Send N" button. Not scoped to the visible month: sending should clear every pending
  // draft, not just the ones on screen. Past slots are excluded (auto-cleaned up).
  const totalPeriodDraftCount = useMemo(() => {
    if (!currentUser) return 0;
    const managerDrafts = allDrafts.filter((d) => d.managerId === currentUser.id);
    return managerDrafts.filter((d) => {
      const slot = allSlots.find((s) => s.id === d.slotId);
      if (!slot) return false;
      if (isPastStart(slot.date, slot.startTime)) return false; // exclude past slots
      return true;
    }).length;
  }, [currentUser, allDrafts, allSlots, nowDT]);

  // Draft list for the bulk send modal — ALL future drafts (every month), narrowed only by
  // the calendar's venue filter. The header button pre-selects this whole set.
  const periodScopedDrafts = useMemo(() => {
    if (!currentUser) return [];
    return allDrafts
      .filter((d) => {
        if (d.managerId !== currentUser.id) return false;
        const slot = allSlots.find((s) => s.id === d.slotId);
        if (!slot) return false;
        if (isPastStart(slot.date, slot.startTime)) return false; // exclude past slots — they are auto-cleaned up
        if (venueFilter !== 'all' && slot.venueId !== venueFilter) return false;
        return true;
      })
      .map((d) => {
        const slot = allSlots.find((s) => s.id === d.slotId)!;
        const djUser = getArtistUser(d.artistId);
        const venue = getVenueById(slot.venueId);
        return { draft: d, slot, djUser, venue, key: `${d.slotId}::${d.artistId}` };
      })
      .sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.startTime.localeCompare(b.slot.startTime));
  }, [currentUser, allDrafts, allSlots, nowDT, venueFilter, calendarMode, weekDays, standardMonthBounds, getArtistUser, getVenueById, viewedDayStr]);

  // Drafts grouped by date for the bulk send modal
  const periodDraftsByDate = useMemo(() => {
    const map: Record<string, typeof periodScopedDrafts> = {};
    for (const item of periodScopedDrafts) {
      if (!map[item.slot.date]) map[item.slot.date] = [];
      map[item.slot.date].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [periodScopedDrafts]);

  // Send-sheet venue filter: chips of the venues that have drafts, and the drafts narrowed
  // to the chosen one. `sendVenueFilter` is null = All.
  const sendVenueChips = useMemo(() => {
    const m = new Map<string, string>();
    periodScopedDrafts.forEach((d) => { if (d.slot.venueId) m.set(d.slot.venueId, d.venue?.name ?? 'Venue'); });
    return [...m].map(([id, name]) => ({ id, name }));
  }, [periodScopedDrafts]);
  const modalDrafts = useMemo(
    () => sendVenueFilter ? periodScopedDrafts.filter((d) => d.slot.venueId === sendVenueFilter) : periodScopedDrafts,
    [periodScopedDrafts, sendVenueFilter]
  );
  const modalDraftsByDate = useMemo(() => {
    const map: Record<string, typeof modalDrafts> = {};
    for (const item of modalDrafts) {
      if (!map[item.slot.date]) map[item.slot.date] = [];
      map[item.slot.date].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [modalDrafts]);

  // Context subtitle for the send modal header
  const sendModalSubtitle = useMemo(() => {
    if (calendarMode === 'today') {
      const d = new Date(viewedDayStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (calendarMode === 'week') {
      const s = weekDays[0]?.dateStr ?? '';
      const e = weekDays[6]?.dateStr ?? '';
      if (s && e) {
        const sd = new Date(s + 'T00:00:00');
        const ed = new Date(e + 'T00:00:00');
        return `Week of ${sd.toLocaleDateString('default', { month: 'short', day: 'numeric' })} – ${ed.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`;
      }
      return 'This Week';
    }
    return `${MONTHS[currentMonth]} ${currentYear}`;
  }, [calendarMode, weekDays, currentMonth, currentYear, viewedDayStr]);

  // Per-venue draft groups for the send action sheet — covers ALL future drafts regardless of period
  const venuesDraftGroups = useMemo(() => {
    if (!currentUser) return [];
    const futureDrafts = allDrafts.filter((d) => {
      if (d.managerId !== currentUser.id) return false;
      const slot = allSlots.find((s) => s.id === d.slotId);
      return slot && isUpcoming(slot.date, slot.startTime);
    });
    const venueMap = new Map<string, Set<string>>();
    for (const d of futureDrafts) {
      const slot = allSlots.find((s) => s.id === d.slotId);
      if (!slot) continue;
      const existing = venueMap.get(slot.venueId);
      if (existing) existing.add(slot.id);
      else venueMap.set(slot.venueId, new Set([slot.id]));
    }
    return Array.from(venueMap.entries()).map(([venueId, slotIdSet]) => ({
      venueId,
      venueName: getVenueById(venueId)?.name ?? 'Unknown',
      slotIds: Array.from(slotIdSet),
      draftCount: slotIdSet.size,
    })).sort((a, b) => {
      const venueOrder = venues.map((v) => v.id);
      const ia = venueOrder.indexOf(a.venueId);
      const ib = venueOrder.indexOf(b.venueId);
      if (ia === -1 && ib === -1) return a.venueName.localeCompare(b.venueName);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [currentUser, allDrafts, allSlots, nowDT, getVenueById, venues]);

  // ─── Slot CRUD Handlers ───────────────────────────────────────────────────────────────
  const openCreateSlot = (date: string, venueId?: string) => {
    setEditingSlot(null);
    setCreateSlotDate(date);
    // Pre-select: explicit venueId arg > active venue filter > first venue
    const preselect = venueId ?? (venueFilter !== 'all' ? venueFilter : venues[0]?.id ?? '');
    setCreateSlotVenueId(preselect);
    setSlotForm({ name: '', startTime: '21:00', endTime: '01:00' });
    setStartTimeOpen(false);
    setEndTimeOpen(false);
    // Initialize the "Multiple Sets" (bulk) fields too, so the in-sheet toggle is ready.
    // Scope follows the active view: week view → week mode (pre-select its 7 days), else month mode.
    const weekMode = calendarMode === 'week';
    setBulkIsWeekMode(weekMode);
    setBulkVenueIds(venues.length === 1 ? [venues[0].id] : (preselect ? [preselect] : []));
    if (weekMode) {
      const days: number[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const jsDay = d.getDay();
        days.push(jsDay === 0 ? 6 : jsDay - 1);
      }
      setBulkDays(days);
    } else {
      setBulkDays([]);
    }
    setBulkTemplates([{ id: '1', name: '', startTime: '20:00', endTime: '00:00' }]);
    setBulkStartOpen(null);
    setBulkEndOpen(null);
    setSlotMode('single');
    router.push(('/(manager)/add-slot?date=' + date + (preselect ? '&venueId=' + preselect : '')) as Href);
  };

  // Open the (existing) Add Set modal directly in multiple/bulk mode.
  // Repurposed from the old calendar 'create venue' button.
  const openMultipleSlots = () => {
    const preselect = venueFilter !== 'all' ? venueFilter : (venues[0]?.id ?? '');
    const weekMode = calendarMode === 'week';
    setBulkIsWeekMode(weekMode);
    setBulkVenueIds(venues.length === 1 ? [venues[0].id] : (preselect ? [preselect] : []));
    if (weekMode) {
      const days: number[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const jsDay = d.getDay();
        days.push(jsDay === 0 ? 6 : jsDay - 1);
      }
      setBulkDays(days);
    } else {
      setBulkDays([]);
    }
    setBulkTemplates([{ id: '1', name: '', startTime: '20:00', endTime: '00:00' }]);
    setBulkStartOpen(null);
    setBulkEndOpen(null);
    setSlotMode('multiple');
    setShowSlotModal(true);
  };

  // The center "+" → "Add Multiple Slots" flips a flag and jumps here; open the bulk sheet.
  const bulkPending = useCalendarBulkStore((s) => s.pending);
  const clearBulk = useCalendarBulkStore((s) => s.clearBulk);
  useEffect(() => {
    if (bulkPending) { clearBulk(); openMultipleSlots(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkPending]);

  const openEditSlot = (slot: Slot) => {
    setEditingSlot(slot);
    setCreateSlotDate(slot.date);
    setCreateSlotVenueId(slot.venueId);
    setSlotForm({ name: slot.name, startTime: slot.startTime, endTime: slot.endTime });
    setStartTimeOpen(false);
    setEndTimeOpen(false);
    setSlotMode('single');
    setShowSlotModal(true);
    setActiveSlotMenu(null);
  };

  const handleSaveSlot = async (assignNow = false) => {
  const targetVenueId = createSlotVenueId || (venueFilter !== 'all' ? venueFilter : '');
  if (!targetVenueId) { Alert.alert('Required', 'Please select a venue.'); return; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { Alert.alert('Error', 'Not authenticated.'); return; }

  if (editingSlot) {
    // ✅ Update slot in Supabase
    const { error } = await supabase.from('slots').update({
      name: slotForm.name,
      start_time: slotForm.startTime,
      end_time: slotForm.endTime,
      updated_at: new Date().toISOString(),
    }).eq('id', editingSlot.id);

    if (error) { Alert.alert('Error updating slot', error.message); return; }

    updateSlot(editingSlot.id, { name: slotForm.name, startTime: slotForm.startTime, endTime: slotForm.endTime });
    setShowSlotModal(false);
    setEditingSlot(null);
    setSlotForm({ name: '', startTime: '21:00', endTime: '01:00' });
    setCreateSlotVenueId('');
  } else {
    const targetDate = (calendarMode === 'week' || calendarMode === 'today') ? createSlotDate : selectedDate;

    // ✅ Insert slot into Supabase
    const { data: slotData, error } = await supabase.from('slots').insert({
      venue_id: targetVenueId,
      manager_id: user.id,
      name: slotForm.name,
      date: targetDate,
      start_time: slotForm.startTime,
      end_time: slotForm.endTime,
      status: 'open',
    }).select().single();

    if (error) { Alert.alert('Error creating slot', error.message); return; }

    const newSlot: Slot = {
      id: slotData.id,
      venueId: targetVenueId,
      name: slotForm.name,
      date: targetDate,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      createdAt: new Date().toISOString(),
    };

    addSlot(newSlot);
    setShowSlotModal(false);
    setEditingSlot(null);
    setSlotForm({ name: '', startTime: '21:00', endTime: '01:00' });
    setCreateSlotVenueId('');

    if (assignNow || isPastStart(targetDate, slotForm.startTime)) {
      router.push(`/(manager)/assign-artist?slotId=${slotData.id}` as Href);
    }
  }
};

  const handleDeleteSlot = (slot: Slot) => {
    setActiveSlotMenu(null);
    Alert.alert(
      'Delete Slot',
      'Are you sure you want to delete this slot? Any associated bookings will be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
  const { error } = await supabase.from('slots').delete().eq('id', slot.id);
  if (error) { Alert.alert('Error deleting slot', error.message); return; }
  deleteSlot(slot.id);
}},
      ]
    );
  };

  // Delete a slot with no confirmation (used by the empty-slot Delete button on the card).
  const deleteSlotNow = async (slot: Slot) => {
    const { error } = await supabase.from('slots').delete().eq('id', slot.id);
    if (error) { Alert.alert('Error deleting slot', error.message); return; }
    deleteSlot(slot.id);
  };

  // Dismiss a cancelled / declined / expired booking (swipe-to-delete on a dead row) — hides it
  // from the manager, and from the artist too if the artist cancelled. Same as the day sheet's X.
  const dismissBooking = (b: Booking) => {
    hideFromManagerCalendar(b.id);
    const syncFields: any = { hiddenFromManagerCalendar: true };
    if (b.cancelledByArtist) syncFields.hiddenFromCalendar = true;
    syncBookingStatus(b.id, b.status as any, syncFields);
    // Clearing a dead booking clears the WHOLE slot — don't fall back to a "Needs artist" empty
    // slot. Keep the slot only if something else still lives on it (another non-hidden booking or a draft).
    if (b.slotId) {
      const others = useBookingStore.getState().bookings.some((x) => x.slotId === b.slotId && x.id !== b.id && !x.hiddenFromManagerCalendar);
      const hasDraft = useDraftStore.getState().drafts.some((d) => d.slotId === b.slotId);
      if (!others && !hasDraft) {
        deleteSlot(b.slotId);
        supabase.from('slots').delete().eq('id', b.slotId).then(({ error }) => { if (error) console.warn('dismiss slot delete:', error.message); });
      }
    }
  };

  // Send all drafts on a slot (one confirmation, then send each). Used by the Send button on the card.
  const sendSlotDrafts = (slot: Slot) => {
    if (!currentUser) return;
    const bookingsForSlot = getBookingsBySlot(slot.id);
    const drafts = getDraftsBySlot(slot.id).filter((d) => !bookingsForSlot.find((b) => b.artistId === d.artistId));
    if (drafts.length === 0) return;
    const venue = getVenueById(slot.venueId);
    const names = drafts.map((d) => getArtistUser(d.artistId)?.fullName ?? 'artist').join(', ');
    Alert.alert(
      'Send Gig Request',
      drafts.length === 1 ? `Send a gig request to ${names}?` : `Send gig requests to ${names}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            drafts.forEach((draft) => {
              const newBookingId = sendDraftByDJ(slot.id, draft.artistId, currentUser.id, addBooking);
              if (newBookingId) {
                saveBookingToSupabase(newBookingId, slot.id, slot.venueId, draft.artistId, slot.date, slot.name, slot.startTime, slot.endTime, venue?.name ?? null);
              }
              addNotification({
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                userId: draft.artistId,
                type: 'booking_request',
                title: 'New Gig Request',
                body: `${firstName(currentUser?.fullName, 'A manager')} wants you at ${venue?.name ?? 'a venue'}, ${formatDate(slot.date)}`,
                isRead: false,
                relatedId: newBookingId,
                relatedType: 'booking',
                createdAt: new Date().toISOString(),
              });
            });
          },
        },
      ]
    );
  };

  // State-dependent action button on each slot card:
  //   has a sent/confirmed booking -> '+' (add another artist)
  //   has draft(s) only            -> 'send' (send all drafts)
  //   empty                        -> 'delete' (no confirm)
  const renderSlotActionButton = (slot: Slot) => {
    const bookingsForSlot = getBookingsBySlot(slot.id);
    const draftsForSlot = getDraftsBySlot(slot.id).filter((d) => !bookingsForSlot.find((b) => b.artistId === d.artistId));
    // Coral + removed (M2): assigning another artist now happens via the greyed
    // "+ Assign artist" row at the bottom of the card. When a set has bookings and no
    // pending drafts, the header shows no action button.
    if (bookingsForSlot.length > 0 && draftsForSlot.length === 0) {
      return null;
    }
    if (draftsForSlot.length > 0) {
      return (
        <Pressable
          style={({ pressed }) => [{ padding: 6, borderRadius: 14, backgroundColor: colors.primary + '15', opacity: pressed ? 0.6 : 1 }]}
          onPress={() => sendSlotDrafts(slot)}
          hitSlop={8}
        >
          <MaterialIcons name="send" size={18} color={colors.primary} />
        </Pressable>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [{ padding: 6, borderRadius: 14, backgroundColor: colors.error + '15', opacity: pressed ? 0.6 : 1 }]}
        onPress={() => deleteSlotNow(slot)}
        hitSlop={8}
      >
        <MaterialIcons name="delete-outline" size={18} color={colors.error} />
      </Pressable>
    );
  };

  // Greyed "+ Assign artist" row at the bottom of a set card (M2). Opens assign-artist.
  // Only shown for sets that already have an artist/draft — an empty set is assigned via
  // its booking-detail (tapping the card). Not for past slots.
  const renderAssignRow = (slot: Slot) => {
    const hasAny = getBookingsBySlot(slot.id).length > 0 || getDraftsBySlot(slot.id).length > 0;
    if (!hasAny || isPastStart(slot.date, slot.startTime)) return null;
    return (
      <Pressable
        style={({ pressed }) => [styles.assignRow, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        onPress={() => router.push(('/(manager)/assign-artist?slotId=' + slot.id) as Href)}
      >
        <MaterialIcons name="add" size={16} color={colors.muted} />
        <Text style={[styles.assignRowText, { color: colors.muted }]}>Assign artist</Text>
      </Pressable>
    );
  };

  const handleDeleteOpenSlots = useCallback(() => {
    let periodLabel: string;
    let openSlots: typeof allManagerSlots;

    if (bulkIsWeekMode) {
      // Week mode: scope to the 7 days of the current week
      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      });
      openSlots = allManagerSlots.filter((s) => {
        if (!weekDates.includes(s.date)) return false;
        const hasDraft = getDraftsBySlot(s.id).length > 0;
        const hasBooking = getBookingsBySlot(s.id).length > 0;
        return !hasDraft && !hasBooking;
      });
      periodLabel = weekLabel;
    } else {
      // Month mode: scope to the current month
      const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      openSlots = allManagerSlots.filter((s) => {
        if (!s.date.startsWith(monthStr)) return false;
        const hasDraft = getDraftsBySlot(s.id).length > 0;
        const hasBooking = getBookingsBySlot(s.id).length > 0;
        return !hasDraft && !hasBooking;
      });
      periodLabel = `${MONTHS[currentMonth]} ${currentYear}`;
    }

    if (openSlots.length === 0) {
      Alert.alert('No Open Slots', `There are no empty slots in ${periodLabel}.`);
      return;
    }
    Alert.alert(
      'Delete Empty Slots',
      `Delete ${openSlots.length} empty slot${openSlots.length > 1 ? 's' : ''} from ${periodLabel}? Only slots with no drafts or bookings will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ids = openSlots.map((s) => s.id);
            const { error } = await supabase.from('slots').delete().in('id', ids);
            if (error) { Alert.alert('Error deleting slots', error.message); return; }
            ids.forEach((id) => deleteSlot(id));
            setShowSlotModal(false);
          },
        },
      ]
    );
  }, [allManagerSlots, currentYear, currentMonth, bulkIsWeekMode, weekStart, weekLabel, getDraftsBySlot, getBookingsBySlot, deleteSlot]);

  const handleBulkCreate = () => {
    if (bulkVenueIds.length === 0) { Alert.alert('Required', 'Please select at least one venue.'); return; }
    if (bulkDays.length === 0) { Alert.alert('Required', 'Please select at least one day of the week.'); return; }
    const validTemplates = bulkTemplates.filter((t) => t.startTime && t.endTime);
    if (validTemplates.length === 0) { Alert.alert('Required', 'Please add at least one slot template.'); return; }

    // Build all dates in the selected period that match the selected days of week
    // Days stored as 0=Mon..6=Sun; JS getDay() is 0=Sun..6=Sat
    const jsDay = (d: number) => (d + 1) % 7; // convert Mon=0 → 1, Sun=6 → 0
    const matchingDates: string[] = [];
    if (bulkIsWeekMode) {
      // Week mode: iterate over the 7 days of the current week
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        if (bulkDays.some((bd) => jsDay(bd) === dayOfWeek)) {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          if (dateStr < todayStr) continue; // skip past dates
          matchingDates.push(dateStr);
        }
      }
    } else {
      // Month mode: iterate over all days in the current month
      const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInCurrentMonth; d++) {
        const date = new Date(currentYear, currentMonth, d);
        const dayOfWeek = date.getDay();
        if (bulkDays.some((bd) => jsDay(bd) === dayOfWeek)) {
          const mm = String(currentMonth + 1).padStart(2, '0');
          const dd = String(d).padStart(2, '0');
          const dateStr = `${currentYear}-${mm}-${dd}`;
          if (dateStr < todayStr) continue; // skip past dates
          matchingDates.push(dateStr);
        }
      }
    }

    // Build slot objects, skip duplicates (same venueId + date + name)
    const existingKeys = new Set(allSlots.map((s) => `${s.venueId}|${s.date}|${s.startTime}-${s.endTime}`));
    const newSlots: Slot[] = [];
    let skipped = 0;
    const now = new Date().toISOString();
    let counter = Date.now();
    for (const venueId of bulkVenueIds) {
      for (const date of matchingDates) {
        for (const tpl of validTemplates) {
          const key = `${venueId}|${date}|${tpl.startTime}-${tpl.endTime}`;
          if (existingKeys.has(key)) { skipped++; continue; }
          existingKeys.add(key);
          newSlots.push({
            id: `slot-bulk-${counter++}`,
            venueId,
            date,
            name: tpl.name.trim(),
            startTime: tpl.startTime,
            endTime: tpl.endTime,
            createdAt: now,
          });
        }
      }
    }

    if (newSlots.length === 0) {
      Alert.alert('Nothing to create', skipped > 0 ? `All ${skipped} slots already exist.` : 'No matching dates found.');
      return;
    }

    const skipMsg = skipped > 0 ? `\n(${skipped} duplicate${skipped > 1 ? 's' : ''} skipped)` : '';
    const periodLabel = bulkIsWeekMode ? weekLabel : `${MONTHS[currentMonth]} ${currentYear}`;
    Alert.alert(
      'Create Slots',
      `Create ${newSlots.length} slot${newSlots.length > 1 ? 's' : ''} for ${periodLabel}?${skipMsg}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { bulkAddSlots(newSlots); setShowSlotModal(false); return; }
            const supabaseSlots = newSlots.map((s) => ({
              venue_id: s.venueId,
              manager_id: user.id,
              name: s.name,
              date: s.date,
              start_time: s.startTime,
              end_time: s.endTime,
              status: 'open',
            }));
            const { data: inserted, error } = await supabase.from('slots').insert(supabaseSlots).select();
            if (!error && inserted) {
              const slotsWithUUIDs: Slot[] = inserted.map((s) => ({
                id: s.id,
                venueId: s.venue_id,
                name: s.name,
                date: s.date,
                startTime: s.start_time,
                endTime: s.end_time,
                createdAt: s.created_at,
              }));
              bulkAddSlots(slotsWithUUIDs);
            } else {
              bulkAddSlots(newSlots);
            }
            setShowSlotModal(false);
          },
        },
      ]
    );
  };

  const prevMonthNav = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const nextMonthNav = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };
  const goToToday = () => {
    const t = new Date();
    setCurrentMonth(t.getMonth());
    setCurrentYear(t.getFullYear());
    setSelectedDate(todayStr);
  };

  // ── Month swipe pager (Apple-Calendar style, mirrors the artist calendar) ──
  // prev / current / next month grids sit side-by-side in a paged horizontal ScrollView; the drag
  // follows the finger and snaps. On settle we swap the month and instantly re-centre on the middle
  // page, so it feels infinite. A "jump to date" just re-renders the middle page — no scroll sync.
  const SCREEN_W = Dimensions.get('window').width;
  const monthPagerRef = useRef<ScrollView>(null);
  // Stable initial offset (page 1 = current month) so re-renders don't fight the scroll position.
  const initialPagerOffset = useRef({ x: SCREEN_W, y: 0 }).current;
  const prevMY = currentMonth === 0 ? { year: currentYear - 1, month: 11 } : { year: currentYear, month: currentMonth - 1 };
  const nextMY = currentMonth === 11 ? { year: currentYear + 1, month: 0 } : { year: currentYear, month: currentMonth + 1 };
  const onMonthPagerEnd = (e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (page === 1) return;                                          // didn't cross to another month
    monthPagerRef.current?.scrollTo({ x: SCREEN_W, animated: false }); // re-centre; content swaps below
    if (page === 0) prevMonthNav();
    else if (page === 2) nextMonthNav();
  };
  // One month's grid, parameterised by (year, month) and padded to a fixed 6 rows (42 cells) so
  // every month is the SAME height — the grid never resizes when you swipe, and the pager reserves
  // no extra space (so there's no gap between the calendar and the day list below).
  const renderMonthGrid = (year: number, month: number) => {
    const offset = getFirstDayOffset(month, year);
    // Full 6-row (42-cell) grid: the previous month's trailing days, this month, then the next
    // month's leading days — no row is ever blank. Adjacent-month days render faded + inert.
    const firstCell = new Date(year, month, 1);
    firstCell.setDate(firstCell.getDate() - offset);
    const cells: { date: string; outside: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const dObj = new Date(firstCell);
      dObj.setDate(firstCell.getDate() + i);
      const ds = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
      cells.push({ date: ds, outside: dObj.getMonth() !== month });
    }
    return (
      <View style={styles.calendarGrid}>
        {cells.map(({ date: dateStr, outside }) => {
          const day = parseInt(dateStr.split('-')[2], 10);
          const daySlots = getSlotsForDate(dateStr);
          const isSelected = dateStr === selectedDate;
          // Strongest state among the day's slots (see the inline version this was extracted from).
          const pastPendingOnDay = allBookings.filter(
            (b) => (b.status === 'requested' || b.status === 'past_confirmation') &&
              (venueFilter === 'all' || b.venueId === venueFilter) &&
              (b.slotDate === dateStr || (daySlots.some((s) => s.id === b.slotId)))
          );
          const allDayBookings = daySlots.flatMap((s) => getBookingsBySlot(s.id));
          const dCancelled = allDayBookings.some((b) => b.status === 'cancelled' || b.status === 'declined');
          const dPending = allDayBookings.some((b) => b.status === 'requested' || b.status === 'past_confirmation') || pastPendingOnDay.length > 0;
          const dConfirmed = allDayBookings.some((b) => b.status === 'confirmed');
          const dDrafted = daySlots.some((s) => getBookingsBySlot(s.id).length === 0 && getDraftsBySlot(s.id).length > 0);
          const dEmpty = daySlots.some((s) => getBookingsBySlot(s.id).length === 0 && getDraftsBySlot(s.id).length === 0);
          // cancelled > empty(beige+dashed) > drafted(beige) > sent(amber) > booked(green).
          let fill: string | null = null;
          let dashedRing = false;
          if (dCancelled) fill = colors.cancelled;
          else if (dEmpty) { fill = colors.surface; dashedRing = true; }
          else if (dDrafted) fill = colors.surface;
          else if (dPending) fill = STATUS_COLORS.pending;
          else if (dConfirmed) fill = STATUS_COLORS.confirmed;
          const strongFill = !!fill && fill !== colors.surface;
          // Adjacent-month days show their status fill like a normal day; only an EMPTY adjacent
          // day (no slot at all) is greyed, to mark the month boundary.
          const numColor = strongFill ? '#fff' : (outside && !fill) ? colors.muted : colors.foreground;
          return (
            <Pressable key={dateStr} style={styles.calendarCell} onPress={() => setSelectedDate(dateStr)}>
              <View style={[styles.dayCircle, fill ? { backgroundColor: fill } : null,
                dashedRing ? { borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed' } : null]}>
                <Text style={[styles.dayNumber, { color: numColor, opacity: (outside && !fill && !isSelected) ? 0.5 : 1, fontSize: isSelected ? 20 : 16, fontFamily: isSelected ? fonts.bodyBold : fonts.bodySemibold }]}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────
  // Returns true when slot can be deleted (no active/completed bookings)
  const slotIsDeletable = (slot: Slot) => {
    const slotBookingsForCheck = getBookingsBySlot(slot.id);
    return !slotBookingsForCheck.some(
      (b) => b.status === 'requested' || b.status === 'confirmed' || b.status === 'past_confirmation' || b.status === 'completed'
    );
  };

  const renderSwipeDeleteAction = (slot: Slot) => (
    <Pressable
      style={({ pressed }) => [{
        backgroundColor: colors.error,
        justifyContent: 'center',
        alignItems: 'center',
        width: 72,
        borderRadius: 12,
        marginLeft: 8,
        opacity: pressed ? 0.8 : 1,
      }]}
      onPress={() => handleDeleteSlot(slot)}
    >
      <MaterialIcons name="delete" size={20} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Delete</Text>
    </Pressable>
  );

  // Month-view day list: dashboard-style rows. A slot with bookings shows one row per artist
  // (avatar + status pill + venue + time -> booking-detail); a slot with none shows a dashed
  // "Needs artist" row -> Add Artist picker.
  const renderDaySlot = (slot: Slot) => {
    const venueName = getVenueById(slot.venueId)?.name ?? 'Venue';
    const time = `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}`;
    const bs = getBookingsBySlot(slot.id);   // already excludes hidden-from-manager
    // Drafts (staged, not sent) on this slot, minus anyone who already has a booking here.
    const bookedIds = new Set(bs.map((b) => b.artistId));
    const drafts = getDraftsBySlot(slot.id).filter((d) => !bookedIds.has(d.artistId));

    // Swipe-left reveals a delete action. Used for draft rows (remove the draft) and empty
    // slots (delete the slot) — not for real bookings (those are cancelled from the booking).
    const withSwipeDelete = (key: string, onDelete: () => void, child: React.ReactNode) => {
      const doDelete = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); };
      return (
        <Swipeable
          key={key}
          friction={1.4}
          rightThreshold={56}                 // a decisive swipe past this deletes (full-swipe)
          overshootRight={false}
          onSwipeableOpen={(dir) => { if (dir === 'right') doDelete(); }}
          renderRightActions={() => (
            <View style={styles.swipeDeleteAction}>
              <Pressable style={[styles.swipeDeleteBtn, { backgroundColor: colors.error }]} onPress={doDelete}>
                <MaterialIcons name="delete" size={17} color="#fff" />
                <Text style={styles.swipeDeleteText}>Remove</Text>
              </Pressable>
            </View>
          )}
        >
          {child}
        </Swipeable>
      );
    };

    // Truly empty — no booking, no draft → prompt to add an artist (swipe to delete the slot).
    if (bs.length === 0 && drafts.length === 0) {
      return [withSwipeDelete(slot.id, () => deleteSlotNow(slot), (
        <Pressable
          style={({ pressed }) => [styles.dayRow, { backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.push(('/(manager)/assign-artist?slotId=' + slot.id) as Href)}
        >
          <View style={[styles.dayDashedCircle, { borderColor: colors.primary }]}>
            <MaterialIcons name="add" size={22} color={colors.primary} />
          </View>
          <View style={styles.dayRowInfo}>
            <Text style={[styles.dayRowName, { color: colors.primary }]}>Needs artist</Text>
            <Text style={[styles.dayRowSub, { color: colors.muted }]} numberOfLines={1}>{venueName}</Text>
          </View>
          <Text style={[styles.dayRowTime, { color: colors.muted }]}>{time}</Text>
        </Pressable>
      ))];
    }

    const dayRow = (artist: any, badge: React.ReactNode, onPress: () => void, onDismiss?: () => void) => (
      <Pressable style={({ pressed }) => [styles.dayRow, { backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 }]} onPress={onPress}>
        <AvatarImage uri={artist?.profilePhotoUrl || undefined} avatarId={(artist as any)?.avatarId} seed={artist?.id} name={artist?.fullName ?? 'Former Artist'} size={44} />
        <View style={styles.dayRowInfo}>
          <View style={styles.dayNameRow}>
            <Text style={[styles.dayRowName, { color: colors.foreground }]} numberOfLines={1}>{artist?.fullName ?? 'Former Artist'}</Text>
            {badge}
          </View>
          <Text style={[styles.dayRowSub, { color: colors.muted }]} numberOfLines={1}>{venueName}</Text>
        </View>
        <Text style={[styles.dayRowTime, { color: colors.muted }]}>{time}</Text>
        {onDismiss && (
          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onDismiss(); }} style={({ pressed }) => [styles.dayDismissBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        )}
      </Pressable>
    );

    // Stacked-avatar variant: several artists on ONE slot collapse into a single row (mirrors the
    // dashboard) — overlapping avatars + joined names + one status badge.
    const dayRowMulti = (artists: any[], badge: React.ReactNode, onPress: () => void) => {
      const names = artists.map((a) => a?.fullName ?? 'Former Artist');
      const title = artists.length === 1 ? names[0] : `${names.slice(0, 2).join(', ')}${artists.length > 2 ? ` +${artists.length - 2}` : ''}`;
      return (
        <Pressable style={({ pressed }) => [styles.dayRow, { backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 }]} onPress={onPress}>
          <View style={styles.dayAvatarStack}>
            {artists.slice(0, 2).map((a, i) => (
              <View key={i} style={[styles.dayAvatarRing, { borderColor: colors.background, marginLeft: i === 0 ? 0 : -18, zIndex: artists.length - i }]}>
                <AvatarImage uri={a?.profilePhotoUrl || undefined} avatarId={(a as any)?.avatarId} seed={a?.id} name={a?.fullName ?? 'Former Artist'} size={44} />
              </View>
            ))}
          </View>
          <View style={styles.dayRowInfo}>
            <View style={styles.dayNameRow}>
              <Text style={[styles.dayRowName, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
              {badge}
            </View>
            <Text style={[styles.dayRowSub, { color: colors.muted }]} numberOfLines={1}>{venueName}</Text>
          </View>
          <Text style={[styles.dayRowTime, { color: colors.muted }]}>{time}</Text>
        </Pressable>
      );
    };

    // Split the slot's bookings: dead ones (cancelled/declined/expired) stay individual so each
    // keeps its swipe-to-dismiss; the live ones collapse into ONE stacked row like the dashboard.
    const dead = bs.filter((b) => b.status === 'cancelled' || b.status === 'declined' || b.status === 'expired');
    const live = bs.filter((b) => !(b.status === 'cancelled' || b.status === 'declined' || b.status === 'expired'));
    // One badge for the whole live group: highest-priority shown status (pending > confirmed >
    // completed); a confirmed group shows no badge, mirroring the single-row rule.
    const rankOf = (s: string) => (s === 'requested' || s === 'past_confirmation' || s === 'pending') ? 0 : s === 'confirmed' ? 1 : s === 'completed' ? 2 : 3;
    const liveShown = live.map((b) => displayStatus(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime));
    const repShown = liveShown.reduce((acc, s) => (rankOf(s) < rankOf(acc) ? s : acc), liveShown[0] ?? 'confirmed');

    return [
      ...(live.length > 0 ? [(
        <View key={'live-' + slot.id}>
          {dayRowMulti(
            live.map((b) => getArtistUser(b.artistId)),
            repShown !== 'confirmed' ? <StatusBadge status={repShown as any} /> : null,
            () => router.push(('/(manager)/booking-detail?id=' + live[0].id) as Href),
          )}
        </View>
      )] : []),
      ...dead.map((b) => {
        const shown = displayStatus(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime);
        // Visible X to dismiss (plus swipe still works).
        const row = dayRow(getArtistUser(b.artistId), <StatusBadge status={shown as any} />,
          () => router.push(('/(manager)/booking-detail?id=' + b.id) as Href),
          () => dismissBooking(b));
        return withSwipeDelete('bk-' + b.id, () => dismissBooking(b), row);
      }),
      // Drafts on the slot collapse into ONE stacked-avatar row (mirrors the live-bookings group,
      // line above) — 2+ drafts no longer show as separate rows. Tap opens assign-artist to manage
      // them; swipe removes every draft on the slot at once.
      ...(drafts.length > 0 ? [
        withSwipeDelete('drafts-' + slot.id, () => drafts.forEach((d) => removeDraftByDJ(slot.id, d.artistId)),
          dayRowMulti(
            drafts.map((d) => getArtistUser(d.artistId)),
            <StatusBadge status="draft" />,
            () => router.push(('/(manager)/assign-artist?slotId=' + slot.id) as Href),
          )),
      ] : []),
    ];
  };

  // ─── Lineup Balance Panel ──────────────────────────────────────────────────────────────────────────
  const renderLineupBalance = () => {
    if (!showLineupBalance) return null;
    // Always show panel in month/venue view (empty state message shown when no bookings).
    // In week view, hide only when there are no bookings.
    const isMonthView = calendarMode === 'month' || calendarMode === 'today';
    if (lineupRows.length === 0 && !isMonthView) return null;
    const maxCount = Math.max(...lineupRows.map((r) => r.gigCount), 1);
    return (
      <View style={[styles.lineupPanel, { borderColor: colors.border }]}>
        {/* Panel header — tap to collapse/expand */}
        <Pressable
          style={styles.lineupHeader}
          onPress={() => setLineupBalanceOpen((v) => !v)}
        >
          <View style={styles.lineupHeaderLeft}>
            <MaterialIcons name="equalizer" size={16} color={colors.primary} />
            <Text style={[styles.lineupTitle, { color: colors.foreground }]}>
              Roster Balance{' '}
              <Text style={[styles.lineupTitle, { color: colors.muted, fontWeight: '500' }]}>({lineupPeriodLabel})</Text>
            </Text>
          </View>
          <MaterialIcons
            name={lineupBalanceOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={colors.muted}
          />
        </Pressable>

        {/* Panel body */}
        {lineupBalanceOpen && (
          <View style={styles.lineupBody}>
            {lineupRows.length === 0 && (
              <Text style={[styles.lineupEmptyText, { color: colors.muted }]}>
                No bookings for this period yet.
              </Text>
            )}
            {lineupRows.map((row) => {
              const barWidth = maxCount > 0 ? (row.gigCount / maxCount) * 100 : 0;
              return (
                <View key={row.artistId} style={styles.lineupRow}>
                  <AvatarImage uri={row.user.profilePhotoUrl} name={row.user.fullName} size={32} />
                  <View style={styles.lineupRowInfo}>
                    <View style={styles.lineupRowTop}>
                      <Text style={[styles.lineupDJName, { color: colors.foreground }]} numberOfLines={1}>{row.user.fullName}</Text>
                      <Text style={[styles.lineupCount, { color: row.gigCount > 0 ? colors.primary : colors.muted }]}>
                        {row.gigCount} booking{row.gigCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {/* Mini progress bar */}
                    <View style={[styles.lineupBarTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.lineupBarFill,
                          {
                            width: `${barWidth}%` as `${number}%`,
                            backgroundColor: row.gigCount > 0 ? colors.primary : colors.border,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      {/* Frozen header — stays fixed while the calendar + day list scroll. */}
      <View style={styles.header}>
        <VenueFilterHeader />
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={calendarRefreshing} onRefresh={handleCalendarRefresh} tintColor={colors.primary} />}>
        <View onStartShouldSetResponder={() => { setActiveSlotMenu(null); return false; }}>

          {venues.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 }}>
              <MaterialIcons name="business" size={48} color={colors.muted} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.foreground, marginTop: 16, textAlign: 'center' }}>No venues</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>Create a venue first to manage its calendar.</Text>
              <Pressable
                onPress={() => router.push('/(manager)/create-venue' as Href)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24, opacity: pressed ? 0.85 : 1 })}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Create Venue</Text>
              </Pressable>
            </View>
          ) : (
            /* ═══════════════════ MONTH VIEW ═══════════════════ */
            <>
              {/* Month label (CAPS) + "SEND ALL (N)" where Today used to be — coral text, no
                  background, only when there are pending draft requests. Swipe the grid to change month. */}
              <View style={styles.monthNav}>
                <Text style={[styles.monthTitle, { color: colors.foreground }]}>{MONTHS[currentMonth]} {currentYear}</Text>
                <View style={{ flex: 1 }} />
                {periodScopedDrafts.length > 0 && (
                  <Pressable
                    onPress={() => {
                      setSendVenueFilter(null);
                      setSelectedDraftKeys(new Set(periodScopedDrafts.map((d) => d.key)));
                      setShowSendSheet(true);
                    }}
                    hitSlop={8}
                  >
                    <Text style={[styles.todayBtn, { color: colors.primary, textTransform: 'uppercase' }]}>Send all ({periodScopedDrafts.length})</Text>
                  </Pressable>
                )}
              </View>

              {/* Day Labels - Monday first (fixed above the swipe pager) */}
              <View style={styles.dayLabels}>
                {DAYS_SHORT.map((d) => (
                  <Text key={d} style={[styles.dayLabel, { color: colors.muted }]}>{d}</Text>
                ))}
              </View>

              {/* Swipe pager: prev / current / next month grids side by side (Apple-style paging). */}
              <ScrollView
                ref={monthPagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMonthPagerEnd}
                contentOffset={initialPagerOffset}
                scrollEventThrottle={16}
                nestedScrollEnabled
              >
                <View style={{ width: SCREEN_W }}>{renderMonthGrid(prevMY.year, prevMY.month)}</View>
                <View style={{ width: SCREEN_W }}>{renderMonthGrid(currentYear, currentMonth)}</View>
                <View style={{ width: SCREEN_W }}>{renderMonthGrid(nextMY.year, nextMY.month)}</View>
              </ScrollView>

              {/* Selected Date Slots */}
              {!selectedDate ? (
                <View style={[styles.noSlotsCard, { borderColor: colors.border }]}>
                  <MaterialIcons name="touch-app" size={32} color={colors.muted} />
                  <Text style={[styles.noSlotsText, { color: colors.muted }]}>Tap a date to see sets</Text>
                </View>
              ) : (
              <View style={styles.slotsSection}>
                <View style={styles.dayHeaderRow}>
                  <Text style={[styles.dayHeaderLabel, { color: colors.muted }]}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                  </Text>
                  <View style={[styles.dayHeaderLine, { backgroundColor: colors.border }]} />
                  <Pressable onPress={() => openCreateSlot(selectedDate)} hitSlop={10} style={styles.dayHeaderAdd}>
                    <MaterialIcons name="add" size={22} color={colors.primary} />
                  </Pressable>
                </View>

                {selectedSlots.length === 0 ? (
                  <Text style={[styles.noSlotsLine, { color: colors.muted }]}>No slots on this night.</Text>
                ) : (
                  selectedSlots.flatMap(renderDaySlot)
                )}
              </View>
              )}
              {renderLineupBalance()}
            </>
          )}
        </View>
      </ScrollView>

      {/* ═══════════════════ SEND BOOKING MODAL (full-screen, context-aware) ═══════════════════ */}
      <Modal
        visible={showSendSheet}
        transparent={false}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowSendSheet(false)}
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Full-screen header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
            backgroundColor: colors.background,
          }}>
            <Pressable
              onPress={() => setShowSendSheet(false)}
              style={({ pressed }) => [{ padding: 8, borderRadius: 20, opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="close" size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Send Gig Requests</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{sendModalSubtitle}</Text>
            </View>
            {/* Select All / Deselect All toggle */}
            <Pressable
              onPress={() => {
                const allSel = modalDrafts.length > 0 && modalDrafts.every((d) => selectedDraftKeys.has(d.key));
                setSelectedDraftKeys((prev) => {
                  const next = new Set(prev);
                  modalDrafts.forEach((d) => { if (allSel) next.delete(d.key); else next.add(d.key); });
                  return next;
                });
              }}
              style={({ pressed }) => [{ padding: 8, borderRadius: 20, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                {modalDrafts.length > 0 && modalDrafts.every((d) => selectedDraftKeys.has(d.key)) ? 'Deselect All' : 'Select All'}
              </Text>
            </Pressable>
          </View>

          {/* Venue filter — send for one venue at a time. Hidden when <2 venues have drafts. */}
          <VenueFilterRow venues={sendVenueChips} selectedId={sendVenueFilter} onSelect={setSendVenueFilter} />

          {/* Draft list grouped by date */}
          {modalDrafts.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <MaterialIcons name="send" size={48} color={colors.border} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>No drafts to send</Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', paddingHorizontal: 40 }}>
                There are no draft bookings for {sendModalSubtitle.toLowerCase()}.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
              {modalDraftsByDate.map(([dateStr, items]) => {
                const dateObj = new Date(dateStr + 'T00:00:00');
                const dateLabel = dateObj.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <View key={dateStr}>
                    {/* Date group header */}
                    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{dateLabel}</Text>
                    </View>
                    {/* Draft rows */}
                    {items.map((item, i) => {
                      const isSelected = selectedDraftKeys.has(item.key);
                      const isLastInGroup = i === items.length - 1;
                      const venueColor = getVenueColor(item.slot.venueId);
                      return (
                        <Pressable
                          key={item.key}
                          style={({ pressed }) => [{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            paddingHorizontal: 20, paddingVertical: 14,
                            borderBottomWidth: isLastInGroup ? 0 : 0.5, borderBottomColor: colors.border,
                            backgroundColor: isSelected ? colors.primary + '0A' : (pressed ? colors.surface : colors.background),
                          }]}
                          onPress={() => {
                            setSelectedDraftKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.key)) next.delete(item.key);
                              else next.add(item.key);
                              return next;
                            });
                          }}
                        >
                          {/* Checkbox */}
                          <View style={[{
                            width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                            alignItems: 'center', justifyContent: 'center',
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          }]}>
                            {isSelected && <MaterialIcons name="check" size={13} color="#fff" />}
                          </View>
                          {/* Artist avatar */}
                          <AvatarImage uri={item.djUser?.profilePhotoUrl} name={item.djUser?.fullName} size={36} />
                          {/* Info */}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }} numberOfLines={1}>
                              {item.djUser?.fullName ?? 'Unknown Artist'}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                              {item.venue?.name ?? 'Unknown Venue'} · {fmtTime(item.slot.startTime)}–{fmtTime(item.slot.endTime)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Footer: Send button */}
          <View style={[{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16,
            borderTopWidth: 0.5, borderTopColor: colors.border,
            backgroundColor: colors.background,
            flexDirection: 'row', gap: 12,
          }]}>
            <Pressable
              style={({ pressed }) => [{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1, backgroundColor: colors.surface }]}
              onPress={() => setShowSendSheet(false)}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.foreground }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [{
                flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                backgroundColor: selectedDraftKeys.size > 0 ? colors.primary : colors.border,
                opacity: pressed ? 0.85 : 1,
              }]}
              onPress={() => {
                if (!currentUser || selectedDraftKeys.size === 0) return;
                const count = selectedDraftKeys.size;
                Alert.alert(
                  'Send Gig Requests?',
                  `Send ${count} gig request${count !== 1 ? 's' : ''} to the selected artists? They will be notified and can accept or decline.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Send',
                      onPress: () => {
                        // Group selected keys by slotId and send each individually using sendDraftByDJ
                        let sent = 0;
                        selectedDraftKeys.forEach((key) => {
                          const [slotId, artistId] = key.split('::');
                          const draftSlot = getSlotById(slotId);
                          const draftVenue = draftSlot ? getVenueById(draftSlot.venueId) : undefined;
                          const newBookingId = sendDraftByDJ(slotId, artistId, currentUser.id, addBooking);
                          if (newBookingId && draftSlot) {
  saveBookingToSupabase(newBookingId, slotId, draftSlot.venueId, artistId, draftSlot.date, draftSlot.name, draftSlot.startTime, draftSlot.endTime, draftVenue?.name ?? null);
}
                          addNotification({
                            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            userId: artistId,
                            type: 'booking_request',
                            title: 'New Gig Request',
                            body: `${firstName(currentUser?.fullName, 'A manager')} wants you at ${draftVenue?.name ?? 'a venue'}, ${draftSlot?.date ? formatDate(draftSlot.date) : ''}`,
                            isRead: false,
                            relatedId: newBookingId,
                            relatedType: 'booking',
                            createdAt: new Date().toISOString(),
                          });
                          sent++;
                        });
                        setShowSendSheet(false);
                        Alert.alert('Sent!', `${sent} gig request${sent !== 1 ? 's' : ''} sent successfully.`);
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: selectedDraftKeys.size > 0 ? '#fff' : colors.muted }}>
                {selectedDraftKeys.size > 0 ? `Send ${selectedDraftKeys.size} Request${selectedDraftKeys.size !== 1 ? 's' : ''}` : 'Select Drafts to Send'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════ ADD / EDIT SLOT SHEET ═══════════════════ */}
      <Modal
        visible={showSlotModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { Keyboard.dismiss(); setShowSlotModal(false); setEditingSlot(null); }}
      >
          <View style={[slotModalStyles.sheet, { backgroundColor: colors.background, flex: 1 }]}>

            {/* ── Drag handle ── */}
            <View style={slotModalStyles.handleRow}>
              <View style={[slotModalStyles.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* ── Header ── */}
            <View style={slotModalStyles.header}>
              <View>
                <Text style={[slotModalStyles.sheetTitle, { color: colors.foreground }]}>
                  {slotSheetMode === 'multiple'
                    ? (bulkIsWeekMode ? weekLabel : `${MONTHS[currentMonth]} ${currentYear}`)
                    : new Date((calendarMode === 'week' || calendarMode === 'today' || editingSlot ? createSlotDate : selectedDate) + 'T00:00:00')
                        .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                {slotSheetMode === 'multiple' && !bulkIsWeekMode && (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                    Create slots in bulk for the month of {MONTHS[currentMonth]}
                  </Text>
                )}
              </View>
              <Pressable
                style={[slotModalStyles.closeBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { Keyboard.dismiss(); setShowSlotModal(false); setEditingSlot(null); }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>

            {/* ═══ MULTIPLE SETS BODY (bulk) ═══ */}
            {!editingSlot && slotSheetMode === 'multiple' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 24) + keyboardHeight }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                scrollEventThrottle={16}
              >
                {/* Venues */}
                <Text style={[slotModalStyles.fieldLabel, { color: colors.muted, marginBottom: 8 }]}>VENUES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[slotModalStyles.pillRow, { marginBottom: 16 }]}>
                  {venues.map((v) => {
                    const sel = bulkVenueIds.includes(v.id);
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => setBulkVenueIds((prev) => sel ? prev.filter((id) => id !== v.id) : [...prev, v.id])}
                        style={[slotModalStyles.venuePill, {
                          backgroundColor: sel ? colors.primary : 'transparent',
                          borderColor: sel ? colors.primary : colors.border,
                        }]}
                      >
                        <Text style={[slotModalStyles.venuePillText, { color: sel ? '#fff' : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Days of week */}
                <Text style={[slotModalStyles.fieldLabel, { color: colors.muted, marginBottom: 8 }]}>DAYS OF WEEK</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {DAYS_SHORT.map((day, idx) => {
                    const sel = bulkDays.includes(idx);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => setBulkDays((prev) => sel ? prev.filter((d) => d !== idx) : [...prev, idx])}
                        style={[slotModalStyles.venuePill, {
                          backgroundColor: sel ? colors.primary : 'transparent',
                          borderColor: sel ? colors.primary : colors.border,
                          minWidth: 60,
                          justifyContent: 'center',
                        }]}
                      >
                        <Text style={[slotModalStyles.venuePillText, { color: sel ? '#fff' : colors.foreground }]}>{day}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Slot templates */}
                <Text style={[slotModalStyles.fieldLabel, { color: colors.muted, marginBottom: 8 }]}>SLOT TEMPLATES</Text>

                {bulkTemplates.map((tpl, tplIdx) => (
                  <View key={tpl.id} style={{ marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 }}>
                    {/* Template header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={[slotModalStyles.fieldLabel, { color: colors.muted, marginBottom: 0 }]}>SLOT {tplIdx + 1}</Text>
                      {bulkTemplates.length > 1 && (
                        <Pressable onPress={() => setBulkTemplates((prev) => prev.filter((t) => t.id !== tpl.id))} style={{ padding: 4 }}>
                          <MaterialIcons name="remove-circle-outline" size={18} color={colors.error} />
                        </Pressable>
                      )}
                    </View>

                    {/* Time row */}
                    <View style={slotModalStyles.timeRow}>
                      <View style={{ flex: 1, zIndex: bulkStartOpen === tpl.id ? 10 : 1 }}>
                        <Text style={[slotModalStyles.fieldLabel, { color: colors.muted }]}>START</Text>
                        <Pressable
                          style={[slotModalStyles.timeDropdownBtn, { borderColor: colors.border }]}
                          onPress={() => { setBulkStartOpen(bulkStartOpen === tpl.id ? null : tpl.id); setBulkEndOpen(null); }}
                        >
                          <Text style={[slotModalStyles.timeDropdownText, { color: colors.foreground }]}>{tpl.startTime}</Text>
                          <MaterialIcons name={bulkStartOpen === tpl.id ? 'expand-less' : 'expand-more'} size={20} color={colors.muted} />
                        </Pressable>
                        {bulkStartOpen === tpl.id && (
                          <View style={[slotModalStyles.timeDropdownAbsolute, slotModalStyles.timeDropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <ScrollView onLayout={(e) => { const idx = TIME_OPTIONS.indexOf(tpl.startTime); if (idx > 0) { const ref = e.target as unknown as ScrollView; setTimeout(() => (ref as any).scrollTo?.({ y: Math.max(0, idx * 36 - 36), animated: false }), 50); } }} style={slotModalStyles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {TIME_OPTIONS.map((t) => (
                                <Pressable
                                  key={t}
                                  style={[slotModalStyles.timeOption, tpl.startTime === t && { backgroundColor: colors.primary + '15' }]}
                                  onPress={() => { setBulkTemplates((prev) => prev.map((tp) => tp.id === tpl.id ? { ...tp, startTime: t } : tp)); setBulkStartOpen(null); }}
                                >
                                  <Text style={[slotModalStyles.timeOptionText, { color: tpl.startTime === t ? colors.primary : colors.foreground, fontWeight: tpl.startTime === t ? '700' : '400' }]}>{t}</Text>
                                  {tpl.startTime === t && <MaterialIcons name="check" size={16} color={colors.primary} />}
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      <View style={slotModalStyles.timeSep}>
                        <Text style={{ color: colors.muted, fontSize: 16 }}>→</Text>
                      </View>

                      <View style={{ flex: 1, zIndex: bulkEndOpen === tpl.id ? 10 : 1 }}>
                        <Text style={[slotModalStyles.fieldLabel, { color: colors.muted }]}>END</Text>
                        <Pressable
                          style={[slotModalStyles.timeDropdownBtn, { borderColor: colors.border }]}
                          onPress={() => { setBulkEndOpen(bulkEndOpen === tpl.id ? null : tpl.id); setBulkStartOpen(null); }}
                        >
                          <Text style={[slotModalStyles.timeDropdownText, { color: colors.foreground }]}>{tpl.endTime}</Text>
                          <MaterialIcons name={bulkEndOpen === tpl.id ? 'expand-less' : 'expand-more'} size={20} color={colors.muted} />
                        </Pressable>
                        {bulkEndOpen === tpl.id && (
                          <View style={[slotModalStyles.timeDropdownAbsolute, slotModalStyles.timeDropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <ScrollView onLayout={(e) => { const idx = TIME_OPTIONS.indexOf(tpl.endTime); if (idx > 0) { const ref = e.target as unknown as ScrollView; setTimeout(() => (ref as any).scrollTo?.({ y: Math.max(0, idx * 36 - 36), animated: false }), 50); } }} style={slotModalStyles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {TIME_OPTIONS.map((t) => (
                                <Pressable
                                  key={t}
                                  style={[slotModalStyles.timeOption, tpl.endTime === t && { backgroundColor: colors.primary + '15' }]}
                                  onPress={() => { setBulkTemplates((prev) => prev.map((tp) => tp.id === tpl.id ? { ...tp, endTime: t } : tp)); setBulkEndOpen(null); }}
                                >
                                  <Text style={[slotModalStyles.timeOptionText, { color: tpl.endTime === t ? colors.primary : colors.foreground, fontWeight: tpl.endTime === t ? '700' : '400' }]}>{t}</Text>
                                  {tpl.endTime === t && <MaterialIcons name="check" size={16} color={colors.primary} />}
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}

                {/* Add another template — minimal */}
                <Pressable
                  onPress={() => setBulkTemplates((prev) => [...prev, { id: String(Date.now()), name: '', startTime: '21:00', endTime: '01:00' }])}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, opacity: pressed ? 0.5 : 1 }]}
                >
                  <MaterialIcons name="add" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Add Another Slot</Text>
                </Pressable>

                {/* Create Slots button — below add template */}
                <Pressable
                  onPress={handleBulkCreate}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8, marginBottom: 8, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Slots</Text>
                </Pressable>

                {/* ── Delete All Open Slots ── */}
                <View style={{ marginTop: 24, marginBottom: 8, paddingHorizontal: 4 }}>
                  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 20 }} />
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.error,
                      opacity: pressed ? 0.6 : 1,
                    })}
                    onPress={handleDeleteOpenSlots}
                  >
                    <MaterialIcons name="delete-sweep" size={20} color={colors.error} />
                    <Text style={{ color: colors.error, fontSize: 14, fontWeight: '600' }}>{bulkIsWeekMode ? 'Delete All Empty Slots For This Week' : 'Delete All Empty Slots For This Month'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

          </View>
      </Modal>


    </ScreenContainer>
  );
}

const venueFilterStyles = StyleSheet.create({
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, minHeight: 72 },
  // Week view
  // Weekly/Today slot card — mirrors monthly slotCard exactly
  // Legend
  // Venue tabs
  // Month view
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  monthNavBtn: { padding: 2 },
  todayBtn: { fontSize: 15, fontWeight: '700' },

  monthTitle: { fontSize: 20, fontWeight: '600' },

  // Calendar grid
  dayLabels: { flexDirection: 'row', paddingHorizontal: 12 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', paddingVertical: 4 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: -6 },
  calendarCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 16, fontFamily: fonts.bodySemibold },
  // Slots section
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dayHeaderLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dayHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginLeft: 12, marginRight: 12 },
  dayHeaderAdd: { padding: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dayAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  dayAvatarRing: { borderRadius: 24, borderWidth: 2 },
  dayRowInfo: { flex: 1 },
  dayNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  dayRowName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  dayRowSub: { fontSize: 13 },
  dayRowTime: { fontSize: 13, fontWeight: '500' },
  dayDismissBtn: { padding: 4, marginLeft: 2 },
  dayDashedCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  swipeDeleteAction: { justifyContent: 'center', paddingVertical: 11, paddingLeft: 16, paddingRight: 8 },
  swipeDeleteBtn: { flex: 1, width: 77, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  swipeDeleteText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  slotsSection: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 20 },
  noSlotsCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  noSlotsText: { fontSize: 14 },
  noSlotsLine: { fontSize: 16, paddingTop: 4, paddingBottom: 4 },
  // Slot cards
  // Slot action menu
  // Modal
  // Sticky Send All bottom bar
  // Send action sheet
  // Header Send button
  headerSendBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  headerSendText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
  // Send FAB (kept for style reference, no longer rendered)
  // Lineup Balance panel
  lineupPanel: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  lineupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  lineupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineupTitle: { fontSize: 14, fontWeight: '700' },
  lineupBody: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  lineupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineupRowInfo: { flex: 1, gap: 4 },
  lineupRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineupDJName: { fontSize: 13, fontWeight: '600', flex: 1 },
  lineupCount: { fontSize: 12, fontWeight: '700' },
  lineupBarTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  lineupBarFill: { height: 4, borderRadius: 2 },
  lineupEmptyText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6 },
  // Month-start-day picker
  // Dot legend
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  assignRowText: { fontSize: 13, fontWeight: '600' },
});

// ─── Add / Edit Slot sheet styles ────────────────────────────────────────────
const slotModalStyles = StyleSheet.create({
  // Wrapper — fills screen with dim overlay, positions sheet above keyboard zone
  // The white/dark card
  sheet: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 13,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  // Drag handle row
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  // Single / Multiple segmented toggle (mirrors the calendar Month/Week/Day view toggle)
  // Header: title + close button
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: fonts.bodyBold,
    letterSpacing: -0.4,
    marginBottom: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  // Each form section
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  // Venue pills
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
    alignItems: 'center',
  },
  venuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 34,
  },
  venuePillText: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  // Preset name chips
  // Text input
  // Time row
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  timeSep: {
    paddingTop: 28,
  },
  // Dropdown trigger button
  timeDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 42,
  },
  timeDropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Absolutely-positioned floating dropdown (overlays content below, no layout shift)
  timeDropdownAbsolute: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  // Dropdown list
  timeDropdownList: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  timeDropdownScroll: {
    maxHeight: 160,
  },
  timeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  timeOptionText: {
    fontSize: 14,
  },
  // CTA
});
