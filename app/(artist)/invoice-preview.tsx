import { sendEmail } from '@/lib/send-email';
import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Platform, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useInvoiceStore, useNotificationStore, useLineupStore, mapVenueRow } from '@/lib/store';
import { rescheduleInvoiceReminders } from '@/lib/invoice-reminders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime, useFormatTime } from '@/lib/conflict-detection';
import { firstName } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { pickImage, uploadImageAsync } from '@/lib/upload';
import { openBrowserAsync } from 'expo-web-browser';
import type { Invoice, InvoiceGig, Venue } from '@/lib/types';
import { CLASH_DISPLAY_BOLD_BASE64 } from '@/lib/clash-display-base64';

export default function InvoicePreviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { formatTime: fmtTime } = useFormatTime();
  const { venueId, gigsJson, total, invoiceId, readOnly, managerId: paramManagerId, venueName: paramVenueName, mode } = useLocalSearchParams<{
    venueId?: string;
    gigsJson?: string;
    total?: string;
    invoiceId?: string;
    readOnly?: string;
    managerId?: string;
    venueName?: string;
    mode?: string;
  }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const venue = useVenueStore((s) => s.getVenueById(venueId ?? ''));
  const addInvoice = useInvoiceStore((s) => s.addInvoice);
  const invoices = useInvoiceStore((s) => s.invoices);
  const cancelInvoice = useInvoiceStore((s) => s.cancelInvoice);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const globalLineup = useLineupStore((s) => s.globalLineup);

  const [isSending, setIsSending] = useState(false);

  const isReadOnly = readOnly === '1';
  const existingInvoice = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null;

  // Custom invoice = the artist uploads their OWN invoice (a photo of it) instead of the generated
  // one. Active when creating via the "Upload my own" button (mode==='custom') or viewing a sent
  // custom invoice. The uploaded file's public URL is stored on the invoice (Invoice.pdfUrl /
  // invoices.pdf_url — the column is generic and holds an image URL on this version).
  const isCustomMode = mode === 'custom' || !!existingInvoice?.pdfUrl;
  const [customPdfName, setCustomPdfName] = useState<string | null>(null); // display name of the picked file
  const [customPdfUri, setCustomPdfUri] = useState<string | null>(null);   // local file:// (this session, for the email attachment)
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(existingInvoice?.pdfUrl ?? null); // uploaded public URL
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const pickCustomPdf = async () => {
    if (uploadingPdf) return;
    try {
      // No crop editing — a whole invoice photo, not a square avatar. quality 0.7 keeps it legible
      // without a huge upload.
      const uri = await pickImage({ allowsEditing: false, quality: 0.7 });
      if (!uri) return;
      setCustomPdfUri(uri);
      setCustomPdfName(uri.split('/').pop()?.replace(/%20/g, ' ') ?? 'invoice.jpg');
      setUploadingPdf(true);
      const url = await uploadImageAsync(uri, 'invoices', `invoice-${currentUser?.id ?? 'artist'}`);
      setCustomPdfUrl(url);
    } catch (e) {
      Alert.alert('Upload failed', 'Could not read that photo — please try another one.');
      setCustomPdfUri(null); setCustomPdfName(null); setCustomPdfUrl(null);
    } finally {
      setUploadingPdf(false);
    }
  };
  const openCustomPdf = () => { const u = customPdfUrl ?? existingInvoice?.pdfUrl; if (u) openBrowserAsync(u); };

  // When creating a new invoice for a venue that's no longer in the local store
  // (manager hid/deleted it, or the artist left it), fetch the still-existing venue
  // row from Supabase so the invoice keeps the real name, manager, and billing details.
  const [fetchedVenue, setFetchedVenue] = useState<Venue | null>(null);
  useEffect(() => {
    // Always fetch the venue row when creating an invoice. Billing (legal name, TRN,
    // address) lives in separate columns that no artist-side venue loader maps, so the
    // in-store venue has no billing — the DB row is the only reliable source.
    if (existingInvoice || !venueId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('venues').select('*').eq('id', venueId).maybeSingle();
      if (cancelled || !data) return;
      setFetchedVenue({
        ...mapVenueRow(data),
        billing: (data.billing_company_name || data.billing_trn_number || data.billing_company_address) ? {
          companyName: data.billing_company_name ?? '',
          companyAddress: data.billing_company_address ?? '',
          trnNumber: data.billing_trn_number ?? '',
        } : (data.billing ?? undefined),
      });
    })();
    return () => { cancelled = true; };
  }, [existingInvoice, venueId]);
  const effVenue = fetchedVenue ?? venue;

  const gigs: InvoiceGig[] = useMemo(() => {
    if (existingInvoice) return existingInvoice.gigs;
    try { return JSON.parse(gigsJson ?? '[]'); } catch { return []; }
  }, [gigsJson, existingInvoice]);

  const totalAmount = existingInvoice ? existingInvoice.totalAmount : parseFloat(total ?? '0');

  // Find the manager for this venue
  const managerId = useMemo(() => {
    if (existingInvoice) return existingInvoice.managerId;
    return effVenue?.managerId ?? paramManagerId ?? '';
  }, [effVenue, existingInvoice, paramManagerId]);

  // Stable, per-artist prefix: INV-<first 3 letters of the LOCKED email>-<4-char account tag>.
  // The email can't be changed in-app (only by contacting us) and the account id never changes, so
  // the prefix is fixed for an artist: the letters read as "who", the tag makes it unique across
  // artists (two people whose emails start the same still differ by their account tag).
  const invoicePrefix = useMemo(() => {
    const letters = (currentUser?.email ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'XXX';
    const tag = (currentUser?.id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || '0000';
    return `INV-${letters}-${tag}`;
  }, [currentUser?.email, currentUser?.id]);

  // Running number counted from the LIVE database (not the cached store, which can be stale after a
  // fresh login/offline and restart the count low — the old duplicate bug). Monotonic: every invoice
  // row (cancelled included) counts, so a number is never reused, and the DB unique rule on
  // (artist_id, invoice_number) is the final backstop. Reopening a sent invoice keeps its number.
  const [invoiceNumber, setInvoiceNumber] = useState<string>(existingInvoice?.invoiceNumber ?? '');
  useEffect(() => {
    if (existingInvoice) { setInvoiceNumber(existingInvoice.invoiceNumber); return; }
    if (!currentUser) return;
    let alive = true;
    (async () => {
      const seq = await nextInvoiceSeq(currentUser.id, invoices.filter((i) => i.artistId === currentUser.id).length);
      if (alive) setInvoiceNumber(`${invoicePrefix}-${String(seq).padStart(3, '0')}`);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingInvoice, currentUser, invoicePrefix]);

  const artistName = existingInvoice?.artistLegalName ?? currentUser?.fullLegalName ?? currentUser?.fullName ?? '';
  const artistEmail = existingInvoice?.artistEmail ?? currentUser?.email ?? '';
  const artistLocation = existingInvoice?.artistLocation ?? currentUser?.location ?? '';
  const venueName = existingInvoice?.venueName ?? effVenue?.name ?? paramVenueName ?? '';
  const venueLegalName = existingInvoice?.venueLegalName ?? effVenue?.billing?.companyName ?? effVenue?.name ?? paramVenueName ?? '';
  const venueTrnNumber = existingInvoice?.venueTrnNumber ?? effVenue?.billing?.trnNumber ?? '';
  const venueAddress = existingInvoice?.venueAddress ?? effVenue?.billing?.companyAddress ?? effVenue?.googleMapsLocation?.address ?? '';
  const sentDate = existingInvoice ? new Date(existingInvoice.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const handleSend = async () => {
    if (!currentUser || !venueId) return;
    if (!managerId) {
      Alert.alert('One moment', 'Still loading the venue details — please try again in a second.');
      return;
    }
    if (isCustomMode && !customPdfUrl) {
      Alert.alert('No photo chosen', uploadingPdf ? 'Still uploading your photo — give it a second.' : 'Add a photo of your invoice first, then send.');
      return;
    }
    Alert.alert(
      'Send Invoice',
      `Send this invoice for AED ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} to ${venueName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setIsSending(true);
            await new Promise((r) => setTimeout(r, 600));

            const newInvoiceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            const newInvoice: Invoice = {
              id: newInvoiceId,
              venueId,
              venueName,
              artistId: currentUser.id,
              artistLegalName: artistName,
              artistEmail,
              artistLocation,
              managerId,
              managerName: '',
              venueLegalName,
              venueTrnNumber,
              venueAddress,
              gigs,
              totalAmount,
              invoiceNumber,
              sentAt: new Date().toISOString(),
              status: 'sent',
              pdfUrl: isCustomMode ? (customPdfUrl ?? undefined) : undefined,
            };
            // Save to Supabase FIRST — only mark sent locally + notify the manager if it
            // actually persisted, so a blocked insert can't masquerade as a sent invoice.
            // Mint the running number and RETRY if the DB's unique rule on (artist_id,
            // invoice_number) rejects it — that only happens in a rare race (two sends at once);
            // the retry just re-counts and takes the next free number.
            let finalNumber = invoiceNumber;
            let saved = false;
            let lastErr: any = null;
            for (let attempt = 0; attempt < 3 && !saved; attempt++) {
              if (!finalNumber) {
                const seq = await nextInvoiceSeq(currentUser.id, invoices.filter((i) => i.artistId === currentUser.id).length);
                finalNumber = `${invoicePrefix}-${String(seq).padStart(3, '0')}`;
              }
              const { error } = await supabase.from('invoices').insert({
                id: newInvoice.id,
                artist_id: currentUser.id,
                manager_id: managerId,
                venue_id: venueId,
                venue_name: venueName,
                artist_legal_name: artistName,
                artist_email: artistEmail,
                artist_location: artistLocation,
                venue_legal_name: venueLegalName,
                venue_trn_number: venueTrnNumber || null,
                venue_address: venueAddress || null,
                gigs: gigs,
                total_amount: totalAmount,
                invoice_number: finalNumber,
                status: 'sent',
                sent_at: newInvoice.sentAt,
                pdf_url: isCustomMode ? (customPdfUrl ?? null) : null,
              });
              if (!error) { saved = true; break; }
              lastErr = error;
              // 23505 = unique_violation: that number was just taken — remint and try again.
              if ((error as any).code === '23505') { finalNumber = ''; continue; }
              break; // any other error: stop and report
            }
            if (!saved) {
              console.warn('Invoice insert error:', lastErr?.message);
              setIsSending(false);
              Alert.alert('Invoice not sent', `Could not save the invoice: ${lastErr?.message ?? 'please try again.'}`);
              return;
            }
            newInvoice.invoiceNumber = finalNumber;
            addInvoice(newInvoice);

            // Re-arm local invoice reminders so this now-invoiced venue stops
            // reminding this month.
            rescheduleInvoiceReminders(currentUser.id);

            // Send notification to manager
            addNotification({
              id: 'notif-inv-' + Date.now(),
              userId: managerId,
              type: 'invoice_received',
              title: 'Invoice Received',
              body: `${firstName(artistName, 'An artist')} sent AED ${Math.round(totalAmount).toLocaleString()} for ${venueName}`,
              relatedId: newInvoice.id,
              isRead: false,
              createdAt: new Date().toISOString(),
            });

            // Also email the manager the invoice WITH the PDF attached. Generate the PDF as
            // base64 from the same HTML the download button uses, then fire-and-forget the email.
            // Best-effort: if PDF generation fails the email still sends (without the attachment),
            // and none of this blocks the "Invoice Sent" confirmation below.
            void (async () => {
              let pdfBase64: string | undefined;
              try {
                if (isCustomMode && customPdfUri) {
                  // Custom invoice: attach the artist's UPLOADED photo (read the local copy as
                  // base64) rather than generating a PDF.
                  const FS = await import('expo-file-system/legacy');
                  pdfBase64 = await FS.readAsStringAsync(customPdfUri, { encoding: 'base64' });
                } else if (!isCustomMode && Platform.OS !== 'web') {
                  const Print = await import('expo-print');
                  // Reuse the pre-generated HTML only if the number matches; otherwise regenerate
                  // with the authoritative finalNumber (differs only in a rare retry).
                  const html = (finalNumber === invoiceNumber && cachedHtmlRef.current) ? cachedHtmlRef.current : generateInvoiceHTML({
                    invoiceNumber: finalNumber, sentDate, artistName, artistEmail, artistLocation,
                    venueLegalName, venueTrnNumber, venueAddress, venueName, gigs, totalAmount,
                  });
                  const res = await Print.printToFileAsync({ html, base64: true });
                  pdfBase64 = res.base64 ?? undefined;
                }
              } catch (e) {
                console.log('[invoice email] PDF attach/generate failed; sending without attachment:', e);
              }
              // A custom invoice is a photo — name the attachment with its real extension so the
              // manager's mail client shows it as an image, not a broken ".pdf".
              const customExt = (customPdfUri || customPdfUrl || '').match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/)?.[1]?.toLowerCase() || 'jpg';
              const safeNum = finalNumber.replace(/[^a-zA-Z0-9]/g, '') || 'invoice';
              await sendEmail(managerId, 'invoice_received', {
                artistName,
                venueName,
                venueId,
                amount: Math.round(totalAmount).toLocaleString(),
                invoiceNumber: finalNumber,
                pdfBase64,
                pdfFileName: isCustomMode ? `${safeNum}.${customExt}` : `${safeNum}.pdf`,
              });
            })();

            setIsSending(false);
            Alert.alert('Invoice Sent', 'Your invoice has been sent to the manager.', [
              {
                text: 'OK',
                onPress: () => {
                  // Straight to the venue's page with its Invoices tab open — the invoice they
                  // just sent is there. A single replace() (not dashboard-then-push) transitions
                  // cleanly with nothing flashing in between.
                  router.replace(`/(artist)/venue-detail?id=${venueId}&tab=invoices` as any);
                },
              },
            ]);
          },
        },
      ]
    );
  };

  // Pre-generate HTML on mount so PDF is ready instantly when button is tapped
  const cachedHtmlRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    cachedHtmlRef.current = generateInvoiceHTML({
      invoiceNumber,
      sentDate,
      artistName,
      artistEmail,
      artistLocation,
      venueLegalName,
      venueTrnNumber,
      venueAddress,
      venueName,
      gigs,
      totalAmount,
    });
  }, [invoiceNumber, sentDate, artistName, artistEmail, artistLocation, venueLegalName, venueTrnNumber, venueAddress, venueName, gigs, totalAmount]);

  const handleDownloadPDF = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('PDF Download', 'PDF download is available on iOS and Android devices.');
      return;
    }
    try {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const html = cachedHtmlRef.current ?? generateInvoiceHTML({
        invoiceNumber,
        sentDate,
        artistName,
        artistEmail,
        artistLocation,
        venueLegalName,
        venueTrnNumber,
        venueAddress,
        venueName,
        gigs,
        totalAmount,
      });
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mon = now.toLocaleDateString('en-US', { month: 'short' });
      const yyyy = now.getFullYear();
      const safeName = (artistName || 'Artist').replace(/[^a-zA-Z0-9]/g, '');
      const safeVenue = (venueName || 'Venue').replace(/[^a-zA-Z0-9]/g, '');
      const pdfFileName = `${invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}.pdf`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const FileSystem = await import('expo-file-system/legacy');
      const namedUri = `${FileSystem.cacheDirectory}${pdfFileName}`;
      await FileSystem.copyAsync({ from: uri, to: namedUri });
      await Sharing.shareAsync(namedUri, { mimeType: 'application/pdf', dialogTitle: pdfFileName, UTI: 'com.adobe.pdf' });
    } catch (e: any) {
      console.log('[PDF] generation failed:', e);
      Alert.alert('Could not generate PDF', 'Please try again.');
    }
  };

  // Cancel a sent invoice — SAME logic as the invoices list (invoices.tsx handleCancelInvoice):
  // cancelInvoice() flips it to 'cancelled' on both sides and frees its gigs to be re-invoiced
  // (the invoiceable filter excludes cancelled invoices), then the manager is notified.
  const handleCancelInvoice = () => {
    if (!existingInvoice) return;
    const inv = existingInvoice;
    Alert.alert(
      'Cancel Invoice',
      `Cancel invoice ${inv.invoiceNumber} for ${inv.venueName}? The manager will be notified and the gigs on it will become available to invoice again.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Invoice',
          style: 'destructive',
          onPress: () => {
            cancelInvoice(inv.id);
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: inv.managerId,
              type: 'invoice_cancelled',
              title: 'Invoice Cancelled',
              body: `${firstName(currentUser?.fullName ?? 'The artist', 'An artist')} cancelled invoice ${inv.invoiceNumber} for ${inv.venueName}`,
              isRead: false,
              relatedId: inv.id,
              relatedType: 'invoice',
              createdAt: new Date().toISOString(),
            });
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{isCustomMode ? 'Your Invoice' : 'Invoice Preview'}</Text>
        {isReadOnly ? (
          <Pressable onPress={isCustomMode ? openCustomPdf : handleDownloadPDF} style={({ pressed }) => [styles.pdfBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <MaterialIcons name={isCustomMode ? 'image' : 'picture-as-pdf'} size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Invoice card — the artist's uploaded PDF (custom) OR our generated layout. */}
        {isCustomMode ? (
          <View style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 0 }]}>
            <Text style={[styles.invoiceTitle, { color: colors.foreground }]}>YOUR INVOICE</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 16 }}>
              Send a photo of your own invoice for {venueName} — it covers the {gigs.length} gig{gigs.length !== 1 ? 's' : ''} you picked (AED {Math.round(totalAmount).toLocaleString()}) and goes to the venue in place of our layout.
            </Text>
            {(customPdfUrl || customPdfUri) ? (
              <View style={{ gap: 12 }}>
                {/* Inline thumbnail so they can see the photo without leaving the screen. */}
                {(customPdfUri || customPdfUrl) ? (
                  <Image source={{ uri: (customPdfUri || customPdfUrl)! }} style={[styles.photoPreview, { borderColor: colors.border, backgroundColor: colors.background }]} resizeMode="contain" />
                ) : null}
                <View style={[styles.pdfChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <MaterialIcons name="image" size={22} color={colors.primary} />
                  <Text style={[styles.pdfChipName, { color: colors.foreground }]} numberOfLines={1}>{customPdfName ?? 'invoice.jpg'}</Text>
                  {uploadingPdf ? <Text style={{ color: colors.muted, fontSize: 12 }}>Uploading…</Text> : <MaterialIcons name="check-circle" size={18} color={colors.success} />}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={openCustomPdf} disabled={!customPdfUrl} style={({ pressed }) => [styles.pdfActionBtn, { borderColor: colors.border, opacity: pressed || !customPdfUrl ? 0.5 : 1 }]}>
                    <MaterialIcons name="visibility" size={17} color={colors.foreground} />
                    <Text style={[styles.pdfActionText, { color: colors.foreground }]}>View full size</Text>
                  </Pressable>
                  {!isReadOnly && (
                    <Pressable onPress={pickCustomPdf} style={({ pressed }) => [styles.pdfActionBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                      <MaterialIcons name="autorenew" size={17} color={colors.foreground} />
                      <Text style={[styles.pdfActionText, { color: colors.foreground }]}>Replace</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <Pressable onPress={pickCustomPdf} style={({ pressed }) => [styles.pickPdfBtn, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}>
                <MaterialIcons name="add-a-photo" size={20} color={colors.primary} />
                <Text style={[styles.pickPdfText, { color: colors.primary }]}>Choose a photo</Text>
              </Pressable>
            )}
          </View>
        ) : (
        <View style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Invoice Header */}
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={[styles.invoiceTitle, { color: colors.foreground }]}>INVOICE</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.invoiceNum, { color: colors.primary }]}>{invoiceNumber}</Text>
              <Text style={[styles.invoiceDate, { color: colors.muted }]}>{sentDate}</Text>
            </View>
          </View>

          {/* From / To */}
          <View style={styles.partiesRow}>
            <View style={styles.partyCol}>
              <Text style={[styles.partyLabel, { color: colors.muted }]}>FROM</Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{artistName}</Text>
              {!!artistEmail && <Text style={[styles.partyDetail, { color: colors.muted }]}>{artistEmail}</Text>}
              {!!artistLocation && <Text style={[styles.partyDetail, { color: colors.muted }]}>{artistLocation}</Text>}
            </View>
            <View style={styles.partyCol}>
              <Text style={[styles.partyLabel, { color: colors.muted }]}>TO</Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{venueLegalName}</Text>
              {!!venueAddress && <Text style={[styles.partyDetail, { color: colors.muted }]}>{venueAddress}</Text>}
              {!!venueTrnNumber && <Text style={[styles.partyDetail, { color: colors.muted }]}>TRN: {venueTrnNumber}</Text>}
            </View>
          </View>

          {/* Gigs Table — header has no fill. colors.background is WHITE in light mode,
              so it painted a white block across the cream (colors.surface) invoice card.
              Same bug as the manager's manager-invoice-detail. */}
          <View style={styles.tableHeader}>
            <Text style={[styles.thDate, { color: colors.muted }]}>GIG</Text>
            <Text style={[styles.thTime, { color: colors.muted }]}>TIME</Text>
            <Text style={[styles.thPrice, { color: colors.muted }]}>AMOUNT (AED)</Text>
          </View>
          {gigs.map((g, i) => (
            <View key={i} style={[styles.tableRow, i < gigs.length - 1 ? { borderBottomColor: colors.border } : { borderBottomWidth: 0 }]}>
              <View style={styles.tdGigCol}>
                <Text style={[styles.tdDate, { color: colors.foreground }]}>{formatFullDate(g.date)}</Text>
                <Text style={[styles.tdVenue, { color: colors.muted }]}>{venueName}</Text>
              </View>
              <Text style={[styles.tdTime, { color: colors.foreground }]}>{fmtTime(g.startTime)}–{fmtTime(g.endTime)}</Text>
              <Text style={[styles.tdPrice, { color: colors.foreground }]}>{Math.round(g.price).toLocaleString()}</Text>
            </View>
          ))}

          {/* Total */}
          <View style={[styles.totalRow, { borderColor: colors.primary }]}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>AED {Math.round(totalAmount).toLocaleString()}</Text>
          </View>
        </View>
        )}
      </ScrollView>

      {/* Bottom Action */}
      {!isReadOnly && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            style={({ pressed }) => [styles.sendBtn, { opacity: pressed || isSending ? 0.85 : 1 }]}
            onPress={handleSend}
            disabled={isSending}
          >
            <MaterialIcons name="send" size={18} color="#fff" />
            <Text style={styles.sendBtnText}>{isSending ? 'Sending...' : 'Send Invoice'}</Text>
          </Pressable>
        </View>
      )}

      {/* Cancel — shown when viewing a sent (non-cancelled) invoice. Frees its gigs to re-invoice. */}
      {isReadOnly && existingInvoice && existingInvoice.status !== 'cancelled' && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.error, backgroundColor: colors.error + '10', opacity: pressed ? 0.7 : 1 }]}
            onPress={handleCancelInvoice}
          >
            <MaterialIcons name="cancel" size={18} color={colors.error} />
            <Text style={[styles.cancelBtnText, { color: colors.error }]}>Cancel Invoice</Text>
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  );
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Next per-artist invoice sequence number, counted from the LIVE database (every row, cancelled
// included, so a number is never reused). Falls back to the local count if the query fails.
async function nextInvoiceSeq(artistId: string, fallbackCount: number): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    if (error || count == null) return fallbackCount + 1;
    return count + 1;
  } catch {
    return fallbackCount + 1;
  }
}

function generateInvoiceHTML(data: {
  invoiceNumber: string;
  sentDate: string;
  artistName: string;
  artistEmail: string;
  artistLocation: string;
  venueLegalName: string;
  venueTrnNumber: string;
  venueAddress: string;
  venueName: string;
  gigs: InvoiceGig[];
  totalAmount: number;
}): string {
  const rows = data.gigs.map((g) => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:13px">${formatFullDate(g.date)}</div>
        <div style="font-size:11px;color:#666;margin-top:2px">${data.venueName}</div>
      </td>
      <td>${formatTime(g.startTime)} – ${formatTime(g.endTime)}</td>
      <td style="text-align:right">${Math.round(g.price).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @font-face { font-family: 'ClashDisplay'; src: url(data:font/otf;base64,${CLASH_DISPLAY_BOLD_BASE64}) format('opentype'); font-weight: 700; font-style: normal; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      .brand-name { font-family: 'ClashDisplay', -apple-system, Helvetica, sans-serif; font-size: 28px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.5px; }
      .brand-slogan { font-size: 10px; font-weight: 700; color: #666; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; }
      .inv-meta { text-align: right; }
      .inv-label { font-size: 10px; font-weight: 700; color: #666; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
      .inv-num { color: #E2674A; font-size: 16px; font-weight: 700; margin-bottom: 4px; }
      .inv-date { color: #666; font-size: 13px; }
      .divider { border: none; border-top: 1px solid #e5e7eb; margin-bottom: 24px; }
      .parties { display: flex; gap: 40px; margin-bottom: 28px; }
      .party { flex: 1; }
      .party-label { font-size: 10px; font-weight: 700; color: #666; letter-spacing: 1px; margin-bottom: 6px; }
      .party-name { font-size: 15px; font-weight: 700; margin-bottom: 3px; }
      .party-detail { font-size: 12px; color: #666; margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
      th { background: #f0f4ff; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
      th:last-child { text-align: right; }
      td { padding: 12px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
      td:last-child { text-align: right; font-weight: 600; }
      .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 16px 0 8px; border-top: 2px solid #E2674A; margin-top: 0; }
      .total-label { font-size: 14px; font-weight: 700; }
      .total-value { font-size: 22px; font-weight: 800; color: #E2674A; }
      .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
      .footer-text { font-size: 11px; color: #666; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="brand-name">INVOICE</div>
      </div>
      <div class="inv-meta">
        <div class="inv-num">${data.invoiceNumber}</div>
        <div class="inv-date">${data.sentDate}</div>
      </div>
    </div>
    <hr class="divider">
    <div class="parties">
      <div class="party">
        <div class="party-label">FROM</div>
        <div class="party-name">${data.artistName}</div>
        ${data.artistEmail ? `<div class="party-detail">${data.artistEmail.replace('gigster.app', 'nexgig.app')}</div>` : ''}
        ${data.artistLocation ? `<div class="party-detail">${data.artistLocation}</div>` : ''}
      </div>
      <div class="party">
        <div class="party-label">TO</div>
        <div class="party-name">${data.venueLegalName}</div>
        ${data.venueAddress ? `<div class="party-detail">${data.venueAddress}</div>` : ''}
        ${data.venueTrnNumber ? `<div class="party-detail">TRN: ${data.venueTrnNumber}</div>` : ''}
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Gig</th><th>Time</th><th style="text-align:right">Amount (AED)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-row">
      <span class="total-label">TOTAL</span>
      <span class="total-value">AED ${Math.round(data.totalAmount).toLocaleString()}</span>
    </div>
  </body>
  </html>
  `;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  pdfBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 120 },
  invoiceCard: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 0 },
  invoiceHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  invoiceTitle: { fontSize: 26, fontWeight: '800', fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  brandSlogan: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  invMetaLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 3 },
  invoiceNum: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  invoiceDate: { fontSize: 12 },
  partiesRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  partyCol: { flex: 1 },
  partyLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  partyName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  partyDetail: { fontSize: 12, marginBottom: 1 },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  thDate: { flex: 2, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  thTime: { flex: 1.5, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  thPrice: { flex: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textAlign: 'right' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 0.5, alignItems: 'flex-start', gap: 4 },
  tdGigCol: { flex: 2, gap: 2 },
  tdDate: { fontSize: 13, fontWeight: '600' },
  tdVenue: { fontSize: 11 },
  tdTime: { flex: 1.5, fontSize: 12 },
  tdPrice: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 2 },
  totalLabel: { fontSize: 14, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800', fontFamily: fonts.bodyBold },
  invoiceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 0.5 },
  footerText: { fontSize: 11 },
  bottomBar: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 0.5 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 15 },
  cancelBtnText: { fontSize: 16, fontWeight: '700' },
  pickPdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 20 },
  pickPdfText: { fontSize: 15, fontWeight: '700' },
  photoPreview: { width: '100%', height: 320, borderRadius: 12, borderWidth: 1 },
  pdfChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  pdfChipName: { flex: 1, fontSize: 14, fontWeight: '600' },
  pdfActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  pdfActionText: { fontSize: 13.5, fontWeight: '700' },
});
