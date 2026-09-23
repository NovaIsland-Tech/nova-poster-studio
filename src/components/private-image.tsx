"use client";
import { useEffect, useState } from "react";
import { fileBlob } from "@/lib/browser/api";
export function PrivateImage({
  kind,
  id,
  ...props
}: {
  kind: "asset" | "output";
  id: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    setUrl("");
    setError(false);
    fileBlob(kind, id)
      .then((blob) => {
        if (!disposed) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, id]);
  if (error) return <span className="muted">图片暂时无法加载</span>;
  if (!url) return <span className="muted">加载图片…</span>;
  return <img {...props} src={url} />;
}
