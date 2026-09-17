import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { auth } from '../api/firebase';
import { useGoogleAuthRequest, signInWithGoogleIdToken, signOutGoogle } from '../api/googleAuth';

/**
 * Settings' account row - "Sign in with Google" for an account that keeps
 * favorites/journal/history saved across reinstalls and devices (user
 * request), or the signed-in state + a way to sign out once linked.
 *
 * Tracks auth state itself via onAuthStateChanged rather than taking myUid
 * as a prop - App.js's myUid is set once from the initial ensureSignedIn()
 * call and was never meant to reactively reflect "did this same uid just
 * become Google-linked," which is exactly the transition this row needs to
 * notice and re-render for.
 */
export default function GoogleSignInRow() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [user, setUser] = useState(auth.currentUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request, response, promptAsync] = useGoogleAuthRequest();

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token;
    if (!idToken) {
      setError("Didn't get a valid response from Google - try again.");
      return;
    }
    setBusy(true);
    setError('');
    signInWithGoogleIdToken(idToken)
      .catch(() => setError('Could not sign in - try again.'))
      .finally(() => setBusy(false));
  }, [response]);

  const googleInfo = user?.providerData?.find((p) => p.providerId === 'google.com');

  if (googleInfo) {
    return (
      <View style={styles.signedInRow}>
        {googleInfo.photoURL ? (
          <Image source={{ uri: googleInfo.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={16} color={colors.textDark} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.signedInName} numberOfLines={1}>{googleInfo.displayName || 'Signed in'}</Text>
          <Text style={styles.signedInEmail} numberOfLines={1}>{googleInfo.email}</Text>
        </View>
        <Pressable onPress={() => signOutGoogle()} style={styles.signOutBtn} hitSlop={6}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        style={[styles.googleBtn, (!request || busy) && { opacity: 0.5 }]}
        disabled={!request || busy}
        onPress={() => promptAsync()}
      >
        {busy ? (
          <ActivityIndicator color={colors.textDark} size="small" />
        ) : (
          <>
            <Ionicons name="logo-google" size={16} color={colors.textDark} />
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.hint}>Keeps your favorites, journal, and history saved to your account.</Text>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 10,
    ...buttonDepth,
  },
  googleBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13, marginLeft: 8 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6 },
  signedInRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  signedInName: { color: colors.textLight, fontWeight: '700', fontSize: 13 },
  signedInEmail: { color: colors.textMuted, fontSize: 11 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
});
