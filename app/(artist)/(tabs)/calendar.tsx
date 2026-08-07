import { useRoleSwitching } from '@/lib/roles';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, TextInput, Dimensions, PanResponder, Animated, Platform, RefreshControl, Image } from '@/lib/rn';
import { venueImageFor } from '@/lib/venue-images';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useAvailabilityStore, useBookingStore, useSlotStore, useVenueStore, useNotificationStore, useCalendarJumpStore, useInvoiceStore, useInvoiceReminderStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { fetchPrivateEventBookings } from '@/lib/private-events';
import { fonts } from '@/lib/fonts';
import { SHOW_CALENDAR_LEGEND } from '@/lib/features';
import { useColors } from '@/hooks/use-colors';
import type { AvailabilityBlock, Booking, BookingStatus } from '@/lib/types';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW } from '@/app/(artist)/settings';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import * as Calendar from 'expo-calendar';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastEnd, nowLocalDateTimeStr, todayLocalStr, firstName, bookingVenueName } from '@/lib/utils';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { rescheduleArtistReminders } from '@/lib/reminders';

// Monday-first day labels (matching manager calendar)
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Same TIME_OPTIONS as manager calendar
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

// Status colors

type ViewMode = 'week' | 'month' | 'today';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr: string) {
  // Compact uppercase header, e.g. "FRI 7 AUG".
  const d = new Date(dateStr + 'T00:00:00');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${wd} ${d.getDate()} ${mon}`;
}

// isPastEnd here must match how isCompleted is written in lib/private-events.ts and
// add-block.tsx — these re-derive "is it over?" at render instead of reading the flag,
// so if the two rules drift a private event shows one thing and stores another.
function getBookingStatusColor(b: { status: string; isArtistCreated?: boolean; slotDate?: string; slotStartTime?: string; slotEndTime?: string }): string {
  if (b.isArtistCreated) {
    const isPast = isPastEnd(b.slotDate ?? '', b.slotStartTime, b.slotEndTime);
    return isPast ? STATUS_COLORS.completed : STATUS_COLORS.confirmed;
  }
  if (b.status === 'expired') return '#8E8E93';
  if (b.status === 'requested' || b.status === 'past_confirmation') return STATUS_COLORS.pending;
  if (b.status === 'confirmed') return STATUS_COLORS.confirmed;
  if (b.status === 'completed') return STATUS_COLORS.completed;
  if (b.status === 'cancelled' || b.status === 'declined') return STATUS_COLORS.cancelled;
  return '#9BA1A6';
}

function getBookingStatusLabel(b: { status: string; isArtistCreated?: boolean; slotDate?: string; slotStartTime?: string; slotEndTime?: string }): string {
  if (b.isArtistCreated) {
    const isPast = isPastEnd(b.slotDate ?? '', b.slotStartTime, b.slotEndTime);
    return isPast ? 'Completed' : 'Private Event';
  }
  if (b.status === 'expired') return 'Expired';
  if (b.status === 'requested' || b.status === 'past_confirmation') return 'Pending';
  if (b.status === 'confirmed') return 'Confirmed';
  if (b.status === 'completed') return 'Completed';
  if (b.status === 'cancelled') return 'Cancelled';
  if (b.status === 'declined') return 'Declined';
  return b.status;
}

export default function DJAvailabilityScreen() {
  const colors = useColors();
  // Drops the RefreshControl during a role switch — unmounting one with the group
  // crashes natively. See useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBlocks = useAvailabilityStore((s) => s.blocks);
  const blocks = useMemo(
    () => allBlocks.filter((b) => b.artistId === currentUser?.id),
    [allBlocks, currentUser?.id]
  );
  const addBlock = useAvailabilityStore((s) => s.addBlock);
  const deleteBlock = useAvailabilityStore((s) => s.deleteBlock);
  const allBookings = useBookingStore((s) => s.bookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromCalendar = useBookingStore((s) => s.hideFromCalendar);
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markNotifAsRead = useNotificationStore((s) => s.markAsRead);
  const addNotification = useNotificationStore((s) => s.addNotification);
  // (Overdue-invoice indicator + invoice button moved to the Completed Gigs page.)

  // Helper: send a notification to the manager
  const notifyManager = (type: 'booking_confirmed' | 'booking_declined' | 'booking_cancelled_by_artist', b: { id: string; managerId: string; resolvedVenueName?: string; resolvedDate?: string }) => {
    if (!currentUser) return;
    const titles: Record<string, string> = {
      booking_confirmed: 'Gig Confirmed',
      booking_declined: 'Gig Declined',
      booking_cancelled_by_artist: 'Artist Cancelled',
    };
    const verbs: Record<string, string> = {
      booking_confirmed: 'accepted',
      booking_declined: 'declined',
      booking_cancelled_by_artist: 'cancelled',
    };
    const dateStr = b.resolvedDate ? formatDate(b.resolvedDate) : '';
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: b.managerId,
      type,
      title: titles[type],
      body: `${firstName(currentUser.fullName, 'An artist')} ${verbs[type]} ${b.resolvedVenueName ?? 'a venue'}, ${dateStr}`,
      isRead: false,
      relatedId: b.id,
      relatedType: 'booking',
      createdAt: new Date().toISOString(),
    });
  };

  // Helper: mark any unread notification related to a booking as read
  const markRelatedNotificationsRead = (bookingId: string) => {
    allNotifications
      .filter(
        (n) =>
          n.userId === currentUser?.id &&
          !n.isRead &&
          n.relatedId === bookingId &&
          n.relatedType === 'booking'
      )
      .forEach((n) => markNotifAsRead(n.id));
  };

  // My bookings with slot data resolved
  const myBookings = useMemo(() => {
    return allBookings
      .filter((b) => b.artistId === currentUser?.id && !b.hiddenFromCalendar && !b.cancelledAsRequest)
      .map((b) => {
        const slot = allSlots.find((s) => s.id === b.slotId);
        const resolvedDate = slot?.date ?? b.slotDate;
        const resolvedStart = slot?.startTime ?? b.slotStartTime;
        const resolvedEnd = slot?.endTime ?? b.slotEndTime;
        const resolvedSlotName = slot?.name ?? b.slotName;
        const venue = allVenues.find((v) => v.id === b.venueId);
        const resolvedVenueName = bookingVenueName(b, venue?.name);
        return { ...b, resolvedDate, resolvedStart, resolvedEnd, resolvedSlotName, resolvedVenueName };
      })
      .filter((b) => b.resolvedDate);
  }, [allBookings, allSlots, allVenues, currentUser?.id]);

  const now = new Date();
  const todayStr = formatDateStr(now);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [defaultViewMode, setDefaultViewMode] = useState<ViewMode>('month');
  const defaultViewApplied = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const pending = useCalendarJumpStore.getState().pendingDate;
      if (pending) {
        const d = new Date(pending + 'T00:00:00');
        setViewMode('month');
        setCurrentMonth(d.getMonth());
        setCurrentYear(d.getFullYear());
        setSelectedDate(pending);
        useCalendarJumpStore.getState().setPendingDate(null);
      }
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW).then((val) => {
        const saved: ViewMode = (val === 'week' || val === 'month' || val === 'today') ? val : 'month';
        setDefaultViewMode(saved);
        if (!defaultViewApplied.current) {
          setViewMode(saved);
          defaultViewApplied.current = true;
        }
      });
    }, [])
  );

  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(now));

  // Day view state — starts on today, can navigate between days
  const [viewedDayStr, setViewedDayStr] = useState(todayStr);

  // Three-dot menu state: { type: 'booking'|'block', id: string } | null

  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBookingFn = useBookingStore((s) => s.addBooking);
  const [calRefreshing, setCalRefreshing] = useState(false);

  const handleCalRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setCalRefreshing(true);
    // Private events live in availability_blocks (NOT the bookings table), so a
    // bookings-only refresh would wipe them. Rebuild them too — same source of truth
    // as the cold-start loader (lib/private-events.ts).
    const [bookingsRes, privateBookings] = await Promise.all([
      supabase.from('bookings').select('*').eq('artist_id', currentUser.id),
      fetchPrivateEventBookings(currentUser.id),
    ]);
    const data = bookingsRes.data;
    if (data) {
      clearBookings();
      data.forEach((b: any) => addBookingFn({
        id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
        managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
        confirmedAt: b.confirmed_at ?? undefined, cancelledAt: b.cancelled_at ?? undefined,
        cancellationReason: b.cancellation_reason ?? undefined,
        cancellationAcknowledged: b.cancellation_acknowledged ?? false,
        cancelledAsRequest: b.cancelled_as_request ?? false,
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        isArtistCreated: b.is_artist_created ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
        venueName: b.venue_name ?? undefined, venueType: b.venue_type ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    privateBookings.forEach((bk) => addBookingFn(bk));
    setCalRefreshing(false);
  }, [currentUser?.id]);

  // Calendar Sync modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  // Set of booking IDs that have already been exported to device calendar
  const [exportedGigIds, setExportedGigIds] = useState<Set<string>>(new Set());
  const EXPORTED_GIGS_KEY = `exported_gig_ids_${currentUser?.id ?? 'unknown'}`;
  // Selected gig IDs for export (pre-selected = all unexported)
  const [selectedGigIds, setSelectedGigIds] = useState<Set<string>>(new Set());

  // Load exported gig IDs from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(EXPORTED_GIGS_KEY).then((val) => {
      if (val) {
        try { setExportedGigIds(new Set(JSON.parse(val))); } catch {}
      }
    });
  }, [EXPORTED_GIGS_KEY]);

  const markGigExported = async (id: string) => {
    const updated = new Set(exportedGigIds).add(id);
    setExportedGigIds(updated);
    await AsyncStorage.setItem(EXPORTED_GIGS_KEY, JSON.stringify(Array.from(updated)));
  };

  // Upcoming confirmed gigs for sync
  const confirmedGigs = useMemo(() => {
    const today = todayLocalStr();
    return myBookings
      .filter((b) => b.status === 'confirmed' && b.resolvedDate && b.resolvedDate >= today)
      .sort((a, b) => (a.resolvedDate ?? '').localeCompare(b.resolvedDate ?? ''));
  }, [myBookings]);

  // Gigs not yet exported (used by Export All)
  const unexportedGigs = useMemo(
    () => confirmedGigs.filter((g) => !exportedGigIds.has(g.id)),
    [confirmedGigs, exportedGigIds]
  );

  // Helper: get a writable calendar ID
  const getWritableCalendarId = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Calendar export is not available on web.');
      return null;
    }
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow calendar access to export gigs.');
      return null;
    }
    if (Platform.OS === 'ios') {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      return defaultCal.id;
    } else {
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.filter((c) => c.allowsModifications);
      if (writable.length === 0) {
        Alert.alert('No Calendar', 'No writable calendar found on this device.');
        return null;
      }
      return writable[0].id;
    }
  };

  // Helper: create a calendar event for a gig
  const createCalendarEvent = async (calendarId: string, gig: typeof confirmedGigs[number]) => {
    const dateStr = gig.resolvedDate!;
    const startTimeStr = gig.resolvedStart ?? '20:00';
    const startDate = new Date(`${dateStr}T${startTimeStr}:00`);
    const endDate = new Date(startDate);
    await Calendar.createEventAsync(calendarId, {
      title: gig.resolvedVenueName,
      startDate,
      endDate,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: gig.resolvedVenueName,
      notes: `Confirmed gig exported from Nexgig`,
      alarms: [{ relativeOffset: -60 }],
    });
  };

  // Export a single gig to device calendar

  const exportAllGigs = async () => {
    const gigsToExport = unexportedGigs.filter((g) => selectedGigIds.has(g.id));
    if (gigsToExport.length === 0) {
      Alert.alert('Nothing Selected', 'Select at least one gig to export.');
      return;
    }
    try {
      const calendarId = await getWritableCalendarId();
      if (!calendarId) return;
      const exportedVenueNames: string[] = [];
      for (const gig of gigsToExport) {
        await createCalendarEvent(calendarId, gig);
        await markGigExported(gig.id);
        exportedVenueNames.push(gig.resolvedVenueName);
      }
      const exported = exportedVenueNames.length;
      let venueList: string;
      if (exported === 1) {
        venueList = `${exportedVenueNames[0]}'s Gig`;
      } else if (exported === 2) {
        venueList = `${exportedVenueNames[0]}'s and ${exportedVenueNames[1]}'s Gigs`;
      } else {
        const last = exportedVenueNames[exported - 1];
        const rest = exportedVenueNames.slice(0, -1).map((n) => `${n}'s`).join(', ');
        venueList = `${rest}, and ${last}'s Gigs`;
      }
      Alert.alert('Added to Calendar', `${venueList} have been added to your phone calendar.`);
      setShowSyncModal(false);
    } catch {
      Alert.alert('Error', 'Failed to export gigs to calendar.');
    }
  };

  // Export a private booking to device calendar
  const exportPrivateBookingToCalendar = async (b: typeof myBookings[number]) => {
    try {
      const calendarId = await getWritableCalendarId();
      if (!calendarId) return;
      const dateStr = b.resolvedDate!;
      const startTimeStr = b.slotStartTime ?? '00:00';
      const startDate = new Date(`${dateStr}T${startTimeStr}:00`);
      const endDate = new Date(startDate);
      const title = b.slotName ?? 'Private Event';
      await Calendar.createEventAsync(calendarId, {
        title,
        startDate,
        endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: b.privateEventLocation ?? undefined,
        notes: 'Private booking exported from Nexgig',
        alarms: [{ relativeOffset: -60 }],
      });
      await markGigExported(b.id);
      const exportVenueName = b.venueName ?? b.resolvedVenueName ?? title;
      Alert.alert('Added to Calendar', `${exportVenueName}'s Gig has been added to your phone calendar.`);
    } catch {
      Alert.alert('Error', 'Failed to export to calendar.');
    }
  };

  // Toggle a gig selection
  const toggleGigSelection = (id: string) => {
    setSelectedGigIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Blocked dates set
  const blockedDates = useMemo(() => new Set(blocks.map((b) => b.date)), [blocks]);

  // Bookings grouped by date
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, typeof myBookings>();
    myBookings.forEach((b) => {
      if (b.resolvedDate) {
        const existing = map.get(b.resolvedDate) ?? [];
        map.set(b.resolvedDate, [...existing, b]);
      }
    });
    return map;
  }, [myBookings]);

  // ─── Month calendar cells (Monday-first) ───
  const calCells = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayJS = new Date(currentYear, currentMonth, 1).getDay();
    const firstDayMon = toMondayIndex(firstDayJS);
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDayMon; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(currentMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push(`${currentYear}-${m}-${dd}`);
    }
    return cells;
  }, [currentYear, currentMonth]);

  // ─── Week days ───
  const weekDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(formatDateStr(d));
    }
    return days;
  }, [weekStart]);

  // ─── Blocks for selected date ───
  const selectedDateBlocks = useMemo(
    () => blocks.filter((b) => b.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [blocks, selectedDate]
  );

  // ─── Navigation ───
  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
    else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
    else setCurrentMonth((m) => m + 1);
  };
  const goToday = () => {
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(todayStr);
  };
  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  // Day navigation
  const prevDay = () => {
    const d = new Date(viewedDayStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setViewedDayStr(formatDateStr(d));
  };
  const nextDay = () => {
    const d = new Date(viewedDayStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setViewedDayStr(formatDateStr(d));
  };

  const handleDayPress = (date: string) => setSelectedDate(date === selectedDate ? '' : date);

  const openAddModal = (date: string) => {
    router.push(('/(artist)/add-block?date=' + encodeURIComponent(date)) as Href);
  };

  // Simple UUID generator for Supabase rows (kept for any future inline use)
  const genUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

  const handleDeleteBlock = (id: string) => {
    deleteBlock(id);
    supabase.from('availability_blocks').delete().eq('id', id)
      .then(({ error }) => { if (error) console.warn('block delete error:', error.message); });
  };



  const handleCancelManagerBooking = (bookingId: string, venueName: string) => {
    Alert.alert(
      'Decline Booking',
      `Decline your booking at ${venueName}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            const booking = allBookings.find((b) => b.id === bookingId);
            updateBookingStatus(bookingId, 'declined', { artistRespondedFromRequests: true });
            hideFromCalendar(bookingId);
            syncBookingStatus(bookingId, 'declined', { hiddenFromCalendar: true });
            markRelatedNotificationsRead(bookingId);
            if (currentUser?.id) rescheduleArtistReminders(currentUser.id);
            if (booking) {
              notifyManager('booking_declined', { id: booking.id, managerId: booking.managerId, resolvedVenueName: venueName, resolvedDate: booking.slotDate ?? allSlots.find((s) => s.id === booking.slotId)?.date });
            }
          },
        },
      ]
    );
  };



  // ─── Render a booking card (same design as manager slot card) ───
  const renderBookingCard = (b: typeof myBookings[0], _showDelete: boolean) => {
    const statusColor = getBookingStatusColor(b);
    const isCancelled = b.status === 'cancelled';
    const isDeclined = b.status === 'declined';
    const isRequested = b.status === 'requested' || b.status === 'past_confirmation';
    const isConfirmed = b.status === 'confirmed';
    const isCompleted = b.status === 'completed';
    // Nobody answered before the gig ended. Dismissible like a cancellation, but grey:
    // nothing was taken away, the request simply ran out of time.
    const isExpired = b.status === 'expired';

    // Determine the right action icon for non-artist-created bookings
    const renderActionBtn = () => {
      if (b.isArtistCreated) {
        // Artist-created events: show export icon if not yet exported, X cancel button
        const isExported = exportedGigIds.has(b.id);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {!isExported && Platform.OS !== 'web' && (
              <Pressable
                style={({ pressed }) => [styles.slotMenuBtn, { opacity: pressed ? 0.5 : 1 }]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  exportPrivateBookingToCalendar(b);
                }}
              >
                <MaterialIcons name="event" size={20} color={colors.primary} />
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.slotMenuBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={(e) => {
                e.stopPropagation?.();
                Alert.alert(
                  'Remove Private Booking',
                  `Remove "${b.slotName ?? b.resolvedVenueName ?? 'this booking'}" from your calendar? This cannot be undone.`,
                  [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Remove', style: 'destructive',
                      onPress: () => {
                        deleteBooking(b.id);
                        supabase.from('availability_blocks').delete().eq('id', b.id)
                          .then(({ error }) => { if (error) console.warn('availability_blocks delete error:', error.message); });
                        markRelatedNotificationsRead(b.id);
                      }
                    },
                  ]
                );
              }}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </Pressable>
          </View>
        );
      }
      if (isCancelled || isDeclined || isExpired) {
        // X to dismiss a cancelled/declined/expired row (declined never actually reaches the
        // artist calendar — it's hidden on decline — so in practice this is the cancelled case).
        return (
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.slotMenuBtn, { opacity: pressed ? 0.5 : 1 }]}
            onPress={(e) => {
              e.stopPropagation?.();
              hideFromCalendar(b.id);
              updateBookingStatus(b.id, b.status as BookingStatus, { cancellationAcknowledged: true });
              markRelatedNotificationsRead(b.id);
              syncBookingStatus(b.id, b.status as any, { hiddenFromCalendar: true, cancellationAcknowledged: true });
            }}
          >
            <MaterialIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        );
      }
      if (isRequested) {
        // Checkmark (confirm) + X (decline) inline buttons
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              style={({ pressed }) => [styles.slotMenuBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={(e) => {
                e.stopPropagation?.();
                const bookingDate = b.resolvedDate ?? '';
                const isPast = bookingDate !== '' && isPastEnd(bookingDate, b.resolvedStart ?? '23:59', b.resolvedEnd);
                if (isPast) {
                  Alert.alert(
                    'Did You Play This Gig?',
                    `Confirm that you performed at ${b.resolvedVenueName} on ${bookingDate}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Confirm',
                        onPress: () => {
                          const now = new Date().toISOString();
                          const booking = allBookings.find((x) => x.id === b.id);
                          updateBookingStatus(b.id, 'completed', {
                            isCompleted: true,
                            confirmedAt: now,
                            updatedAt: now,
                            artistRespondedFromRequests: true,
                            slotDate: b.resolvedDate,
                            slotName: b.resolvedSlotName,
                            slotStartTime: b.resolvedStart,
                            slotEndTime: b.resolvedEnd,
                            venueName: b.resolvedVenueName,
                          });
                          syncBookingStatus(b.id, 'completed', { isCompleted: true, confirmedAt: now });
                          markRelatedNotificationsRead(b.id);
                          if (booking) { notifyManager('booking_confirmed', { ...b, managerId: booking.managerId }); }
                        },
                      },
                    ]
                  );
                } else {
                  Alert.alert(
                    'Confirm Booking',
                    `Confirm your booking at ${b.resolvedVenueName}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Confirm',
                        onPress: () => {
                          const booking = allBookings.find((x) => x.id === b.id);
                          updateBookingStatus(b.id, 'confirmed', { confirmedAt: new Date().toISOString(), artistRespondedFromRequests: true });
                          syncBookingStatus(b.id, 'confirmed', { confirmedAt: new Date().toISOString() });
                          markRelatedNotificationsRead(b.id);
                          if (booking) { notifyManager('booking_confirmed', { ...b, managerId: booking.managerId }); }
                        },
                      },
                    ]
                  );
                }
              }}
            >
              <MaterialIcons name="check" size={20} color={colors.success} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.slotMenuBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={(e) => {
                e.stopPropagation?.();
                handleCancelManagerBooking(b.id, b.resolvedVenueName ?? '');
              }}
            >
              <MaterialIcons name="close" size={20} color={colors.error} />
            </Pressable>
          </View>
        );
      }
      if (isConfirmed) {
        // No inline actions on a confirmed booking card. The export and cancel buttons
        // were removed from here — tapping the card opens booking-detail, which has both
        // Cancel Booking and (via the header) calendar sync. Keeps the card tap-only.
        return null;
      }
      if (isCompleted) {
        // No action button for completed bookings
        return null;
      }
      return null;
    };

    return (
      <Pressable
        key={b.id}
        style={({ pressed }) => [styles.bookingCard, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        onPress={() => !isCancelled && !isDeclined && router.push(('/(artist)/booking-detail?id=' + b.id) as Href)}
      >
        {b.isArtistCreated ? (
          <View style={[styles.bookingThumb, styles.bookingThumbPrivate, { backgroundColor: statusColor }]}>
            <MaterialIcons name="event" size={22} color="#fff" />
          </View>
        ) : (
          <Image source={venueImageFor(undefined, b.venueType)} style={styles.bookingThumb} resizeMode="cover" />
        )}
        <View style={styles.bookingInfo}>
          <View style={styles.bookingTop}>
            <Text style={[styles.bookingTitle, { color: colors.foreground }]} numberOfLines={1}>
              {b.isArtistCreated ? (b.slotName ?? b.resolvedVenueName) : (b.resolvedVenueName)}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>{getBookingStatusLabel(b)}</Text>
            </View>
          </View>
          {(b.resolvedStart || b.resolvedSlotName) && !b.isArtistCreated && (
            <Text style={[styles.bookingSub, { color: colors.muted }]}>
              {b.resolvedStart && b.resolvedEnd ? `${fmtTime(b.resolvedStart)} – ${fmtTime(b.resolvedEnd)}` : ''}
              {b.resolvedSlotName ? (b.resolvedStart ? ` · ${b.resolvedSlotName}` : b.resolvedSlotName) : ''}
            </Text>
          )}
          {b.isArtistCreated && b.slotStartTime && b.slotEndTime && (
            <Text style={[styles.bookingSub, { color: colors.muted }]}>
              {b.slotStartTime === '00:00' && b.slotEndTime === '23:59' ? 'Full Day' : `${fmtTime(b.slotStartTime)} – ${fmtTime(b.slotEndTime)}`}
            </Text>
          )}
        </View>
        {renderActionBtn()}
      </Pressable>
    );
  };

  // ─── Render a block card (same design as slot card, red color bar) ───
  const renderBlockCard = (b: AvailabilityBlock) => (
    <View key={b.id} style={[styles.slotCard, { borderColor: colors.border }]}>
      <View style={[styles.slotColorBar, { backgroundColor: STATUS_COLORS.cancelled }]} />
      <View style={styles.slotCardContent}>
        <View style={styles.slotCardTop}>
          <Text style={[styles.slotCardTitle, { color: colors.foreground }]} numberOfLines={1}>
            Unavailable
          </Text>
        </View>
        <Text style={[styles.slotCardSub, { color: colors.muted }]}>
          {b.fullDay ? 'Full Day' : `${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`}
        </Text>
        <Text style={[styles.slotCardStatus, { color: STATUS_COLORS.cancelled }]}>
            Blocked
          </Text>
      </View>
      <Pressable
        style={({ pressed }) => [{ padding: 6, borderRadius: 14, backgroundColor: colors.error + '15', marginRight: 12, opacity: pressed ? 0.6 : 1 }]}
        onPress={() => handleDeleteBlock(b.id)}
        hitSlop={8}
      >
        <MaterialIcons name="delete-outline" size={18} color={colors.error} />
      </Pressable>
    </View>
  );

  // ─── Week range label ───
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })} – ${weekEndDate.toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // ─── Dot legend items ───
  const LEGEND = [
    { color: STATUS_COLORS.pending, label: 'Requested' },
    { color: STATUS_COLORS.confirmed, label: 'Confirmed' },
    { color: STATUS_COLORS.completed, label: 'Completed' },
    { color: STATUS_COLORS.cancelled, label: 'Declined / Cancelled' },
  ];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={calRefreshing} onRefresh={handleCalRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Calendar</Text>
          <View style={styles.headerRight}>
            {/* Sync-to-calendar moved here from the month-nav row. Invoices moved to the
                Completed Gigs page. */}
            <Pressable
              style={({ pressed }) => [styles.notifBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => {
                setSelectedGigIds(new Set(unexportedGigs.map((g) => g.id)));
                setShowSyncModal(true);
              }}
            >
              <MaterialIcons name="event-available" size={22} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* View Mode Toggle — 3 buttons matching manager style */}
        {(() => {
          const allModes: { mode: ViewMode; label: string; icon: 'calendar-month' | 'view-week' | 'today' }[] = [
            { mode: 'month', label: 'Month', icon: 'calendar-month' },
            { mode: 'week', label: 'Week', icon: 'view-week' },
            { mode: 'today', label: 'Day', icon: 'today' },
          ];
          // Put saved default first, keep the rest in original order
          const ordered = [
            ...allModes.filter((m) => m.mode === defaultViewMode),
            ...allModes.filter((m) => m.mode !== defaultViewMode),
          ];
          return (
            <View style={styles.viewToggleContainer}>
              <View style={[styles.viewToggle, { backgroundColor: colors.surface }]}>
                {ordered.map(({ mode, label, icon }) => (
                  <Pressable
                    key={mode}
                    style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive, viewMode === mode && [styles.toggleBtnActive, { backgroundColor: colors.background }]]}
                    onPress={() => { setViewMode(mode); if (mode === 'today') setViewedDayStr(todayStr); }}
                  >
                    {viewMode === mode ? <MaterialIcons name={icon} size={15} color={colors.foreground} /> : null}
                    <Text style={[styles.toggleBtnText, { color: viewMode === mode ? colors.foreground : colors.muted }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ─── WEEK VIEW ─── */}
        {viewMode === 'week' && (
          <View>
            {/* Week Navigation */}
            <View style={styles.weekNav}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 64 }}>
                <Pressable onPress={prevWeek} style={styles.monthNavBtn}>
                  <MaterialIcons name="chevron-left" size={28} color={colors.foreground} />
                </Pressable>
              </View>
              <Text style={[styles.weekLabel, { color: colors.foreground, flex: 1, textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>{weekLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 64, justifyContent: 'flex-end' }}>
                <Pressable onPress={nextWeek} style={styles.monthNavBtn}>
                  <MaterialIcons name="chevron-right" size={28} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            {/* Week Days */}
            <View style={styles.weekDaysContainer}>
              {weekDays.map((dateStr, idx) => {
                const dayDate = new Date(dateStr + 'T00:00:00');
                const isToday = dateStr === todayStr;
                const dayBookings = bookingsByDate.get(dateStr) ?? [];
                const dayBlocks = blocks.filter((b) => b.date === dateStr);

                return (
                  <View key={dateStr} style={[styles.weekDaySection, { borderBottomColor: colors.border }]}>
                    <View style={styles.weekDayHeader}>
                      <View style={[styles.weekDayBadge, { backgroundColor: isToday ? colors.primary : 'transparent' }]}>
                        <Text style={[styles.weekDayShort, { color: isToday ? '#fff' : colors.muted }]}>{DAYS_SHORT[idx]}</Text>
                        <Text style={[styles.weekDayNum, { color: isToday ? '#fff' : colors.foreground }]}>{dayDate.getDate()}</Text>
                      </View>
                      <View style={styles.weekDayMeta}>
                        <Text style={[styles.weekDayFull, { color: colors.foreground }]}>{DAYS_FULL[idx]}</Text>
                        {(dayBookings.length > 0 || dayBlocks.length > 0) && (
                          <Text style={[styles.weekDaySlotCount, { color: colors.muted }]}>
                            {dayBookings.length > 0 ? `${dayBookings.length} gig${dayBookings.length !== 1 ? 's' : ''}` : ''}
                            {dayBookings.length > 0 && dayBlocks.length > 0 ? ' · ' : ''}
                            {dayBlocks.length > 0 ? `${dayBlocks.length} blocked` : ''}
                          </Text>
                        )}
                      </View>
                      <Pressable style={({ pressed }) => [styles.weekAddBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => { setSelectedDate(dateStr); openAddModal(dateStr); }}>
                        <MaterialIcons name="add" size={18} color={colors.primary} />
                      </Pressable>
                    </View>

                    {/* Booking cards */}
                    {dayBookings.length > 0 && (
                      <View style={styles.weekSlotsContainer}>
                        {dayBookings.map((b) => renderBookingCard(b, true))}
                      </View>
                    )}

                    {/* Block cards */}
                    {dayBlocks.length > 0 && (
                      <View style={[styles.weekSlotsContainer, { marginTop: dayBookings.length > 0 ? 4 : 0 }]}>
                        {dayBlocks.map((b) => renderBlockCard(b))}
                      </View>
                    )}

                    {dayBookings.length === 0 && dayBlocks.length === 0 && (
                      <View style={styles.weekEmptyDay}>
                        <Text style={[styles.weekEmptyText, { color: colors.muted }]}>No gigs or blocks</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ─── TODAY VIEW ─── */}
        {viewMode === 'today' && (() => {
          const viewedDate = new Date(viewedDayStr + 'T00:00:00');
          const mondayIdx = toMondayIndex(viewedDate.getDay());
          const dayBookings = bookingsByDate.get(viewedDayStr) ?? [];
          const dayBlocks = blocks.filter((b) => b.date === viewedDayStr);
          const hasItems = dayBookings.length > 0 || dayBlocks.length > 0;
          const isActualToday = viewedDayStr === todayStr;
          const badgeBg = isActualToday ? colors.primary : 'transparent';
          const badgeTextColor = isActualToday ? '#fff' : colors.foreground;
          const dayNavLabel = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
          return (
            <View>
              {/* Day navigation bar — same pattern as month nav */}
              <View style={styles.monthNav}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 64 }}>
                  <Pressable onPress={prevDay} style={styles.monthNavBtn}>
                    <MaterialIcons name="chevron-left" size={28} color={colors.foreground} />
                  </Pressable>
                </View>
                <Text style={[styles.weekLabel, { color: colors.foreground, flex: 1, textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>{dayNavLabel}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 64, justifyContent: 'flex-end' }}>
                  <Pressable onPress={nextDay} style={styles.monthNavBtn}>
                    <MaterialIcons name="chevron-right" size={28} color={colors.foreground} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.weekDaysContainer}>
                <View style={[styles.weekDaySection, { borderBottomColor: colors.border }]}>
                  <View style={styles.weekDayHeader}>
                    <View style={[styles.weekDayBadge, { backgroundColor: badgeBg, borderWidth: isActualToday ? 0 : 1, borderColor: colors.border }]}>
                      <Text style={[styles.weekDayShort, { color: badgeTextColor }]}>{DAYS_SHORT[mondayIdx]}</Text>
                      <Text style={[styles.weekDayNum, { color: badgeTextColor }]}>{viewedDate.getDate()}</Text>
                    </View>
                    <View style={styles.weekDayMeta}>
                      <Text style={[styles.weekDayFull, { color: colors.foreground }]}>{DAYS_FULL[mondayIdx]}</Text>
                      {hasItems && (
                        <Text style={[styles.weekDaySlotCount, { color: colors.muted }]}>
                          {dayBookings.length > 0 ? `${dayBookings.length} gig${dayBookings.length !== 1 ? 's' : ''}` : ''}
                          {dayBookings.length > 0 && dayBlocks.length > 0 ? ' · ' : ''}
                          {dayBlocks.length > 0 ? `${dayBlocks.length} blocked` : ''}
                        </Text>
                      )}
                    </View>
                    <Pressable style={({ pressed }) => [styles.weekAddBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => openAddModal(viewedDayStr)}>
                      <MaterialIcons name="add" size={18} color={colors.primary} />
                    </Pressable>
                  </View>
                  {dayBookings.length > 0 && (
                    <View style={styles.weekSlotsContainer}>
                      {dayBookings.map((b) => renderBookingCard(b, true))}
                    </View>
                  )}
                  {dayBlocks.length > 0 && (
                    <View style={[styles.weekSlotsContainer, { marginTop: dayBookings.length > 0 ? 4 : 0 }]}>
                      {dayBlocks.map((b) => renderBlockCard(b))}
                    </View>
                  )}
                  {!hasItems && (
                    <View style={styles.weekEmptyDay}>
                      <Text style={[styles.weekEmptyText, { color: colors.muted }]}>No gigs or blocks {isActualToday ? 'today' : 'on this day'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        {/* ─── MONTH VIEW ─── */}
        {viewMode === 'month' && (
          <View>
            {/* Month Navigation */}
            <View style={styles.monthNav}>
              <View style={styles.monthNavLeft}>
                <Text style={[styles.monthTitle, { color: colors.foreground }]}>{MONTHS[currentMonth]} {currentYear}</Text>
                <Pressable onPress={prevMonth} style={styles.monthNavBtn} hitSlop={6}>
                  <MaterialIcons name="chevron-left" size={26} color={colors.foreground} />
                </Pressable>
                <Pressable onPress={nextMonth} style={styles.monthNavBtn} hitSlop={6}>
                  <MaterialIcons name="chevron-right" size={26} color={colors.foreground} />
                </Pressable>
              </View>
              <Pressable onPress={goToday} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <Text style={[styles.todayBtnText, { color: colors.primary }]}>Today</Text>
              </Pressable>
            </View>

            {/* Day Labels */}
            <View style={styles.dayLabels}>
              {DAYS_SHORT.map((d) => (
                <Text key={d} style={[styles.dayLabel, { color: colors.muted }]}>{d}</Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calCells.map((date, i) => {
                if (!date) return <View key={`empty-${i}`} style={styles.calendarCell} />;
                const dayNum = parseInt(date.split('-')[2]);
                const isToday = date === todayStr;
                const isSelected = date === selectedDate;
                const dayBookings = bookingsByDate.get(date) ?? [];
                const isBlocked = blockedDates.has(date);
                const isFuture = date >= todayStr;

                // The day fills with ONE winning colour: pending (gold) > booked (green) >
                // cancelled (slate). Completed gigs don't colour a day (only the colour goes —
                // the gig still lists below and in Completed Gigs). Blocked future days = slate.
                // Branch on STATUS, not colour: STATUS_COLORS.completed === .cancelled (same slate
                // hex), so a colour comparison can't keep completed uncoloured.
                let hasPending = false, hasBooked = false, hasCancelled = false;
                for (const b of dayBookings) {
                  if (b.isArtistCreated) {
                    // Private event: green while upcoming; a past one is "completed" → no colour.
                    if (!isPastEnd(b.slotDate ?? '', b.slotStartTime, b.slotEndTime)) hasBooked = true;
                    continue;
                  }
                  if (b.status === 'requested' || b.status === 'past_confirmation') hasPending = true;
                  else if (b.status === 'confirmed') hasBooked = true;
                  else if (b.status === 'cancelled' || b.status === 'declined') hasCancelled = true;
                  // completed / expired → no colour
                }
                if (isBlocked && isFuture) hasCancelled = true;
                const dayColor = hasPending ? STATUS_COLORS.pending
                  : hasBooked ? STATUS_COLORS.confirmed
                  : hasCancelled ? STATUS_COLORS.cancelled
                  : null;

                return (
                  <Pressable
                    key={date}
                    style={styles.calendarCell}
                    onPress={() => handleDayPress(date)}
                  >
                    {/* Ring wrapper: fixed footprint; when selected it insets the square with a
                        2px gap and a 2px coral ring, so the row height never shifts. */}
                    <View style={[styles.dayCellRing, isSelected && { padding: 2, borderWidth: 2, borderColor: colors.primary, borderRadius: 14 }]}>
                      <View style={[styles.dayCell, dayColor ? { backgroundColor: dayColor } : null]}>
                        <Text style={[
                          styles.dayNumber,
                          {
                            color: dayColor ? '#fff' : (isToday ? colors.primary : colors.foreground),
                            fontFamily: isSelected ? fonts.bodyBold : fonts.bodySemibold,
                          },
                        ]}>{dayNum}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Status Dot Legend — hidden behind SHOW_CALENDAR_LEGEND */}
            {SHOW_CALENDAR_LEGEND && (
            <View style={styles.dotLegend}>
              {LEGEND.map((item) => (
                <View key={item.label} style={styles.dotLegendItem}>
                  <View style={[styles.dotLegendDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.dotLegendText, { color: colors.muted }]}>{item.label}</Text>
                </View>
              ))}
            </View>
            )}

            {/* Selected date detail */}
            {!selectedDate ? (
              <View style={[styles.emptyDay, { borderColor: colors.border }]}>
                <MaterialIcons name="touch-app" size={28} color={colors.muted} />
                <Text style={[styles.emptyDayText, { color: colors.muted }]}>Tap a date to see details</Text>
              </View>
            ) : (
            <View style={styles.slotsSection}>
              <View style={styles.slotsSectionHeader}>
                <Text style={[styles.slotsSectionTitle, { color: colors.muted }]}>
                  {formatDateLabel(selectedDate)}
                </Text>
                <View style={[styles.slotsSectionLine, { backgroundColor: colors.border }]} />
                <Pressable
                  onPress={() => openAddModal(selectedDate)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <MaterialIcons name="add" size={22} color={colors.primary} />
                </Pressable>
              </View>

              {/* Bookings for selected date */}
              {(bookingsByDate.get(selectedDate) ?? []).map((b) => renderBookingCard(b, true))}

              {/* Blocks for selected date */}
              {selectedDateBlocks.map((b) => renderBlockCard(b))}

              {(bookingsByDate.get(selectedDate) ?? []).length === 0 && selectedDateBlocks.length === 0 && (
                <View style={[styles.emptyDay, { borderColor: colors.border }]}>
                  <MaterialIcons name="check-circle" size={28} color={colors.success} />
                  <Text style={[styles.emptyDayText, { color: colors.muted }]}>Available — no gigs or blocks</Text>
                </View>
              )}
            </View>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ═══════════════════ CALENDAR SYNC SHEET ═══════════════════ */}
      <Modal
        visible={showSyncModal}
        transparent={false}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowSyncModal(false)}
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 0.5, borderBottomColor: colors.border,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Pressable
              onPress={() => setShowSyncModal(false)}
              style={({ pressed }) => [{ padding: 8, borderRadius: 20, opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="close" size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1, marginHorizontal: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>Sync to Calendar</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' }}>Select gigs to export to your phone calendar</Text>
            </View>
            {/* Spacer to balance close button */}
            <View style={{ width: 36 }} />
          </View>

          {/* Gig List */}
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {unexportedGigs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
                <MaterialIcons name="event-available" size={48} color={colors.success} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>All Synced</Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>All your confirmed upcoming gigs are already in your calendar.</Text>
              </View>
            ) : (
              unexportedGigs.map((gig) => {
                const isSelected = selectedGigIds.has(gig.id);
                return (
                  <Pressable
                    key={gig.id}
                    onPress={() => toggleGigSelection(gig.id)}
                    style={({ pressed }) => [{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: isSelected ? colors.primary + '12' : colors.surface,
                      borderRadius: 14, padding: 14,
                      borderWidth: 1.5, borderColor: isSelected ? colors.primary : colors.border,
                      gap: 12, opacity: pressed ? 0.8 : 1,
                    }]}
                  >
                    {/* Checkbox */}
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 2, borderColor: isSelected ? colors.primary : colors.muted,
                      backgroundColor: isSelected ? colors.primary : 'transparent',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {isSelected && <MaterialIcons name="check" size={14} color="#fff" />}
                    </View>
                    {/* Gig info */}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }} numberOfLines={1}>
                        {gig.resolvedVenueName}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.muted }}>
                        {formatDate(gig.resolvedDate!)} · {fmtTime(gig.resolvedStart ?? '20:00')}–{fmtTime(gig.resolvedEnd ?? '23:00')}
                      </Text>
                      {gig.resolvedSlotName ? (
                        <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{gig.resolvedSlotName}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Export button — fixed at bottom */}
          {unexportedGigs.length > 0 && (
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
              backgroundColor: colors.background,
              borderTopWidth: 0.5, borderTopColor: colors.border,
            }}>
              <Pressable
                onPress={exportAllGigs}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: selectedGigIds.size > 0 ? colors.primary : colors.surface,
                  borderRadius: 14, paddingVertical: 14,
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <MaterialIcons name="event-available" size={18} color={selectedGigIds.size > 0 ? '#fff' : colors.muted} />
                <Text style={{ color: selectedGigIds.size > 0 ? '#fff' : colors.muted, fontWeight: '700', fontSize: 15 }}>
                  {selectedGigIds.size === unexportedGigs.length && selectedGigIds.size > 0
                    ? `Export All (${selectedGigIds.size})`
                    : selectedGigIds.size > 0
                    ? `Export (${selectedGigIds.size})`
                    : 'Select gigs to export'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', gap: 8 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#F6F2EC' },

  viewToggleContainer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  viewToggle: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10 },
  toggleBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  toggleBtnText: { fontSize: 12, fontWeight: '700' },
  // legacy (kept for safety)
  modeToggle: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  modeBtnText: { fontSize: 14, fontWeight: '700' },
  // Week add button (matching manager weekAddBtn exactly)
  weekAddBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // Dot legend — 4 items, flex-wrap so they fit on narrow screens
  dotLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 16 },
  dotLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dotLegendDot: { width: 8, height: 8, borderRadius: 4 },
  dotLegendText: { fontSize: 11 },

  // Week view (matching manager)
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  weekLabel: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  monthNavBtn: { padding: 4 },
  weekDaysContainer: { paddingHorizontal: 20 },
  weekDaySection: { borderBottomWidth: 0.5, paddingVertical: 12 },
  weekDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  weekDayBadge: { width: 44, alignItems: 'center', borderRadius: 10, paddingVertical: 4 },
  weekDayShort: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  weekDayNum: { fontSize: 16, fontFamily: fonts.bodySemibold },
  weekDayMeta: { flex: 1 },
  weekDayFull: { fontSize: 14, fontWeight: '600' },
  weekDaySlotCount: { fontSize: 11, marginTop: 1 },
  weekSlotsContainer: { paddingLeft: 54, gap: 6 },
  weekEmptyDay: { paddingLeft: 54, paddingVertical: 4 },
  weekEmptyText: { fontSize: 12, fontStyle: 'italic' },

  // Month view — filled colour squares (green booked / gold pending / slate cancelled)
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  monthNavLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthTitle: { fontSize: 22, fontWeight: '700' },
  todayBtnText: { fontSize: 15, fontWeight: '700' },
  dayLabels: { flexDirection: 'row', paddingHorizontal: 12 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', paddingVertical: 4 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 4 },
  calendarCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellRing: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: '100%', aspectRatio: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 16, fontFamily: fonts.bodySemibold },

  // Selected date section
  slotsSection: { padding: 20 },
  slotsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  slotsSectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  slotsSectionLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginHorizontal: 12 },

  // Booking cards — venue thumbnail (squircle) + name + status pill + time
  bookingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 8 },
  bookingThumb: { width: 48, height: 48, borderRadius: 12 },
  bookingThumbPrivate: { alignItems: 'center', justifyContent: 'center' },
  bookingInfo: { flex: 1, gap: 3 },
  bookingTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  bookingSub: { fontSize: 13, fontWeight: '500' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  // Block cards (availability blocks — unchanged color-bar layout)
  slotCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', marginBottom: 8 },
  slotColorBar: { width: 4, alignSelf: 'stretch' },
  slotCardContent: { flex: 1, padding: 12, gap: 3 },
  slotCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotCardTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  slotStatusDot: { width: 8, height: 8, borderRadius: 4 },
  slotCardSub: { fontSize: 13 },
  slotCardStatus: { fontSize: 11, fontWeight: '700' },
  slotDeleteBtn: { padding: 12 },


  // Empty day
  emptyDay: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyDayText: { fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 19, paddingTop: 19, paddingBottom: 32 },
  modalHandle: { width: 32, height: 3, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 13 },
  modalIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: 14, fontWeight: '800' },
  modalDate: { fontSize: 10, marginTop: 2 },

  // Type toggle
  typeToggleRow: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 2, marginBottom: 16, gap: 3 },
  typeToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  typeToggleBtnText: { fontSize: 11, fontWeight: '700' },

  // Text input fields
  fieldGroup: { marginBottom: 13 },
  fieldLabel: { fontSize: 10, fontWeight: '600', marginBottom: 5 },
  textInputBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10 },
  textInputField: { fontSize: 12 },

  // Full Day toggle
  fullDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, marginBottom: 13 },
  fullDayLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullDayLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 35, height: 21, borderRadius: 11, padding: 2 },
  toggleThumb: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#fff' },
  toggleThumbOff: { alignSelf: 'flex-start' },
  toggleThumbOn: { alignSelf: 'flex-end' },

  // Time picker (matching manager slotModalStyles exactly)
  timeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  timeSep: { paddingTop: 22 },
  timeFieldLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  timeDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, minHeight: 34 },
  timeDropdownText: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  timeDropdownAbsolute: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 },
  timeDropdownList: { borderWidth: 1, borderRadius: 10, marginTop: 3, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 8 },
  timeDropdownScroll: { maxHeight: 128 },
  timeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, minHeight: 29 },
  timeOptionText: { fontSize: 11 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  cancelBtnText: { fontSize: 12, fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 },
  confirmBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Three-dot menu button on slot cards
  slotMenuBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },

  // Three-dot action sheet modal
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  menuSheet: { width: '100%', borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  menuAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  menuActionText: { fontSize: 16, fontWeight: '600' },
  menuDivider: { height: 0.5, marginHorizontal: 16 },
  dismissBtn: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  dismissBtnText: { fontSize: 12, fontWeight: '600' },
});
