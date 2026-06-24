import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Returns a Promise<string | null> without using async/await syntax
function getDeviceID(): Promise<string | null> {
  
  // Load the FingerprintJS agent, get the visitor identifier, and return it
  return FingerprintJS.load()
    .then((fp) => fp.get())
    .then((result) => result.visitorId)
    .catch(() => null); // Return null if anything fails
}

export default getDeviceID;


// import FingerprintJS from '@fingerprintjs/fingerprintjs';

// async function getDeviceID() {

//    // // load the agent
//    // const fp = await FingerprintJS.load();
//    // // get the visitor identifier
//    // const result = await fp.get();
//    // // visitorId is the unique id
//    // return result.visitorId;

//    try {
//       const response = await fetch("https://api64.ipify.org?format=json");
//       if (!response.ok) throw new Error("Failed to fetch IP");
//       const data = await response.json();
//       return data.ip; // this is the public IP
//    } catch (error) {
//       console.error("Error getting IP:", error);
//       return null;
//    }
// }

// export default getDeviceID