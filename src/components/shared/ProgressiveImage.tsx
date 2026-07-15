"use client";

import { useState, useCallback } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   ProgressiveImage — Medium-style progressive image loading.

   Shows a subtle shimmer placeholder while the image loads,
   then cross-fades from blurred → sharp with a smooth scale
   transition, eliminating harsh pop-in.
   ═══════════════════════════════════════════════════════════ */

type ProgressiveImageProps = Omit<ImageProps, "alt"> & {
  /** Required — always provide meaningful alt text */
  alt: string;
  /** Optional additional classes for the outer container */
  containerClassName?: string;
};

export function ProgressiveImage({
  containerClassName,
  className,
  alt,
  fill,
  width,
  height,
  sizes,
  ...imgProps
}: ProgressiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setIsLoaded(true);
      imgProps.onLoad?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imgProps.onLoad]
  );

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setHasError(true);
      imgProps.onError?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imgProps.onError]
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-slate-800/30",
        containerClassName
      )}
      style={fill ? undefined : { aspectRatio: width && height ? `${width}/${height}` : undefined }}
    >
      {/* Shimmer placeholder — fades out when image loads */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-10 transition-opacity duration-500 ease-out",
          isLoaded || hasError ? "opacity-0" : "opacity-100"
        )}
      >
        {/* Subtle pulse gradient simulating the blurry preview */}
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800/40 via-slate-700/15 to-slate-800/30" />
        {/* Diagonal shimmer bar */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-pulse" />
      </div>

      <Image
        {...imgProps}
        alt={alt}
        fill={fill}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        sizes={sizes}
        className={cn(
          "transition-all duration-700 ease-out",
          isLoaded ? "blur-0 scale-100 opacity-100" : "blur-[6px] scale-105 opacity-0",
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        unoptimized={imgProps.unoptimized ?? (typeof imgProps.src === "string" && imgProps.src.endsWith(".svg") ? true : undefined)}
        priority={imgProps.priority}
      />
    </div>
  );
}
