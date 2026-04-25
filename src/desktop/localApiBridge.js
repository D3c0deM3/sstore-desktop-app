import { desktopInvoke, isDesktopApp } from "./tauriClient";

const originalFetch = window.fetch?.bind(window);

const isApiRequest = (input) => {
  const url = typeof input === "string" ? input : input?.url || "";
  return url.includes("/api/");
};

const headersToObject = (headers) => {
  const result = {};
  if (!headers) return result;

  const source = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [key, value] of source) {
    result[key] = value;
  }
  return result;
};

const bodyToJson = async (body) => {
  if (!body) return null;

  if (body instanceof FormData) {
    const value = {};
    for (const [key, entry] of body.entries()) {
      if (entry instanceof File) {
        value[key] = await fileToPayload(entry);
      } else {
        value[key] = entry;
      }
    }
    return value;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return { text: body };
    }
  }

  return body;
};

const fileToPayload = (file) =>
  new Promise((resolve) => {
    if (!window.FileReader) {
      resolve({
        name: file.name || "",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name || "",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        data_url: typeof reader.result === "string" ? reader.result : "",
      });
    reader.onerror = () =>
      resolve({
        name: file.name || "",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
      });
    reader.readAsDataURL(file);
  });

const buildResponse = (apiResponse) => {
  const contentType = apiResponse.content_type || "application/json";
  const isText = contentType.startsWith("text/");
  const payload = isText
    ? apiResponse.body?.text || ""
    : JSON.stringify(apiResponse.body ?? {});

  return new Response(payload, {
    status: apiResponse.status || 200,
    headers: { "Content-Type": contentType },
  });
};

export const localApiFetch = async (input, init = {}) => {
  if (!isDesktopApp() || !isApiRequest(input)) {
    return originalFetch(input, init);
  }

  const request = input instanceof Request ? input : null;
  const method = (init.method || request?.method || "GET").toUpperCase();
  const path = typeof input === "string" ? input : input.url;
  const headers = {
    ...headersToObject(request?.headers),
    ...headersToObject(init.headers),
  };
  const body = await bodyToJson(init.body || request?._bodyInit);

  try {
    const apiResponse = await desktopInvoke("local_api", {
      request: { method, path, headers, body },
    });
    return buildResponse(apiResponse);
  } catch (error) {
    return buildResponse({
      status: 500,
      content_type: "application/json",
      body: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

export const installDesktopApiBridge = () => {
  if (!isDesktopApp() || !originalFetch || window.__SSTORE_DESKTOP_API_BRIDGE__) {
    return;
  }

  window.__SSTORE_DESKTOP_API_BRIDGE__ = true;
  window.fetch = localApiFetch;
};

export const desktopApiPost = async (path, body) => {
  const isFormData = body instanceof FormData;
  const response = await localApiFetch(path, {
    method: "POST",
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    body: isFormData ? body : JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Request failed");
    error.response = { data, status: response.status };
    throw error;
  }

  return { data, status: response.status };
};
