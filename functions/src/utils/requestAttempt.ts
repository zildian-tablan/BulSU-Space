import { Firestore, Timestamp } from "firebase-admin/firestore";

async function requestAttempt(db: Firestore, user_uid: string, now: Date) {

   //  Track MFA request attempts
    const attemptsRef = db.collection("mfa_request_limit").doc(user_uid);
    const attemptsDoc = await attemptsRef.get();

    let requestCount = 0;
    let firstRequestAt = now;

    if (attemptsDoc.exists) {
      const data = attemptsDoc.data()!;
      requestCount = data.requestCount || 0;
      firstRequestAt = data.firstRequestAt?.toDate() || now;

      // Reset counter if 1 day passed since first request
      if (now.getTime() - firstRequestAt.getTime() > 24 * 60 * 60 * 1000) {
        requestCount = 0;
        firstRequestAt = now;
      }
    }

    requestCount++;

    if (requestCount > 5) {

      const lockRef = db.collection("mfa_user_lock").doc(user_uid);
      // 🔒 Lock for 1 day
      const lockUntil = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      await lockRef.set({ user: user_uid, lockUntil, attemptCount: 0 });
      await attemptsRef.set({ requestCount: 0, firstRequestAt: Timestamp.fromDate(now) });
      // return { success: false, locked: true, message: "Too many MFA code requests. You are locked for 1 day." };
      return 'restricted'
    }

    await attemptsRef.set({ requestCount, firstRequestAt: Timestamp.fromDate(firstRequestAt) });

    return 'allowed'
}

export default requestAttempt