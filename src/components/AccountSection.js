import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, TextInput, Image, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { auth } from '../api/firebase';
import {
  promptGoogleSignIn, signInWithGoogleIdToken, signOutGoogle, isErrorWithCode, statusCodes,
} from '../api/googleAuth';
import { signUpOrSignInWithEmail, resetPassword, emailAuthErrorMessage } from '../api/emailAuth';

/**
 * Settings' account row - offers a choice of Google or email/password sign-
 * in for an account that keeps favorites/journal/history saved across
 * reinstalls and devices (user request: "real email and password is a good
 * thing to add with the choice to still have google sign in"), or the
 * signed-in state + a way to sign out once linked via either provider.
 *
 * Replaces the old Google-only GoogleSignInRow - folded into one component
 * since both providers ultimately drive the same signed-in/signed-out view,
 * and showing two separate rows that each independently guess at "are we
 * signed in" would double up that state instead of sharing it.
 *
 * Tracks auth state itself via onAuthStateChanged rather than taking myUid
 * as a prop - App.js's myUid is set once from the initial ensureSignedIn()
 * call and was never meant to reactively reflect "did this same uid just
 * become linked to a real provider," which is exactly the transition this
 * row needs to notice and re-render for.
 */
export default function AccountSection() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [user, setUser] = useState(auth.currentUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const providerData = user?.providerData || [];
  const isSignedIn = providerData.length > 0;

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const idToken = await promptGoogleSignIn();
      if (!idToken) return; // user cancelled the native picker - not an error
      await signInWithGoogleIdToken(idToken);
    } catch (e) {
      // SIGN_IN_CANCELLED can also surface here (e.g. backing out of the
      // account picker) rather than as a null idToken, depending on the
      // exact native path taken - either way it's not a real failure.
      if (!(isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED)) {
        setError('Could not sign in - try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await signUpOrSignInWithEmail(email.trim(), password);
      setPassword('');
    } catch (e) {
      setError(emailAuthErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above first.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await resetPassword(email.trim());
      setInfo('Password reset email sent - check your inbox.');
    } catch (e) {
      setError(emailAuthErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (isSignedIn) {
    const photoURL = providerData.find((p) => p.photoURL)?.photoURL;
    const name = providerData.find((p) => p.displayName)?.displayName;
    const signedInEmail = providerData.find((p) => p.email)?.email;
    return (
      <View style={styles.signedInRow}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={16} color={colors.textDark} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.signedInName} numberOfLines={1}>{name || 'Signed in'}</Text>
          {!!signedInEmail && <Text style={styles.signedInEmail} numberOfLines={1}>{signedInEmail}</Text>}
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
        style={[styles.googleBtn, busy && { opacity: 0.5 }]}
        disabled={busy}
        onPress={handleGoogleSignIn}
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

      <Pressable onPress={() => setShowEmailForm((v) => !v)} style={styles.emailToggle} hitSlop={6}>
        <Text style={styles.emailToggleText}>{showEmailForm ? 'Hide email sign-in' : 'Or use email and password'}</Text>
      </Pressable>

      {showEmailForm && (
        <View style={styles.emailForm}>
          <TextInput
            style={styles.emailInput}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#777"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextInput
            style={styles.emailInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#777"
            secureTextEntry
          />
          <View style={styles.emailFormFooter}>
            <Pressable onPress={handleForgotPassword} hitSlop={6}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
            <Pressable
              style={[styles.emailSubmitBtn, (busy || !email.trim() || !password) && { opacity: 0.5 }]}
              disabled={busy || !email.trim() || !password}
              onPress={handleEmailSubmit}
            >
              {busy ? (
                <ActivityIndicator color={colors.textDark} size="small" />
              ) : (
                <Text style={styles.emailSubmitText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.hint}>Keeps your favorites, journal, and history saved to your account.</Text>
      {!!info && <Text style={styles.infoText}>{info}</Text>}
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
  emailToggle: { alignSelf: 'center', paddingVertical: 8 },
  emailToggleText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  emailForm: { marginTop: 4 },
  emailInput: {
    backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.textLight, fontSize: 14, marginBottom: 8,
  },
  emailFormFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  forgotText: { color: colors.textMuted, fontSize: 11, textDecorationLine: 'underline' },
  emailSubmitBtn: {
    backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 18,
    ...buttonDepth,
  },
  emailSubmitText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 10 },
  infoText: { color: colors.accent, fontSize: 12, marginTop: 6 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6 },
  signedInRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  signedInName: { color: colors.textLight, fontWeight: '700', fontSize: 13 },
  signedInEmail: { color: colors.textMuted, fontSize: 11 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
});
