import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Venue, Slot, Booking } from '@/lib/types';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useInvoiceStore, useNotificationStore, useAuthStore, loadNotificationsFromSupabase, useArtistDirectoryStore, mapVenueRow } from '@/lib/store';

export default function ManagerLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ Fetch venues from Supabase
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .eq('manager_id', user.id)
        .eq('is_hidden', false);

      if (!venuesError && venuesData) {
        const store = useVenueStore.getState();
        store.clearVenues();
        venuesData.forEach((v) => {
          // Use the shared mapper so photo_urls AND admin_photo_url are mapped
          // (the old manual map hardcoded photoUrls:[] and omitted adminPhotoUrl,
          // so admin-curated photos never showed on manager screens). Billing
          // isn't part of mapVenueRow, so layer it on top.
          const venue: Venue = {
            ...mapVenueRow(v),
            billing: v.billing_company_name ? {
              companyName: v.billing_company_name,
              companyAddress: v.billing_company_address,
              trnNumber: v.billing_trn_number,
            } : undefined,
          };
          store.addVenue(venue);
        });
      }

      // ✅ Fetch slots from Supabase
      const { data: slotsData, error: slotsError } = await supabase
        .from('slots')
        .select('*')
        .eq('manager_id', user.id);

      if (!slotsError && slotsData) {
        const slotStore = useSlotStore.getState();
        slotStore.clearSlots();
        slotsData.forEach((s) => {
          const slot: Slot = {
            id: s.id,
            venueId: s.venue_id,
            name: s.name,
            date: s.date,
            startTime: s.start_time,
            endTime: s.end_time,
            createdAt: s.created_at,
          };
          slotStore.addSlot(slot);
        });
      }

      // ✅ Fetch bookings from Supabase
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('manager_id', user.id);

      if (!bookingsError && bookingsData) {
        const bookingStore = useBookingStore.getState();
        bookingStore.clearBookings();
        bookingsData.forEach((b) => {
          const booking: Booking = {
            id: b.id,
            slotId: b.slot_id,
            venueId: b.venue_id,
            artistId: b.artist_id,
            managerId: b.manager_id,
            status: b.status,
            isCompleted: b.is_completed ?? false,
            confirmedAt: b.confirmed_at ?? undefined,
            cancelledAt: b.cancelled_at ?? undefined,
            cancellationReason: b.cancellation_reason ?? undefined,
            cancellationAcknowledged: b.cancellation_acknowledged ?? false,
            cancelledAsRequest: b.cancelled_as_request ?? false,
            hiddenFromCalendar: b.hidden_from_calendar ?? false,
            hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
            slotDate: b.slot_date ?? undefined,
            slotName: b.slot_name ?? undefined,
            slotStartTime: b.slot_start_time ?? undefined,
            slotEndTime: b.slot_end_time ?? undefined,
            venueName: b.venue_name ?? undefined,
            createdAt: b.created_at,
            updatedAt: b.updated_at,
          };
          bookingStore.addBooking(booking);
        });
      }

      // ✅ Fetch global lineup from Supabase
      const { data: lineupData, error: lineupError } = await supabase
        .from('global_lineup')
        .select('artist_id, created_at')
        .eq('manager_id', user.id)
        .eq('status', 'active');

      const lineupStore = useLineupStore.getState();
lineupStore.clearGlobalLineup();
lineupStore.clearArtistUsers();

if (!lineupError && lineupData) {
  const artistIds = lineupData.map((l) => l.artist_id);
        if (artistIds.length > 0) {
          const { data: artistsData } = await supabase
            .from('artists')
            .select('id, full_name, email, primary_genre, secondary_genres, instruments, based_in, profile_photo_url, instagram_url, soundcloud_url, mixcloud_url, spotify_url, bio, min_rate, years_of_experience, gender, nationality, is_history_hidden, has_completed_booking, created_at, updated_at')
            .in('id', artistIds);

          if (artistsData) {
            artistsData.forEach((a) => {
              lineupStore.addArtistUser({
                id: a.id,
                email: a.email ?? '',
                phone: '',
                accountType: 'artist' as const,
                fullName: a.full_name,
                username: undefined,
                profilePhotoUrl: a.profile_photo_url ?? undefined,
                location: a.based_in ?? undefined,
                isPhoneVerified: false,
                isEmailVerified: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              lineupStore.addToGlobalLineup({
                id: `${user.id}-${a.id}`,
                managerId: user.id,
                artistId: a.id,
                status: 'active' as const,
                addedAt: new Date().toISOString(),
              });
            });
            // Seed the shared artist directory with FULL lineup-artist data so their
            // profile screens open complete on the first frame (no fetch-on-open pop).
            useArtistDirectoryStore.getState().setArtists(artistsData.map((a) => ({
              user: {
                id: a.id, email: a.email ?? '', phone: '', accountType: 'artist' as const,
                fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined,
                bio: a.bio ?? undefined, location: a.based_in ?? undefined,
                yearsOfExperience: a.years_of_experience ?? undefined,
                isPhoneVerified: false, isEmailVerified: true,
                createdAt: a.created_at ?? new Date().toISOString(), updatedAt: a.updated_at ?? new Date().toISOString(),
              },
              profile: {
                userId: a.id, primaryGenre: a.primary_genre,
                secondaryGenres: Array.isArray(a.secondary_genres) ? a.secondary_genres : [],
                instruments: Array.isArray(a.instruments) ? a.instruments : [],
                minRate: a.min_rate ?? undefined, gender: a.gender ?? undefined,
                basedIn: a.based_in ?? undefined, nationality: a.nationality ?? undefined,
                isHistoryHidden: a.is_history_hidden ?? false,
                instagramUrl: a.instagram_url ?? undefined, soundcloudUrl: a.soundcloud_url ?? undefined,
                mixcloudUrl: a.mixcloud_url ?? undefined, spotifyUrl: a.spotify_url ?? undefined,
              },
            })));
          }
        }

        // ✅ Fetch venue assignments from Supabase
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('venue_assignments')
          .select('id, artist_id, venue_id, manager_id, created_at')
          .eq('manager_id', user.id)
          .eq('status', 'active');

        if (!assignmentsError && assignmentsData) {
          const lineupStore2 = useLineupStore.getState();
          assignmentsData.forEach((a) => {
            lineupStore2.assignToVenue({
              id: a.id,
              globalLineupId: `${user.id}-${a.artist_id}`,
              venueId: a.venue_id,
              artistId: a.artist_id,
              assignedAt: a.created_at,
              status: 'active' as const,
            });
          });
        }
      }
    };

    fetchData();

    // Fetch invoices received by this manager
    const fetchInvoices = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('manager_id', user.id)
        .order('sent_at', { ascending: false });
      if (!data || data.length === 0) return;
      const invoiceStore = useInvoiceStore.getState();
      data.forEach((inv: any) => {
        if (invoiceStore.invoices.some((i) => i.id === inv.id)) return;
        invoiceStore.addInvoice({
          id: inv.id,
          venueId: inv.venue_id,
          venueName: inv.venue_name,
          artistId: inv.artist_id,
          artistLegalName: inv.artist_legal_name,
          artistEmail: inv.artist_email ?? '',
          artistLocation: inv.artist_location ?? '',
          managerId: inv.manager_id,
          managerName: inv.manager_name ?? '',
          venueLegalName: inv.venue_legal_name ?? inv.venue_name,
          venueTrnNumber: inv.venue_trn_number ?? '',
          venueAddress: inv.venue_address ?? '',
          gigs: inv.gigs ?? [],
          totalAmount: parseFloat(inv.total_amount),
          invoiceNumber: inv.invoice_number ?? '',
          sentAt: inv.sent_at,
          status: inv.status,
          isReadByManager: inv.is_read_by_manager ?? false,
          isDeletedByManager: inv.is_deleted_by_manager ?? false,
        });
      });
    };
    fetchInvoices();

    // Realtime: listen for booking status changes
    const subscription = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload) => {
  const b = payload.new as any;
  const bookingStore = useBookingStore.getState();
  bookingStore.updateBookingStatus(b.id, b.status, {
            confirmedAt: b.confirmed_at ?? undefined,
            cancelledAt: b.cancelled_at ?? undefined,
            cancellationReason: b.cancellation_reason ?? undefined,
            cancellationAcknowledged: b.cancellation_acknowledged ?? false,
            cancelledAsRequest: b.cancelled_as_request ?? false,
            isCompleted: b.is_completed ?? false,
          });
        }
      )
      .subscribe();

    // Realtime: listen for venue changes (e.g. our backend verifying a venue).
    // Updates the verification badge live without needing a sign-out/in.
    const venueSubscription = supabase
      .channel('venues-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'venues' },
        (payload) => {
          const v = payload.new as any;
          const venueStore = useVenueStore.getState();
          // Only touch venues already in our store (this manager's own venues).
          if (!venueStore.venues.some((existing) => existing.id === v.id)) return;
          venueStore.updateVenue(v.id, {
            verificationStatus: v.verification_status ?? 'pending',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
      supabase.removeChannel(venueSubscription);
    };
  }, []);

  // Notifications: load from Supabase + realtime subscription (depends on currentUser)
  useEffect(() => {
    if (!currentUser?.id) return;
    loadNotificationsFromSupabase(currentUser.id);
    // Remove any stale channels from previous renders/hot-reloads
    supabase.getChannels()
      .filter((c: any) => c.topic?.includes(currentUser.id))
      .forEach((c: any) => supabase.removeChannel(c));
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`notif-mgr-${currentUser.id}-${Date.now()}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
          (payload) => {
            const n = payload.new as any;
            const store = useNotificationStore.getState();
            if (store.notifications.some((x) => x.id === n.id)) return;
            useNotificationStore.setState((state) => ({
              notifications: [{
                id: n.id, userId: n.user_id, type: n.type,
                title: n.title, body: n.body, isRead: n.is_read ?? false,
                relatedId: n.related_id ?? undefined, relatedType: n.related_type ?? undefined,
                createdAt: n.created_at,
              }, ...state.notifications],
            }));
          }
        )
        .subscribe();
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  // Realtime: listen for new invoices sent to this manager
  useEffect(() => {
    if (!currentUser?.id) return;
    let invoiceChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      invoiceChannel = supabase
        .channel(`inv-mgr-${currentUser.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'invoices', filter: `manager_id=eq.${currentUser.id}` },
          (payload) => {
            const inv = payload.new as any;
            const invoiceStore = useInvoiceStore.getState();
            if (invoiceStore.invoices.some((i) => i.id === inv.id)) return;
            invoiceStore.addInvoice({
              id: inv.id, venueId: inv.venue_id, venueName: inv.venue_name,
              artistId: inv.artist_id, artistLegalName: inv.artist_legal_name,
              artistEmail: inv.artist_email ?? '', artistLocation: inv.artist_location ?? '',
              managerId: inv.manager_id, managerName: '',
              venueLegalName: inv.venue_legal_name ?? inv.venue_name,
              venueTrnNumber: inv.venue_trn_number ?? '', venueAddress: inv.venue_address ?? '',
              gigs: inv.gigs ?? [], totalAmount: parseFloat(inv.total_amount),
              invoiceNumber: inv.invoice_number ?? '', sentAt: inv.sent_at, status: inv.status,
              isReadByManager: false, isDeletedByManager: false,
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `manager_id=eq.${currentUser.id}` },
          (payload) => {
            // An artist cancelling an invoice flips its status to 'cancelled' — sync
            // the new status live so the manager sees the CANCELLED badge without a reload.
            const inv = payload.new as any;
            useInvoiceStore.getState().updateInvoiceStatus(inv.id, inv.status);
          }
        )
        .subscribe();
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (invoiceChannel) supabase.removeChannel(invoiceChannel); };
  }, [currentUser?.id]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="venue-detail" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen
        name="assign-artist"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.78],
          sheetExpandsWhenScrolledToEdge: false,
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
      <Stack.Screen
        name="add-slot"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.7],
          sheetExpandsWhenScrolledToEdge: false,
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
        }}
      />
      <Stack.Screen name="create-venue" options={{ gestureEnabled: false }} />
      <Stack.Screen name="artist-profile-view" />
      <Stack.Screen name="artist-bookings" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="pending-requests" />
      <Stack.Screen name="confirmed-bookings" />
      <Stack.Screen name="all-bookings" />
      <Stack.Screen name="my-venues" />
      <Stack.Screen name="artists" />
      <Stack.Screen name="completed-gigs" />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="edit-venue" options={{ gestureEnabled: false }} />
      <Stack.Screen name="manager-invoice-detail" />
      <Stack.Screen name="settings" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="send-feedback"
        options={{
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}