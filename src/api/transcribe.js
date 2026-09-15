// Cheapest/quickest voice-to-text path, not the most polished one (user
// request) - a cloud call from the client straight to OpenAI's Whisper
// endpoint, rather than an on-device speech recognizer. The real reason:
// every on-device option (@react-native-voice/voice, expo-speech-recognition)
// is native code, which means leaving Expo Go for a custom dev client - the
// same tradeoff CoinSpinner's own docstring already made a call on (it
// avoids Reanimated for exactly this reason). This keeps the app in Expo Go.
//
// SECURITY NOTE: EXPO_PUBLIC_ vars are bundled into the client and readable
// by anyone who has the app - fine for the Google key (Google lets you
// restrict a key by Android package/iOS bundle ID), but OpenAI keys have no
// equivalent restriction. A leaked key can rack up real cost with no cap.
// Acceptable for now as a fast first pass, but the real fix before wider
// release is routing this through a small server/Cloud Function that holds
// the key server-side instead.
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

/**
 * Sends a recorded audio file (local file:// uri) to OpenAI's Whisper
 * transcription endpoint and returns the plain text, or null on any failure
 * (missing key, network error, empty result) - callers should treat null as
 * "couldn't transcribe that, try typing instead" rather than surfacing a
 * raw error.
 */
export async function transcribeAudio(uri) {
  if (!OPENAI_API_KEY) {
    console.warn('Missing EXPO_PUBLIC_OPENAI_API_KEY - voice-to-text is disabled.');
    return null;
  }
  if (!uri) return null;

  const form = new FormData();
  form.append('file', { uri, name: 'note.m4a', type: 'audio/m4a' });
  form.append('model', 'whisper-1');

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) {
      console.warn('🚨 WHISPER TRANSCRIPTION ERROR 🚨:', data);
      return null;
    }
    return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
  } catch (e) {
    console.warn('🚨 WHISPER TRANSCRIPTION NETWORK ERROR 🚨:', e);
    return null;
  }
}
