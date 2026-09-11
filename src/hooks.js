import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";

// ─── Device compass heading ───────────────────────────────────────────────────
// iOS Safari requires a tap-triggered permission request; most other browsers
// deliver orientation events without one. When no usable heading ever arrives
// (desktop, an unsupported browser, permission denied) callers fall back to a
// "north-up" compass instead of pretending to know which way the phone faces.
export function useDeviceHeading() {
  const [status, setStatus] = useState("idle"); // idle | requesting | active | denied | unavailable
  const [heading, setHeading] = useState(null);
  const timeoutRef = useRef(null);

  const needsPermission =
    typeof window !== "undefined" &&
    typeof window.DeviceOrientationEvent !== "undefined" &&
    typeof window.DeviceOrientationEvent.requestPermission === "function";

  const handleOrientation = useCallback(e => {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;       // iOS Safari — already true-north, clockwise
    else if (e.absolute === true && typeof e.alpha === "number") h = (360 - e.alpha) % 360; // Android absolute — alpha is counter-clockwise
    if (h === null) return;
    clearTimeout(timeoutRef.current);
    setHeading(h);
    setStatus("active");
  }, []);

  const start = useCallback(() => {
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    timeoutRef.current = setTimeout(() => setStatus(s => (s === "active" ? s : "unavailable")), 2500);
  }, [handleOrientation]);

  const request = useCallback(async () => {
    setStatus("requesting");
    if (needsPermission) {
      try {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result !== "granted") { setStatus("denied"); return; }
      } catch {
        setStatus("denied");
        return;
      }
    }
    start();
  }, [needsPermission, start]);

  useEffect(() => {
    if (!needsPermission) start(); // no gesture required — start listening immediately
    return () => {
      clearTimeout(timeoutRef.current);
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, heading, needsPermission, request };
}

// ─── Live radar: GPS fix → POST /api/events/:id/location → distance+bearing ──
// Other attendees' coordinates never reach this hook or the browser at all —
// the server returns only distanceM/bearingDeg, computed server-side.
export function useLiveRadar(eventId, sharing, { intervalMs = 10000 } = {}) {
  const [state, setState] = useState({ status: "off", error: null, radar: [], accuracyM: null, updatedAt: null });
  const timerRef = useRef(null);

  const tick = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, status: "error", error: "This browser does not support location." }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { radar } = await api.post(`/api/events/${eventId}/location`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            headingDeg: pos.coords.heading ?? null,
          });
          setState({ status: "active", error: null, radar, accuracyM: pos.coords.accuracy, updatedAt: Date.now() });
        } catch (e) {
          setState(s => ({ ...s, status: "error", error: e.message }));
        }
      },
      err => {
        const message = { 1: "Location permission denied.", 2: "Could not determine your location.", 3: "Location request timed out." }[err.code]
          || "Could not get your location.";
        setState(s => ({ ...s, status: "error", error: message }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 4000 },
    );
  }, [eventId]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!sharing || !eventId) {
      setState(s => (s.status === "off" ? s : { status: "off", error: null, radar: [], accuracyM: null, updatedAt: null }));
      return;
    }
    setState(s => ({ ...s, status: "requesting" }));
    tick();
    timerRef.current = setInterval(tick, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [sharing, eventId, intervalMs, tick]);

  return state;
}

// ─── Presence: who's checked in, no coordinates — works without location sharing ──
export function usePresence(eventId, { intervalMs = 20000 } = {}) {
  const [state, setState] = useState({ people: [], loading: true, error: null });

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const { people } = await api.get(`/api/events/${eventId}/presence`);
      setState({ people, loading: false, error: null });
    } catch (e) {
      setState({ people: [], loading: false, error: e.message });
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) { setState({ people: [], loading: false, error: null }); return; }
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [eventId, intervalMs, refresh]);

  return { ...state, refresh };
}

// ─── Heartbeat: keeps a check-in "active" even when location sharing is off ──
export function useHeartbeat(eventId, checkedIn, { intervalMs = 4 * 60 * 1000 } = {}) {
  useEffect(() => {
    if (!eventId || !checkedIn) return;
    const id = setInterval(() => { api.post(`/api/events/${eventId}/heartbeat`).catch(() => {}); }, intervalMs);
    return () => clearInterval(id);
  }, [eventId, checkedIn, intervalMs]);
}
