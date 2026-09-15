import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { HELP_HIGHLIGHTS, HELP_SECTIONS, findHelpSection } from '../helpContent';

// Fixed (not theme-derived) so each gesture kind stays visually distinct no
// matter what accent color the user has picked - same reasoning as colors.gold
// / colors.danger already being flat hex rather than accent-derived.
const TAG_COLORS = {
  tap: '#6FB8FF',
  hold: '#FFB86B',
  swipe: '#7EE0C5',
  pinch: '#C792EA',
  drag: '#82AAFF',
  visible: '#8A8A8A',
};
const TAG_LABELS = {
  tap: 'Tap', hold: 'Long-press', swipe: 'Swipe', pinch: 'Pinch', drag: 'Drag', visible: '',
};

/**
 * Two render modes, one component - both are just different slices of the
 * same src/helpContent.js data:
 *  - `sectionId` unset (opened from Settings' "(i)"): the full guide - the
 *    11 "secret moves" highlights, then every section as a tap-to-expand
 *    accordion row (user request: "categorical highlights... then a list
 *    with each of the next sections... clickable... expands even more").
 *  - `sectionId` set (opened from the Cuisines header's "(i)", only while
 *    expanded): just that one section's content, already open, no
 *    accordion - "all applicable training material in a scrollable page"
 *    for that specific control (user request).
 * Its own top-level Modal, not nested in Settings' floating panel - same
 * reasoning as ReportBugModal (see its own docstring): a Modal renders a
 * fresh subtree at the screen root, avoiding depth/offset issues entirely.
 */
export default function HelpModal({ visible, onClose, sectionId }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [expandedId, setExpandedId] = useState(null);
  const [highlightsOpen, setHighlightsOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setExpandedId(null);
      setHighlightsOpen(false);
    }
  }, [visible]);

  const scopedSection = sectionId ? findHelpSection(sectionId) : null;

  const renderMove = (move, i) => (
    <View key={i} style={styles.moveRow}>
      {move.tag === 'visible' ? (
        <View style={styles.tagPlain} />
      ) : (
        <View style={[styles.tagDot, { backgroundColor: TAG_COLORS[move.tag] }]} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.moveActionRow}>
          {/* The real icon from the actual button, not just its name in
              text - lets this line up with what's on screen at a glance
              (user request). Only set on moves that map to one specific
              icon (see helpContent.js) - a few rows describe several icons
              at once ("Heart / bookmark / share") and skip this rather than
              turning into 3x the rows for one glyph each. */}
          {move.icon && <Ionicons name={move.icon} size={14} color={colors.textLight} style={{ marginRight: 6 }} />}
          <Text style={styles.moveAction}>
            {TAG_LABELS[move.tag] ? `${TAG_LABELS[move.tag]} · ` : ''}
            {move.action}
          </Text>
        </View>
        <Text style={styles.moveResult}>{move.result}</Text>
      </View>
    </View>
  );

  const renderGroups = (groups) =>
    groups.map((group, gi) => (
      <View key={gi} style={group.label ? styles.groupBlock : null}>
        {group.label && <Text style={styles.groupLabel}>{group.label}</Text>}
        {group.moves.map(renderMove)}
      </View>
    ));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {scopedSection ? scopedSection.title : 'How Nomnom Works'}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 6 }} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.accent} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator style={styles.scroll}>
            {scopedSection ? (
              <>
                <Text style={styles.sectionDesc}>{scopedSection.description}</Text>
                {renderGroups(scopedSection.groups)}
              </>
            ) : (
              <>
                {/* Same collapsed-rectangle treatment as the section rows
                    below (user request) - starts closed so the guide opens
                    on a short, scannable list rather than dumping all 11
                    highlights immediately. */}
                <View style={styles.sectionCard}>
                  <Pressable
                    style={styles.sectionRow}
                    onPress={() => setHighlightsOpen((v) => !v)}
                  >
                    <Ionicons name="sparkles-outline" size={18} color={colors.gold} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>11 Things Nobody Tells You</Text>
                      {!highlightsOpen && (
                        <Text style={styles.sectionDescCollapsed} numberOfLines={1}>
                          Gestures and shortcuts with no on-screen hint anywhere in the app.
                        </Text>
                      )}
                    </View>
                    <Ionicons name={highlightsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                  </Pressable>
                  {highlightsOpen && (
                    <View style={styles.sectionExpanded}>
                      {HELP_HIGHLIGHTS.map((h, i) => (
                        <View key={i} style={styles.highlightRow}>
                          <Text style={styles.highlightNum}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.highlightTitle}>{h.title}</Text>
                            <Text style={styles.highlightText}>{h.text}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <Text style={styles.sectionsHead}>Every section, in order</Text>
                {HELP_SECTIONS.map((section) => {
                  const open = expandedId === section.id;
                  return (
                    <View key={section.id} style={styles.sectionCard}>
                      <Pressable
                        style={styles.sectionRow}
                        onPress={() => setExpandedId(open ? null : section.id)}
                      >
                        <Ionicons name={section.icon} size={18} color={colors.accent} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sectionTitle}>{section.title}</Text>
                          {!open && (
                            <Text style={styles.sectionDescCollapsed} numberOfLines={1}>{section.description}</Text>
                          )}
                        </View>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                      </Pressable>
                      {open && (
                        <View style={styles.sectionExpanded}>
                          <Text style={styles.sectionDesc}>{section.description}</Text>
                          {renderGroups(section.groups)}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.background, borderRadius: 24, padding: 20,
    width: '90%', height: '85%', ...buttonDepth, elevation: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: colors.textLight, fontSize: 19, fontWeight: 'bold', flex: 1, marginRight: 10 },
  scroll: { flex: 1 },

  highlightRow: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12,
    padding: 10, marginBottom: 6, alignItems: 'flex-start',
  },
  highlightNum: {
    color: colors.accent, fontWeight: 'bold', fontSize: 13, width: 20,
  },
  highlightTitle: { color: colors.textLight, fontSize: 13, fontWeight: '700' },
  highlightText: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },

  sectionsHead: {
    color: colors.accent, fontWeight: 'bold', fontSize: 12, letterSpacing: 1,
    marginTop: 16, marginBottom: 8, textTransform: 'uppercase',
  },
  sectionCard: { backgroundColor: colors.card, borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  sectionTitle: { color: colors.textLight, fontSize: 14, fontWeight: '700' },
  sectionDescCollapsed: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  sectionExpanded: { paddingHorizontal: 12, paddingBottom: 12 },
  sectionDesc: { color: colors.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 16 },

  groupBlock: { marginBottom: 4 },
  groupLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginTop: 10, marginBottom: 4,
  },
  moveRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  tagDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 8 },
  tagPlain: { width: 8, height: 8, marginTop: 5, marginRight: 8 },
  moveActionRow: { flexDirection: 'row', alignItems: 'center' },
  moveAction: { color: colors.textLight, fontSize: 13, fontWeight: '600' },
  moveResult: { color: colors.textMuted, fontSize: 12, marginTop: 1, lineHeight: 16 },
});
