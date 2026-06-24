import { firestore } from "firebase-admin";

interface UserData {
   id: string;
   email: string; 
   mfaEmail: string
}

async function getSpecialUserMFAEmail(db: firestore.Firestore, userEmail: string) {
   const snapshot = await db.collection("users")
      .where("email", "==", userEmail)
      .limit(1)
      .get();

   if (snapshot.empty) return null;

   const doc = snapshot.docs[0];
   const data = doc.data();

   // Check mfaEmail in memory — no composite index needed
   if (!data.mfaEmail) return null;

   return { id: doc.id, ...data } as UserData;
}

export default getSpecialUserMFAEmail;