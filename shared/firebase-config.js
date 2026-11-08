/* Firebase project configuration.
 *
 * Backend is Firebase Authentication + Realtime Database — chosen
 * specifically because Realtime Database works on the free Spark plan
 * with no billing account required (unlike Firestore, which now requires
 * upgrading to the Blaze plan just to create a database, even to stay
 * within its free tier).
 *
 * These values are not secret — they identify your project, not authorize
 * access to it. Real access control lives in database.rules.json, not here.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyD5048tGr1biITgI2mlUa_MXdInPX4DZMc",
  authDomain: "bucketlist-769b9.firebaseapp.com",
  databaseURL: "https://bucketlist-769b9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bucketlist-769b9",
  storageBucket: "bucketlist-769b9.firebasestorage.app",
  messagingSenderId: "308027578409",
  appId: "1:308027578409:web:178aa24b6a26c9a27de438",
  measurementId: "G-2B9XFZZ52F",
};

/* The single owner account. Auto-approved as "owner" on first sign-in,
 * bypassing the request queue. Also checked independently in
 * database.rules.json — that server-side copy is the real security
 * boundary, this one is just so the client UI knows to skip the request
 * screen. */
export const OWNER_EMAIL = "abdujalilov7707@gmail.com";
