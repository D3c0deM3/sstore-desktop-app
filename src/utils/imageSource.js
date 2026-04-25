export const resolveMediaUrl = (value) => {
  if (typeof value !== "string") return "";

  const source = value.trim();
  if (!source) return "";

  if (
    source.startsWith("/") ||
    /^(https?:|data:|blob:|file:|asset:|tauri:)/i.test(source)
  ) {
    return source;
  }

  const cloudName =
    process.env.REACT_APP_CLOUDINARY_CLOUD_NAME ||
    process.env.VITE_CLOUDINARY_CLOUD_NAME ||
    "bnf404";

  return `https://res.cloudinary.com/${cloudName}/image/upload/${source}`;
};

export const hasMediaUrl = (value) => Boolean(resolveMediaUrl(value));
