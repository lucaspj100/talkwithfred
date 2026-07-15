import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  id: string;
  brand_name: string;
  fred_avatar_url: string | null;
  updated_at: string;
};

export const APP_SETTINGS_QUERY_KEY = ["app_settings"] as const;

export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: async (): Promise<AppSettings | null> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("id, brand_name, fred_avatar_url, updated_at")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
