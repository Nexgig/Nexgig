import { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, type ViewToken } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { Platform } from '@/lib/rn';

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const HALF = Math.floor(VISIBLE_COUNT / 2);
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// ─── Single Wheel Column ─────────────────────────────────────────────────────

interface WheelColumnProps {
  data: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
}

function WheelColumn({ data, selectedIndex, onIndexChange }: WheelColumnProps) {
  const colors = useColors();
  const flatListRef = useRef<FlatList<string>>(null);
  const lastReportedIndex = useRef(selectedIndex);
  const isMounted = useRef(false);

  // Scroll to initial position
  useEffect(() => {
    const timer = setTimeout(() => {
      isMounted.current = true;
      flatListRef.current?.scrollToOffset({
        offset: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Sync when parent value changes externally
  useEffect(() => {
    if (isMounted.current && selectedIndex !== lastReportedIndex.current) {
      lastReportedIndex.current = selectedIndex;
      flatListRef.current?.scrollToOffset({
        offset: selectedIndex * ITEM_HEIGHT,
        animated: true,
      });
    }
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback(
    (event: any) => {
      const y = event.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, data.length - 1));
      if (clamped !== lastReportedIndex.current) {
        lastReportedIndex.current = clamped;
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onIndexChange(clamped);
      }
    },
    [data.length, onIndexChange]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => {
      const distance = Math.abs(index - selectedIndex);
      const isSelected = distance === 0;
      const isNear = distance <= 1;
      return (
        <View style={wheelStyles.item}>
          <Text
            style={{
              fontSize: isSelected ? 24 : isNear ? 19 : 16,
              fontWeight: isSelected ? '700' : '400',
              color: isSelected ? colors.foreground : colors.muted,
              opacity: isSelected ? 1 : isNear ? 0.55 : 0.25,
              fontVariant: ['tabular-nums'],
              textAlign: 'center',
            }}
          >
            {item}
          </Text>
        </View>
      );
    },
    [selectedIndex, colors]
  );

  return (
    <View style={[wheelStyles.container, { height: PICKER_HEIGHT }]}>
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item, i) => `${item}-${i}`}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.98}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleMomentumEnd}
        contentContainerStyle={{
          paddingTop: HALF * ITEM_HEIGHT,
          paddingBottom: HALF * ITEM_HEIGHT,
        }}
        initialScrollIndex={selectedIndex}
        nestedScrollEnabled
        overScrollMode="never"
        bounces={false}
      />
    </View>
  );
}

// ─── TimeSelector (exported) ─────────────────────────────────────────────────

interface TimeSelectorProps {
  value: string; // "HH:MM"
  onChange: (time: string) => void;
  label?: string;
}

export function TimeSelector({ value, onChange, label }: TimeSelectorProps) {
  const colors = useColors();
  const parts = (value || '20:00').split(':');
  const hourStr = parts[0] || '20';
  const minuteStr = parts[1] || '00';

  const hourIndex = HOURS.indexOf(hourStr) >= 0 ? HOURS.indexOf(hourStr) : 20;
  const minuteIndex = MINUTES.indexOf(minuteStr) >= 0 ? MINUTES.indexOf(minuteStr) : 0;

  const handleHourChange = useCallback(
    (index: number) => {
      onChange(`${HOURS[index]}:${minuteStr}`);
    },
    [minuteStr, onChange]
  );

  const handleMinuteChange = useCallback(
    (index: number) => {
      onChange(`${hourStr}:${MINUTES[index]}`);
    },
    [hourStr, onChange]
  );

  return (
    <View style={pickerStyles.container}>
      {label && (
        <Text style={[pickerStyles.label, { color: colors.foreground }]}>{label}</Text>
      )}
      <View style={[pickerStyles.outerBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Highlight band across both wheels */}
        <View
          style={[
            pickerStyles.highlightBand,
            {
              top: HALF * ITEM_HEIGHT,
              backgroundColor: `${colors.primary}18`,
              borderTopColor: colors.border,
              borderBottomColor: colors.border,
            },
          ]}
          pointerEvents="none"
        />
        <WheelColumn
          data={HOURS}
          selectedIndex={hourIndex}
          onIndexChange={handleHourChange}
        />
        <View style={pickerStyles.colonContainer} pointerEvents="none">
          <Text style={[pickerStyles.colon, { color: colors.foreground }]}>:</Text>
        </View>
        <WheelColumn
          data={MINUTES}
          selectedIndex={minuteIndex}
          onIndexChange={handleMinuteChange}
        />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const wheelStyles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const pickerStyles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  outerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    height: PICKER_HEIGHT,
  },
  highlightBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  colonContainer: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: PICKER_HEIGHT,
    zIndex: 11,
  },
  colon: {
    fontSize: 24,
    fontWeight: '700',
  },
});
