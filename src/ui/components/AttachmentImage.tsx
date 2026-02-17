import { useState } from "react";

import { text } from "../theme";
import { Spinner } from "./Spinner";

interface AttachmentImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function AttachmentImage({ src, alt, className = "" }: AttachmentImageProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="xs" className={text.dimmed} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${loading ? "opacity-0" : "opacity-100"} transition-opacity`}
        loading="lazy"
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
    </div>
  );
}
