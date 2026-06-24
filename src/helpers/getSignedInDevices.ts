import { db } from "firebase/config";
import { getAuth } from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";


async function getSignedInDevices() {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) throw new Error('User not found')

    const devices: any[] = [];

    // Read canonical per-user document first.
    const canonicalRef = doc(db, "device", user.uid);
    const canonicalSnap = await getDoc(canonicalRef);
    if (canonicalSnap.exists()) {
      devices.push({
        id: canonicalSnap.id,
        ...canonicalSnap.data(),
      });
    }

    // Temporary legacy fallback for random-id docs.
    const devicesRef = collection(db, "device");

    // Query documents where user == uid
    const q = query(devicesRef, where("user", "==", user.uid));

    // Execute the query
    const snapshot = await getDocs(q);

    snapshot.docs.forEach((deviceDoc) => {
      if (deviceDoc.id === user.uid) return;
      devices.push({
        id: deviceDoc.id,
        ...deviceDoc.data(),
      });
    });

    console.log(devices);
    return devices;
  } catch (error) {
    console.error("Error fetching signed-in devices:", error);
    return [];
  }
}

export default getSignedInDevices;
