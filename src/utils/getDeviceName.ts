function getDeviceName() {
  const ua = navigator.userAgent.toLowerCase();

  // 🟩 Detect Android + brand hints
  if (ua.includes("android")) {
    if (ua.includes("redmi")) return "Redmi (Android Device)";
    if (ua.includes("xiaomi")) return "Xiaomi (Android Device)";
    if (ua.includes("samsung")) return "Samsung (Android Device)";
    if (ua.includes("oppo")) return "OPPO (Android Device)";
    if (ua.includes("vivo")) return "Vivo (Android Device)";
    if (ua.includes("huawei")) return "Huawei (Android Device)";

    return "Android Device";
  }

  // 🍎 Detect Apple
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";

  // 💻 Detect desktop systems
  if (ua.includes("windows")) return "Windows PC or Laptop";
  if (ua.includes("macintosh")) return "MacBook or iMac";
  if (ua.includes("linux")) return "Linux PC or Laptop";

  // 🟨 Fallback
  return "Unknown Device";
}

export default getDeviceName;
