import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Platform } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { useInvoiceStore } from '@/lib/store';
import * as Haptics from 'expo-haptics';
import type { InvoiceGig } from '@/lib/types';
import { CLASH_DISPLAY_BOLD_BASE64 } from '@/lib/clash-display-base64';

function formatTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
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
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f4ff; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
      th:last-child { text-align: right; }
      td { padding: 12px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
      td:last-child { text-align: right; font-weight: 600; }
      .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 16px 0 8px; border-top: 2px solid #E2674A; }
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
        <div class="brand-name">Nexgig<span style="color:#E2674A">.</span></div>
        <div class="brand-slogan">Book. Play. Discover.</div>
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
        ${data.artistEmail ? `<div class="party-detail">${data.artistEmail}</div>` : ''}
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

export default function ManagerInvoiceDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const invoices = useInvoiceStore((s) => s.invoices);
  const markInvoiceReadByManager = useInvoiceStore((s) => s.markInvoiceReadByManager);

  const invoice = invoices.find((inv) => inv.id === invoiceId);

   // Mark as read when opened
  useEffect(() => {
    if (invoice && !invoice.isReadByManager) {
      markInvoiceReadByManager(invoice.id);
    }
  }, [invoice?.id]);

  // Pre-generate HTML on mount so PDF is ready instantly when button is tapped
  const cachedHtmlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!invoice || Platform.OS === 'web') return;
    const sentDate = new Date(invoice.sentAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    cachedHtmlRef.current = generateInvoiceHTML({
      invoiceNumber: invoice.invoiceNumber,
      sentDate,
      artistName: invoice.artistLegalName,
      artistEmail: invoice.artistEmail ?? '',
      artistLocation: invoice.artistLocation ?? '',
      venueLegalName: invoice.venueLegalName,
      venueTrnNumber: invoice.venueTrnNumber,
      venueAddress: invoice.venueAddress,
      venueName: invoice.venueName,
      gigs: invoice.gigs,
      totalAmount: invoice.totalAmount,
    });
  }, [invoice?.id]);

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    if (Platform.OS === 'web') {
      Alert.alert('PDF Download', 'PDF download is available on iOS and Android devices.');
      return;
    }
    try {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const sentDate = new Date(invoice.sentAt).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      const html = cachedHtmlRef.current ?? generateInvoiceHTML({
        invoiceNumber: invoice.invoiceNumber,
        sentDate,
        artistName: invoice.artistLegalName,
        artistEmail: invoice.artistEmail ?? '',
        artistLocation: invoice.artistLocation ?? '',
        venueLegalName: invoice.venueLegalName,
        venueTrnNumber: invoice.venueTrnNumber,
        venueAddress: invoice.venueAddress,
        venueName: invoice.venueName,
        gigs: invoice.gigs,
        totalAmount: invoice.totalAmount,
      });
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mon = now.toLocaleDateString('en-US', { month: 'short' });
      const yyyy = now.getFullYear();
      const safeName = (invoice.artistLegalName || 'Artist').replace(/[^a-zA-Z0-9]/g, '');
      const safeVenue = (invoice.venueName || 'Venue').replace(/[^a-zA-Z0-9]/g, '');
      const pdfFileName = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}.pdf`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const FileSystem = await import('expo-file-system/legacy');
      const namedUri = `${FileSystem.cacheDirectory}${pdfFileName}`;
      await FileSystem.copyAsync({ from: uri, to: namedUri });
      await Sharing.shareAsync(namedUri, { mimeType: 'application/pdf', dialogTitle: pdfFileName, UTI: 'com.adobe.pdf' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.log('[PDF] generation failed:', e);
      Alert.alert('Could not generate PDF', 'Please try again.');
    }
  };

  if (!invoice) {
    return (
      <ScreenContainer>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>Invoice not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const sentDate = new Date(invoice.sentAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Invoice</Text>
        <Pressable
          style={({ pressed }) => [styles.pdfBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleDownloadPDF}
          hitSlop={8}
        >
          <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Invoice Header */}
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={[styles.invoiceTitle, { color: colors.foreground }]}>Nexgig<Text style={{ color: colors.primary, fontFamily: fonts.displayBold }}>.</Text></Text>
              <Text style={[styles.brandSlogan, { color: colors.muted }]}>BOOK. PLAY. DISCOVER.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.invMetaLabel, { color: colors.muted }]}>INVOICE</Text>
              <Text style={[styles.invoiceNum, { color: colors.primary }]}>{invoice.invoiceNumber}</Text>
              <Text style={[styles.invoiceDate, { color: colors.muted }]}>{sentDate}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* From / To */}
          <View style={styles.partiesRow}>
            <View style={styles.partyCol}>
              <Text style={[styles.partyLabel, { color: colors.muted }]}>FROM</Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{invoice.artistLegalName}</Text>
              {!!invoice.artistEmail && <Text style={[styles.partyDetail, { color: colors.muted }]}>{invoice.artistEmail}</Text>}
              {!!invoice.artistLocation && <Text style={[styles.partyDetail, { color: colors.muted }]}>{invoice.artistLocation}</Text>}
            </View>
            <View style={styles.partyCol}>
              <Text style={[styles.partyLabel, { color: colors.muted }]}>TO</Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{invoice.venueLegalName}</Text>
              {!!invoice.venueAddress && <Text style={[styles.partyDetail, { color: colors.muted }]}>{invoice.venueAddress}</Text>}
              {!!invoice.venueTrnNumber && <Text style={[styles.partyDetail, { color: colors.muted }]}>TRN: {invoice.venueTrnNumber}</Text>}
            </View>
          </View>

          {/* Table Header */}
          <View style={[styles.tableHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.thGig, { color: colors.muted }]}>GIG</Text>
            <Text style={[styles.thTime, { color: colors.muted }]}>TIME</Text>
            <Text style={[styles.thAmount, { color: colors.muted }]}>AMOUNT (AED)</Text>
          </View>

          {/* Gig Rows */}
          {invoice.gigs.map((g, i) => (
            <View key={i} style={[styles.tableRow, i < invoice.gigs.length - 1 ? { borderBottomColor: colors.border } : { borderBottomWidth: 0 }]}>
              <View style={styles.tdGig}>
                <Text style={[styles.tdGigDate, { color: colors.foreground }]}>{formatFullDate(g.date)}</Text>
                <Text style={[styles.tdGigVenue, { color: colors.muted }]}>{invoice.venueName}</Text>
              </View>
              <Text style={[styles.tdTime, { color: colors.foreground }]}>
                {formatTime(g.startTime)} – {formatTime(g.endTime)}
              </Text>
              <Text style={[styles.tdPrice, { color: colors.foreground }]}>{Math.round(g.price).toLocaleString()}</Text>
            </View>
          ))}

          {/* Total */}
          <View style={[styles.totalRow, { borderColor: colors.primary }]}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>AED {Math.round(invoice.totalAmount).toLocaleString()}</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 40 },
  title: { fontSize: 17, fontWeight: '700' },
  pdfBtn: { width: 40, alignItems: 'flex-end' },
  scroll: { padding: 16, paddingBottom: 32 },
  invoiceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceTitle: { fontSize: 24, fontWeight: '800', fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  brandSlogan: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 3 },
  invMetaLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  invoiceNum: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  invoiceDate: { fontSize: 12 },
  divider: { height: 0.5 },
  partiesRow: { flexDirection: 'row', gap: 16 },
  partyCol: { flex: 1, gap: 3 },
  partyLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  partyName: { fontSize: 14, fontWeight: '700' },
  partyDetail: { fontSize: 11 },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  thGig: { flex: 2, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  thTime: { flex: 1.5, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  thAmount: { flex: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    gap: 4,
  },
  tdGig: { flex: 2, gap: 2 },
  tdGigDate: { fontSize: 13, fontWeight: '600' },
  tdGigVenue: { fontSize: 11 },
  tdTime: { flex: 1.5, fontSize: 12 },
  tdPrice: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 2,
  },
  totalLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { fontSize: 20, fontWeight: '800', fontFamily: fonts.bodyBold },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
  footerText: { fontSize: 11 },
  sentBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sentBadgeText: { color: '#16a34a', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
