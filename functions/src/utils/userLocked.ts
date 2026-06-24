import { Firestore, Timestamp } from "firebase-admin/firestore";

async function userLocked(db: Firestore, user_uid: string) {
   const now = new Date();
   const lockRef = db.collection("mfa_user_lock").doc(user_uid);
   const lockDoc = await lockRef.get();

   // Check if user is locked
   if (lockDoc.exists) {
      const { lockUntil } = lockDoc.data()!;
      if (lockUntil instanceof Timestamp && lockUntil.toDate() > now) {
         const unlockTime = lockUntil.toDate().toLocaleString();
         return true
      }
   }

   return false
}

export default userLocked