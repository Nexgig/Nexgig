import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

type CountryCode = {
  code: string;   // e.g. "+971"
  name: string;   // e.g. "United Arab Emirates"
  flag: string;   // emoji flag
};

const COUNTRY_CODES: CountryCode[] = [
  { flag: '🇦🇪', code: '+971', name: 'United Arab Emirates' },
  { flag: '🇸🇦', code: '+966', name: 'Saudi Arabia' },
  { flag: '🇶🇦', code: '+974', name: 'Qatar' },
  { flag: '🇰🇼', code: '+965', name: 'Kuwait' },
  { flag: '🇧🇭', code: '+973', name: 'Bahrain' },
  { flag: '🇴🇲', code: '+968', name: 'Oman' },
  { flag: '🇯🇴', code: '+962', name: 'Jordan' },
  { flag: '🇱🇧', code: '+961', name: 'Lebanon' },
  { flag: '🇪🇬', code: '+20',  name: 'Egypt' },
  { flag: '🇮🇶', code: '+964', name: 'Iraq' },
  { flag: '🇸🇾', code: '+963', name: 'Syria' },
  { flag: '🇾🇪', code: '+967', name: 'Yemen' },
  { flag: '🇲🇦', code: '+212', name: 'Morocco' },
  { flag: '🇩🇿', code: '+213', name: 'Algeria' },
  { flag: '🇹🇳', code: '+216', name: 'Tunisia' },
  { flag: '🇱🇾', code: '+218', name: 'Libya' },
  { flag: '🇸🇩', code: '+249', name: 'Sudan' },
  { flag: '🇬🇧', code: '+44',  name: 'United Kingdom' },
  { flag: '🇺🇸', code: '+1',   name: 'United States' },
  { flag: '🇨🇦', code: '+1',   name: 'Canada' },
  { flag: '🇫🇷', code: '+33',  name: 'France' },
  { flag: '🇩🇪', code: '+49',  name: 'Germany' },
  { flag: '🇳🇱', code: '+31',  name: 'Netherlands' },
  { flag: '🇧🇪', code: '+32',  name: 'Belgium' },
  { flag: '🇨🇭', code: '+41',  name: 'Switzerland' },
  { flag: '🇦🇹', code: '+43',  name: 'Austria' },
  { flag: '🇸🇪', code: '+46',  name: 'Sweden' },
  { flag: '🇳🇴', code: '+47',  name: 'Norway' },
  { flag: '🇩🇰', code: '+45',  name: 'Denmark' },
  { flag: '🇫🇮', code: '+358', name: 'Finland' },
  { flag: '🇮🇹', code: '+39',  name: 'Italy' },
  { flag: '🇪🇸', code: '+34',  name: 'Spain' },
  { flag: '🇵🇹', code: '+351', name: 'Portugal' },
  { flag: '🇬🇷', code: '+30',  name: 'Greece' },
  { flag: '🇵🇱', code: '+48',  name: 'Poland' },
  { flag: '🇷🇺', code: '+7',   name: 'Russia' },
  { flag: '🇹🇷', code: '+90',  name: 'Turkey' },
  { flag: '🇮🇳', code: '+91',  name: 'India' },
  { flag: '🇵🇰', code: '+92',  name: 'Pakistan' },
  { flag: '🇧🇩', code: '+880', name: 'Bangladesh' },
  { flag: '🇱🇰', code: '+94',  name: 'Sri Lanka' },
  { flag: '🇳🇵', code: '+977', name: 'Nepal' },
  { flag: '🇵🇭', code: '+63',  name: 'Philippines' },
  { flag: '🇮🇩', code: '+62',  name: 'Indonesia' },
  { flag: '🇲🇾', code: '+60',  name: 'Malaysia' },
  { flag: '🇸🇬', code: '+65',  name: 'Singapore' },
  { flag: '🇹🇭', code: '+66',  name: 'Thailand' },
  { flag: '🇻🇳', code: '+84',  name: 'Vietnam' },
  { flag: '🇨🇳', code: '+86',  name: 'China' },
  { flag: '🇯🇵', code: '+81',  name: 'Japan' },
  { flag: '🇰🇷', code: '+82',  name: 'South Korea' },
  { flag: '🇦🇺', code: '+61',  name: 'Australia' },
  { flag: '🇳🇿', code: '+64',  name: 'New Zealand' },
  { flag: '🇿🇦', code: '+27',  name: 'South Africa' },
  { flag: '🇳🇬', code: '+234', name: 'Nigeria' },
  { flag: '🇬🇭', code: '+233', name: 'Ghana' },
  { flag: '🇰🇪', code: '+254', name: 'Kenya' },
  { flag: '🇪🇹', code: '+251', name: 'Ethiopia' },
  { flag: '🇧🇷', code: '+55',  name: 'Brazil' },
  { flag: '🇲🇽', code: '+52',  name: 'Mexico' },
  { flag: '🇦🇷', code: '+54',  name: 'Argentina' },
  { flag: '🇨🇴', code: '+57',  name: 'Colombia' },
];

type Props = {
  value: string;
  onChange: (fullNumber: string) => void;
  label?: string;
  optional?: boolean;
};

export function PhoneInput({ value, onChange, label = 'Phone Number', optional = true }: Props) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]); // UAE default
  const [numberPart, setNumberPart] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? COUNTRY_CODES.filter((c) => c.name.toLowerCase().includes(q) || c.code.includes(q))
      : COUNTRY_CODES;
  }, [search]);

  const handleSelectCountry = (country: CountryCode) => {
    setSelectedCountry(country);
    setShowPicker(false);
    setSearch('');
    const full = numberPart ? `${country.code} ${numberPart}` : '';
    onChange(full);
  };

  const handleNumberChange = (num: string) => {
    // Only digits, spaces, dashes allowed
    const cleaned = num.replace(/[^0-9\s\-]/g, '');
    setNumberPart(cleaned);
    const full = cleaned ? `${selectedCountry.code} ${cleaned}` : '';
    onChange(full);
  };

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.foreground }]}>
        {label}{optional ? ' (optional)' : ''}
      </Text>
      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {/* Country code picker button */}
        <Pressable
          style={({ pressed }) => [styles.codeBtn, { borderRightColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <Text style={[styles.code, { color: colors.foreground }]}>{selectedCountry.code}</Text>
          <MaterialIcons name="arrow-drop-down" size={18} color={colors.muted} />
        </Pressable>
        {/* Number input */}
        <TextInput
          style={[styles.numberInput, { color: colors.foreground }]}
          placeholder="50 123 4567"
          placeholderTextColor={colors.muted}
          value={numberPart}
          onChangeText={handleNumberChange}
          keyboardType="phone-pad"
          returnKeyType="done"
        />
      </View>

      {/* Country picker modal */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Country Code</Text>
            {/* Search */}
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="search" size={18} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search country..."
                placeholderTextColor={colors.muted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => `${item.name}-${item.code}`}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = item.name === selectedCountry.name;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryRow,
                      { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.primary + '10' : pressed ? colors.surface : 'transparent' }
                    ]}
                    onPress={() => handleSelectCountry(item)}
                  >
                    <Text style={styles.countryFlag}>{item.flag}</Text>
                    <Text style={[styles.countryName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.countryCode, { color: isSelected ? colors.primary : colors.muted }]}>{item.code}</Text>
                    {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => { setShowPicker(false); setSearch(''); }}
            >
              <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14, borderRightWidth: 1 },
  flag: { fontSize: 18 },
  code: { fontSize: 14, fontWeight: '700' },
  numberInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5 },
  countryFlag: { fontSize: 22 },
  countryName: { flex: 1, fontSize: 15 },
  countryCode: { fontSize: 14, fontWeight: '600' },
  cancelBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 40 },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
});
