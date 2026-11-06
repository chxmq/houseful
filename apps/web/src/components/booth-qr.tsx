"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Live QR for the booth /try page. Judges scan this to open the demo show. */
export function BoothQr({ href }: { href: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(href, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#14110f", light: "#00000000" },
      width: 280,
    }).then((out) => {
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [href]);

  if (!svg) {
    return <div className="aspect-square w-full max-w-[280px] animate-pulse bg-ink/5" aria-hidden />;
  }

  return (
    <div
      className="mx-auto w-full max-w-[280px] [&_svg]:h-auto [&_svg]:w-full"
      role="img"
      aria-label={`QR code linking to ${href}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
