"use client";

import { useEffect } from "react";

/** Registers the door service worker so a reload of /door stays usable without a network. */
export function DoorOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/door-sw.js").catch(() => {
      // If registration fails, keep the scanner tab open and do not reload during the demo.
    });
  }, []);
  return null;
}
