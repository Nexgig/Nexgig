import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Platform } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useInvoiceStore, useNotificationStore, useLineupStore, mapVenueRow } from '@/lib/store';
import { rescheduleInvoiceReminders } from '@/lib/invoice-reminders';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { supabase } from '@/lib/supabase';
import type { Invoice, InvoiceGig, Venue } from '@/lib/types';

export default function InvoicePreviewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { venueId, gigsJson, total, invoiceId, readOnly, managerId: paramManagerId, venueName: paramVenueName } = useLocalSearchParams<{
    venueId?: string;
    gigsJson?: string;
    total?: string;
    invoiceId?: string;
    readOnly?: string;
    managerId?: string;
    venueName?: string;
  }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const venue = useVenueStore((s) => s.getVenueById(venueId ?? ''));
  const addInvoice = useInvoiceStore((s) => s.addInvoice);
  const invoices = useInvoiceStore((s) => s.invoices);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const globalLineup = useLineupStore((s) => s.globalLineup);

  const [isSending, setIsSending] = useState(false);

  const isReadOnly = readOnly === '1';
  const existingInvoice = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null;

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

  const invoiceNumber = useMemo(() => {
    if (existingInvoice) return existingInvoice.invoiceNumber;
    const count = invoices.filter((inv) => inv.artistId === currentUser?.id).length + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${dateStr}-${String(count).padStart(3, '0')}`;
  }, [existingInvoice, invoices, currentUser]);

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
            };
            // Save to Supabase FIRST — only mark sent locally + notify the manager if it
            // actually persisted, so a blocked insert can't masquerade as a sent invoice.
            const { error: invError } = await supabase.from('invoices').insert({
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
              invoice_number: invoiceNumber,
              status: 'sent',
              sent_at: newInvoice.sentAt,
            });
            if (invError) {
              console.warn('Invoice insert error:', invError.message);
              setIsSending(false);
              Alert.alert('Invoice not sent', `Could not save the invoice: ${invError.message}`);
              return;
            }
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
              body: `${artistName} · ${venueName} — AED ${Math.round(totalAmount).toLocaleString()}`,
              relatedId: newInvoice.id,
              isRead: false,
              createdAt: new Date().toISOString(),
            });

            setIsSending(false);
            Alert.alert('Invoice Sent', 'Your invoice has been sent to the manager.', [
              {
                text: 'OK',
                onPress: () => {
                  // Go to dashboard tab first (clears invoice creation stack),
                  // then push invoices on top so back goes to dashboard
                  router.replace('/(artist)/(tabs)/dashboard' as any);
                  setTimeout(() => {
                    router.push('/(artist)/invoices' as any);
                  }, 50);
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

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Invoice Preview</Text>
        {isReadOnly ? (
          <Pressable onPress={handleDownloadPDF} style={({ pressed }) => [styles.pdfBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Invoice Card */}
        <View style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Invoice Header */}
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={[styles.invoiceTitle, { color: colors.foreground }]}>Nexgig</Text>
              <Text style={[styles.brandSlogan, { color: colors.muted }]}>EVERY BOOKING. VERIFIED.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.invMetaLabel, { color: colors.muted }]}>INVOICE</Text>
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

          {/* Gigs Table */}
          <View style={[styles.tableHeader, { backgroundColor: colors.background }]}>
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
              <Text style={[styles.tdTime, { color: colors.foreground }]}>{formatTime(g.startTime)}–{formatTime(g.endTime)}</Text>
              <Text style={[styles.tdPrice, { color: colors.foreground }]}>{Math.round(g.price).toLocaleString()}</Text>
            </View>
          ))}

          {/* Total */}
          <View style={[styles.totalRow, { borderColor: colors.primary }]}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>AED {Math.round(totalAmount).toLocaleString()}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      {!isReadOnly && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
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
    </ScreenContainer>
  );
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      .brand-name { font-size: 28px; font-weight: 800; color: #1a1a1a; }
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
      .sent-badge { background: #dcfce7; color: #16a34a; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.5px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="brand-name">Nexgig</div>
        <div class="brand-slogan">Every booking. verified.</div>
      </div>
      <div class="inv-meta">
        <div class="inv-label">Invoice</div>
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
  invoiceTitle: { fontSize: 26, fontWeight: '800' },
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
  sentBadge: { backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  sentBadgeText: { color: '#16a34a', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  bottomBar: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 0.5 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
