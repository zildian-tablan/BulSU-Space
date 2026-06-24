import { ref, get, DataSnapshot } from "firebase/database";
import { rtdb2 } from "../firebase/config"; // adjust path if needed

interface OfferData {
  offer?: any; // replace `any` with the actual offer type if known
  [key: string]: any;
}

async function WaitForOffer(refPath: string): Promise<OfferData> {
  async function start(maxRetries = 50, delay = 500): Promise<OfferData> {
    for (let i = 0; i < maxRetries; i++) {
      const snapshot: DataSnapshot = await get(ref(rtdb2, refPath));
      const data: OfferData = snapshot.val();
      if (data?.offer) {
        console.log("✅ Offer found");
        return data;
      }
      console.log(`🔁 Waiting for offer... attempt ${i + 1}`);
      await new Promise(res => setTimeout(res, delay));
    }

    throw new Error("❌ Offer not found after waiting");
  }

  return start();
}

export default WaitForOffer;
