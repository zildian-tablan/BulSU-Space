import { useCallback, useEffect, useState } from "react";
import { db } from "../../firebase/config";
import { getAuth } from "firebase/auth";
import { useAuth } from "../../contexts/AuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  doc,
} from "firebase/firestore";

interface DeviceInfo {
  device_id?: string;
  device_name?: string;
  browser_name?: string;
}

interface Device {
  id: string;
  user: string;
  device_id: DeviceInfo[];
  [key: string]: any;
}

function SignedInDevices() {
  const { currentUser } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);

  function normalizeDeviceList(raw: unknown): DeviceInfo[] {
    if (!Array.isArray(raw)) return [];

    const normalized: DeviceInfo[] = [];

    raw.forEach((entry) => {
      if (!entry) return;

      if (typeof entry === "string") {
        normalized.push({
            device_id: entry,
            device_name: "Trusted Device",
            browser_name: "Unknown Browser",
        });
        return;
      }

      if (typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        const normalizedId = typeof obj.device_id === "string" ? obj.device_id : "";
        const normalizedName = typeof obj.device_name === "string" ? obj.device_name : "Trusted Device";
        const normalizedBrowser = typeof obj.browser_name === "string" ? obj.browser_name : "Unknown Browser";

        if (!normalizedId && !normalizedName && !normalizedBrowser) return;

        normalized.push({
          device_id: normalizedId,
          device_name: normalizedName,
          browser_name: normalizedBrowser,
        });
      }
    });

    return normalized;
  }

  const fetchDevices = useCallback(async () => {
    try {
      const auth = getAuth();
      const user = currentUser?.id ? { uid: currentUser.id } : auth.currentUser;

      if (!user) {
        setDevices([]);
        return;
      }

      const fetchedDevices: Device[] = [];

      // Read canonical per-user document first.
      const canonicalRef = doc(db, "device", user.uid);
      const canonicalSnap = await getDoc(canonicalRef);

      if (canonicalSnap.exists()) {
        const data = canonicalSnap.data() as Record<string, unknown>;
        fetchedDevices.push({
          id: canonicalSnap.id,
          ...data,
          user: String(data.user || user.uid),
          device_id: normalizeDeviceList(data.device_id),
        } as Device);
      }

      // Temporary legacy fallback for random-id docs.
      const devicesRef = collection(db, "device");
      const q = query(devicesRef, where("user", "==", user.uid));
      const snapshot = await getDocs(q);

      snapshot.docs.forEach((snap) => {
        if (snap.id === user.uid) return;

        const data = snap.data() as Record<string, unknown>;
        fetchedDevices.push({
          id: snap.id,
          ...data,
          user: String(data.user || user.uid),
          device_id: normalizeDeviceList(data.device_id),
        } as Device);
      });

      setDevices(fetchedDevices);
    } catch (error) {
      console.error("Error fetching signed-in devices:", error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // 🧹 Remove ALL devices (empty the array)
  async function handleRemoveAllDevices() {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return alert("No user signed in");

      const updates: Promise<void>[] = [];

      const canonicalRef = doc(db, "device", user.uid);
      const canonicalSnap = await getDoc(canonicalRef);
      if (canonicalSnap.exists()) {
        updates.push(updateDoc(canonicalRef, { device_id: [] }));
      }

      const devicesRef = collection(db, "device");
      const q = query(devicesRef, where("user", "==", user.uid));
      const snapshot = await getDocs(q);

      snapshot.docs.forEach((d) => {
        if (d.id === user.uid) return;
        updates.push(updateDoc(doc(db, "device", d.id), { device_id: [] }));
      });

      await Promise.all(updates);
      setDevices((prev) => prev.map((doc) => ({ ...doc, device_id: [] })));

      alert("All devices removed successfully.");
    } catch (error) {
      console.error("Error clearing devices:", error);
      alert("Failed to remove devices.");
    }
  }

  // ❌ Remove one device from array by index
  async function handleRemoveDevice(docId: string, index: number) {
    try {
      const deviceDoc = devices.find((d) => d.id === docId);
      if (!deviceDoc) return;

      const newArray = deviceDoc.device_id.filter((_, i) => i !== index);

      await updateDoc(doc(db, "device", docId), {
        device_id: newArray,
      });

      setDevices((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, device_id: newArray } : d
        )
      );
    } catch (error) {
      console.error("Error removing device:", error);
    }
  }

  return (
    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 w-full mx-auto">
      <h3 className="text-md font-medium text-green-300 mb-3 flex items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 mr-2 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
          />
        </svg>
        Signed-in Devices
      </h3>

      <ul className="divide-y divide-gray-700">
        {devices.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">
            No signed-in devices found.
          </p>
        ) : (
          devices.map((doc) =>
            doc.device_id?.length > 0 ? (
              doc.device_id.map((device, index) => (
                <li
                  key={`${doc.id}-${index}`}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-700/70 p-2 rounded-lg">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9.75 17L9 20h6l-.75-3M3 4h18M3 8h18M3 12h18M3 16h18"
                        />
                      </svg>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-200">
                        {device.device_name || "Unknown Device"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {device.browser_name || "Unknown Browser"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveDevice(doc.id, index)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-700/50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </li>
              ))
            ) : (
              <li
                key={doc.id}
                className="text-gray-400 text-sm text-center py-3 italic"
              >
                (No devices stored)
              </li>
            )
          )
        )}
      </ul>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleRemoveAllDevices}
          className="text-sm py-1.5 px-3 rounded-md font-medium bg-red-600 hover:bg-red-700 text-white flex items-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a2 2 0 012 2v0a2 2 0 01-2 2H7a2 2 0 01-2-2v0a2 2 0 012-2h10z"
            />
          </svg>
          Remove All Devices
        </button>
      </div>
    </div>
  );
}

export default SignedInDevices;
