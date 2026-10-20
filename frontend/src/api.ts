export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    credentials: "include",
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ detail: "Unable to connect. Please try again." }));
    if (res.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : data.detail?.map((d: any) => d.msg).join("; ") ||
            "The request failed.",
    );
  }
  return res.json();
}
export const post = (path: string, data?: unknown) =>
  api(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
export const put = (path: string, data?: unknown) =>
  api(path, { method: "PUT", body: JSON.stringify(data) });
export type FoodResult = {
  id?: number;
  food_id: number | null;
  label: string;
  initial_quantity: number;
  remaining_quantity: number;
  consumed_quantity?: number;
  waste_quantity?: number;
  waste_percentage?: number;
  confidence: number;
  geometry: {
    polygons?: number[][][];
    after_polygons?: number[][][];
    centroid?: number[];
    [key: string]: any;
  };
  nutrition?: {
    per_100g?: Record<string, number>;
    source?: string | null;
    source_version?: string | null;
    estimated?: Record<
      string,
      { served: number; consumed: number; remaining: number; wasted: number }
    >;
  };
};
export type Meal = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  error?: string;
  total_served: number;
  total_remaining: number;
  total_consumed: number;
  total_waste: number;
  waste_percentage: number;
  cost_wasted: number;
  confidence: number;
  verified: boolean;
  saved: boolean;
  demo: boolean;
  meal_type: string;
  created_at: string;
  foods: FoodResult[];
  details: any;
  images: Record<string, string>;
  corrections?: any[];
};
export const fmt = (n: number = 0, d = 0) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
