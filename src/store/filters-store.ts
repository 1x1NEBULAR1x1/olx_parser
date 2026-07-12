import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_FILTERS, type FilterValues } from "@/components/FilterBar/FilterBar";

interface FiltersStore {
  filters: FilterValues;
  set_filters: (filters: FilterValues) => void;
  reset_filters: () => void;
}

// Персист в localStorage под ключом ниже — фильтры переживают перезагрузку
// страницы/повторный визит. Версионирование (`version`) на случай, если
// форма FilterValues поменяется в будущем несовместимо — `migrate` тогда
// сможет привести старые сохранённые значения к новой форме вместо краша.
export const useFiltersStore = create<FiltersStore>()(
  persist(
    (set) => ({
      filters: DEFAULT_FILTERS,
      set_filters: (filters) => set({ filters }),
      reset_filters: () => set({ filters: DEFAULT_FILTERS }),
    }),
    {
      name: "smartflip-filters",
      version: 3,
      // v1 -> v2: добавлено filters.regions
      // v2 -> v3: добавлено filters.model_lines
      migrate: (persisted_state) => {
        const state = persisted_state as { filters?: Partial<FilterValues> } | undefined;
        return {
          filters: {
            ...DEFAULT_FILTERS,
            ...state?.filters,
            regions: state?.filters?.regions ?? [],
            model_lines: state?.filters?.model_lines ?? [],
          },
        };
      },
    },
  ),
);
