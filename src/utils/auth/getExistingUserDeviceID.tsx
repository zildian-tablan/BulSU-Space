import { db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

type DeviceEntry =
  | string
  | {
      device_id?: unknown;
      device_name?: unknown;
      browser_name?: unknown;
    };

async function getExistingUserDeviceID(userId: string | null, deviceID: string | null): Promise<boolean> {

  if (!userId || !deviceID) {
    return false;
  }

  try {
    // Read canonical per-user device document. Querying by `user` can fail if legacy
    // random-id docs are present and blocked by doc-id based rules.
    const deviceDocRef = doc(db, "device", userId);
    const deviceDoc = await getDoc(deviceDocRef);

    if (!deviceDoc.exists()) {
      return false;
    }

    const rawDevices = deviceDoc.data()?.device_id;
    if (!Array.isArray(rawDevices)) {
      return false;
    }

    return rawDevices.some((entry: DeviceEntry) => {
      if (typeof entry === "string") {
        return entry === deviceID;
      }

      if (entry && typeof entry === "object" && typeof entry.device_id === "string") {
        return entry.device_id === deviceID;
      }

      return false;
    });
  } catch (error) {
    console.error("[MFA] Failed to read known devices:", error);
    return false;
  }
}

export default getExistingUserDeviceID