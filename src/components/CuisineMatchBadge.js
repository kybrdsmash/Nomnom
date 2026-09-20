import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { ensureSignedIn } from '../api/firebase';
import { submitCuisineFeedback } from '../api/cuisineFeedback';

/**
 * Replaces the old plain "No {Cuisine} Match Nearby" text wherever a result
 * came from places.js's unconfirmedCuisine fallback (Google had no confirmed
 * match for the searched cuisine nearby, so this is the closest option
 * instead). That wording read as "there's nothing here" while looking
 * straight at a real result card - especially confusing on a Flip Again
 * reroll after already seeing genuine matches earlier in the same search
 * (user feedback: "kinda doesn't feel right" unless it's literally the
 * first result shown).
 *
 * Now asks instead of asserts - "Not necessarily a {cuisine} place?" with a
 * yes/no so the person looking right at the place can just tell us, which
 * doubles as free crowdsourced signal for tuning places.js's
 * CUISINE_TYPE_REQUIREMENTS/NAME_HINTS later (see cuisineFeedback.js - a
 * one-way mailbox, not a live filter). Only settles into a flat statement
 * ("Not a {cuisine} place") once someone has actually said so.
 */
export default function CuisineMatchBadge({ cuisine, spotId, spotName }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [vote, setVote] = useState(null); // null | 'yes' | 'no'
  const [submitting, setSubmitting] = useState(false);

  const castVote = async (matches) => {
    if (submitting || vote) return;
    setSubmitting(true);
    setVote(matches ? 'yes' : 'no');
    let uid = null;
    try {
      uid = await ensureSignedIn();
    } catch (e) {
      // Falls through with uid null - submitCuisineFeedback still logs the
      // vote itself, same as bugReports' own fallback.
    }
    submitCuisineFeedback({ uid, placeId: spotId, placeName: spotName, cuisine, matches });
    setSubmitting(false);
  };

  if (vote === 'no') {
    return (
      <View style={styles.badge}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.text}>Not a {cuisine} place</Text>
      </View>
    );
  }

  if (vote === 'yes') {
    return (
      <View style={styles.badge}>
        <Ionicons name="checkmark-circle-outline" size={14} color={colors.accent} />
        <Text style={styles.text}>Thanks - noted this as {cuisine}</Text>
      </View>
    );
  }

  return (
    <View style={styles.badge}>
      <Ionicons name="help-circle-outline" size={14} color={colors.textMuted} />
      <Text style={styles.text}>
        Not necessarily a {cuisine} place?{' '}
        <Text style={styles.voteText} onPress={() => castVote(true)} suppressHighlighting>Yes, it is</Text>
        {'  ·  '}
        <Text style={styles.voteText} onPress={() => castVote(false)} suppressHighlighting>No</Text>
      </Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 8 },
  text: { color: colors.textMuted, fontSize: 12, marginLeft: 4, textAlign: 'center' },
  // Plain text, not a button - the "no" answer should read as always-there
  // and easy to reach for, not a decision heavy enough to need its own
  // pill/chrome (user request: "shouldn't feel like a [need to] push
  // button... just obviously available"). Underline is the only cue it's
  // tappable at all.
  voteText: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
});
