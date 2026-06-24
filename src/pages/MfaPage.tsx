import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

const functions = getFunctions();
const verifyMFACode = httpsCallable(functions, "verifyMFACode");
const resendCode = httpsCallable(functions, "resendCode"); // ← added

const RESEND_COOLDOWN_SECONDS = 60; // ← cooldown duration (adjust as needed)

const getDeviceName = (): string =>
  navigator.userAgent.includes("Windows")
    ? "Windows PC"
    : navigator.userAgent.includes("Mac")
    ? "Mac"
    : navigator.userAgent.includes("Android")
    ? "Android"
    : navigator.userAgent.includes("iPhone")
    ? "iPhone"
    : "Unknown Device";

const getBrowserName = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Unknown Browser";
};

const MfaPage: React.FC = () => {
  const { setActivateMFA, activateMFA } = useAuth();
  const { token } = useParams<{ token: string }>();

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<string | null>(null);

  // ── Resend state ───────────────────────────────────────────────────────
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const COOLDOWN_KEY = `mfa_resend_cooldown_${token}`; // token-scoped key
  // ──────────────────────────────────────────────────────────────────────

  const tickCooldown = useCallback(
    (initialSeconds: number) => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);

      setResendCooldown(initialSeconds);
      cooldownRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current!);
            cooldownRef.current = null;
            localStorage.removeItem(COOLDOWN_KEY);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [COOLDOWN_KEY]
  );

  const startCooldown = useCallback(() => {
    const expiresAt = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    localStorage.setItem(COOLDOWN_KEY, expiresAt.toString()); // persist end timestamp
    tickCooldown(RESEND_COOLDOWN_SECONDS);
  }, [COOLDOWN_KEY, tickCooldown]);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  // ── 1. Redirect after successful MFA ──────────────────────────────────
  useEffect(() => {
    if (!activateMFA && success) {
      setTimeout(() => navigate("/home", { replace: true }), 900);
      setSuccess(false);
      setActivateMFA(false);
    }
  }, [activateMFA, success, navigate, setActivateMFA]);

  // ── 2. Init: auth check + FingerprintJS ───────────────────────────────
  useEffect(() => {
    inputRefs.current[0]?.focus();

    FingerprintJS.load()
      .then((fp) => fp.get())
      .then((result) => setCurrentDevice(result.visitorId))
      .catch(() => setCurrentDevice(null));
  }, [COOLDOWN_KEY, tickCooldown]);

  // ── 3. Session guard (MFA page only) ──────────────────────────────────
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const handleBeforeUnload = () => signOut(auth).catch(console.error);
    const handleOffline = () => {
      signOut(auth).catch(console.error);
      navigate("/signin", { replace: true });
    };

    const TAB_KEY = `mfa_tab_${token}`;
    const thisTabId = crypto.randomUUID();
    localStorage.setItem(TAB_KEY, thisTabId);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TAB_KEY && e.newValue !== thisTabId) {
        signOut(auth).catch(console.error);
        navigate("/signin", { replace: true });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorageChange);
      localStorage.removeItem(TAB_KEY);
    };
  }, [token, navigate]);

  // ── 4. Cooldown ticker ────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(COOLDOWN_KEY);
    if (stored) {
      const remaining = Math.ceil((parseInt(stored, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setResendCooldown(remaining);
        tickCooldown(remaining);
      } else {
        localStorage.removeItem(COOLDOWN_KEY);
      }
    }

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [COOLDOWN_KEY, tickCooldown]);
  // ──────────────────────────────────────────────────────────────────────

  const handleResend = async () => {
    if (!token || resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setResendMsg(null);
    setError(null);

    try {
      const result = await resendCode({ token });
      const data = result.data as { success: boolean; locked?: boolean; msg: string };

      if (data.locked) {
        setError(data.msg);
        setResendLoading(false);
        return;
      }

      setResendMsg(data.success ? "✅ A new code has been sent to your email." : data.msg);

      if (data.success) {
        // Clear current input and refocus
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
        startCooldown();
      }
    } catch (err) {
      console.error("[MFA] Resend error:", err);
      setResendMsg("Failed to resend code. Please try again.");
    }

    setResendLoading(false);
  };

  const handleChange = (value: string, index: number) => {
    if (!/^[0-9]?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (!code[index] && index > 0) {
        const newCode = [...code];
        newCode[index - 1] = "";
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newCode = Array(6).fill("");
    for (let i = 0; i < pasted.length; i++) newCode[i] = pasted[i];
    setCode(newCode);
    const nextEmpty = newCode.findIndex((d) => d === "");
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
  };

  const handleCancel = async () => {
    try {
      await signOut(auth);
      setActivateMFA(false);
      sessionStorage.clear();
      sessionStorage.setItem("intentionalLogout", "true");
    } catch (err) {
      console.error("[MFA] Error signing out on cancel:", err);
    }
    navigate("/signin", { replace: true });
  };

  const handleVerify = async () => {
    const enteredCode = code.join("");

    if (enteredCode.length !== 6) {
      setError("Please enter all 6 digits.");
      return;
    }
    if (!token) {
      setError("Session expired. Please sign in again.");
      setTimeout(() => handleCancel(), 2000);
      return;
    }

    setLoading(true);
    setError(null);
    setResendMsg(null); // clear resend message on new attempt

    try {
      let deviceId = currentDevice;
      if (!deviceId) {
        try {
          const fp = await FingerprintJS.load();
          const result = await fp.get();
          deviceId = result.visitorId || null;
          setCurrentDevice(deviceId);
        } catch {
          deviceId = null;
        }
      }

      if (!deviceId) {
        setError("Unable to identify this device. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const result = await verifyMFACode({
        code: enteredCode,
        token,
        device_id: deviceId,
        deviceName: getDeviceName(),
        browserName: getBrowserName(),
      });

      const data = result.data as {
        success: boolean;
        message: string;
        locked?: boolean;
        token?: string;
      };

      if (!data.success) {
        setError(data.message);
        if (!data.locked) {
          setCode(["", "", "", "", "", ""]);
          setTimeout(() => inputRefs.current[0]?.focus(), 50);
        }
        setLoading(false);
        return;
      }

      if (!data.token) {
        setError("MFA verification succeeded but session token is missing. Please sign in again.");
        setLoading(false);
        return;
      }

      // Re-establish Firebase Auth session after MFA success.
      await signInWithCustomToken(auth, data.token);

      setSuccess(true);
      setActivateMFA(false);
      setLoading(false);
    } catch (err) {
      console.error("[MFA] Verification error:", err);
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  const allFilled = code.every((d) => d !== "");
  const resendDisabled = resendLoading || resendCooldown > 0 || loading || success;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-green-900 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-0 left-0 w-72 h-72 bg-green-600/20 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-green-400/10 rounded-full blur-3xl -z-10 animate-pulse" />

      <div className="max-w-md w-full space-y-8 shadow-2xl rounded-2xl bg-gray-900/80 backdrop-blur-md p-8 border border-gray-800/60">
        <div className="text-center">
          <img
            className="mx-auto h-24 w-auto drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]"
            src="/images/bulsu-space-logo.png"
            alt="BulSU Space Logo"
          />
          <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
            Multi-Factor Verification
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Enter the 6-digit verification code sent to your email
          </p>
        </div>

        <div className="flex justify-center gap-3 mt-6">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              id={`otp-${index}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onPaste={handlePaste}
              disabled={loading || success}
              className={[
                "w-12 h-14 text-center text-lg font-semibold rounded-lg text-white",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500",
                "transition-all duration-200 disabled:opacity-50",
                success
                  ? "bg-green-900/40 border border-green-500"
                  : error
                  ? "bg-gray-800/60 border border-red-500"
                  : digit
                  ? "bg-gray-800/80 border border-green-600"
                  : "bg-gray-800/60 border border-gray-700",
              ].join(" ")}
            />
          ))}
        </div>

        {error && (
          <p className="text-center text-sm text-red-400 mt-2">{error}</p>
        )}
        {success && (
          <p className="text-center text-sm text-green-400 mt-2 font-medium">
            ✅ Verified! Redirecting…
          </p>
        )}
        {/* Resend status message */}
        {resendMsg && !error && (
          <p className="text-center text-sm text-blue-400 mt-2">{resendMsg}</p>
        )}

        {/* ── Resend row ─────────────────────────────────────────────── */}
        <div className="text-center mt-4 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-sm">Didn't receive the code?</span>
          <button
            onClick={handleResend}
            disabled={resendDisabled}
            className={[
              "text-sm font-semibold underline underline-offset-4 transition-colors",
              resendDisabled
                ? "text-green-400/40 cursor-not-allowed"
                : "text-green-400 hover:text-green-300 cursor-pointer",
            ].join(" ")}
          >
            {resendLoading
              ? "Sending…"
              : resendCooldown > 0
              ? `Resend (${resendCooldown}s)`
              : "Resend"}
          </button>
        </div>
        {/* ──────────────────────────────────────────────────────────── */}

        <div className="mt-8">
          <button
            onClick={handleVerify}
            disabled={loading || success || !allFilled}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent
              text-base font-semibold rounded-lg text-white shadow-lg transition-all duration-300
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
              bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Verifying…
              </span>
            ) : success ? (
              "Verified!"
            ) : (
              "Verify Code"
            )}
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={handleCancel}
            disabled={loading || success}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel and go back
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaPage;