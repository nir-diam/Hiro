import React, { useMemo } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from './Icons';
import LocationSelector, { type LocationItem } from './LocationSelector';
import { FormMultiSelect } from './FormMultiSelect';
import type { PublicBoardJob } from '../services/publishingApi';

export type PublicBoardFilterState = {
  search: string;
  fields: string[];
  jobTypes: string[];
  locations: LocationItem[];
};

type PublicBoardFiltersProps = {
  jobs: PublicBoardJob[];
  filters: PublicBoardFilterState;
  setFilters: React.Dispatch<React.SetStateAction<PublicBoardFilterState>>;
  resultsCount: number;
  accentColor: string;
};

const uniqueSorted = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

const PublicBoardFilters: React.FC<PublicBoardFiltersProps> = ({
  jobs,
  filters,
  setFilters,
  resultsCount,
  accentColor,
}) => {
  const options = useMemo(() => {
    const fields: string[] = [];
    const jobTypes = new Set<string>();

    jobs.forEach((job) => {
      if (job.field?.trim()) fields.push(job.field.trim());
      job.jobType.split('/').forEach((part) => {
        const t = part.trim();
        if (t) jobTypes.add(t);
      });
    });

    return {
      fields: uniqueSorted(fields).map((v) => ({ value: v, label: v })),
      jobTypes: [...jobTypes]
        .sort((a, b) => a.localeCompare(b, 'he'))
        .map((v) => ({ value: v, label: v })),
    };
  }, [jobs]);

  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    filters.fields.length > 0 ||
    filters.jobTypes.length > 0 ||
    filters.locations.length > 0;

  const handleClear = () => {
    setFilters({ search: '', fields: [], jobTypes: [], locations: [] });
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between">
        <div className="relative w-full xl:w-[320px] shrink-0">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="חיפוש כללי..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm focus:ring-2 focus:border-transparent transition-all outline-none"
            style={{ ['--tw-ring-color' as string]: `${accentColor}55` }}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 text-slate-400"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="min-w-[140px] flex-1 sm:flex-none sm:w-[190px]">
            <FormMultiSelect
              options={options.fields}
              value={filters.fields}
              onChange={(fields) => setFilters((prev) => ({ ...prev, fields }))}
              placeholder="תחום משרה"
              compact
              searchable
              searchPlaceholder="חיפוש תחום..."
              accentColor={accentColor}
              disabled={!options.fields.length}
            />
          </div>

          <div className="w-full sm:w-56 min-w-[160px]">
            <LocationSelector
              selectedLocations={filters.locations}
              onChange={(locations) => setFilters((prev) => ({ ...prev, locations }))}
              placeholder="מיקום"
              accentColor={accentColor}
            />
          </div>

          <div className="min-w-[120px] flex-1 sm:flex-none sm:w-[160px]">
            <FormMultiSelect
              options={options.jobTypes}
              value={filters.jobTypes}
              onChange={(jobTypes) => setFilters((prev) => ({ ...prev, jobTypes }))}
              placeholder="היקף משרה"
              compact
              searchable
              searchPlaceholder="חיפוש היקף..."
              accentColor={accentColor}
              disabled={!options.jobTypes.length}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 justify-between xl:justify-end">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-slate-500 hover:text-red-500 font-medium whitespace-nowrap px-2"
            >
              נקה הכל
            </button>
          )}
          <div
            className="text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            {resultsCount} משרות
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicBoardFilters;

export function filterPublicBoardJobs(
  jobs: PublicBoardJob[],
  filters: PublicBoardFilterState,
): PublicBoardJob[] {
  const search = filters.search.trim().toLowerCase();
  return jobs.filter((job) => {
    if (search) {
      const hay = [
        job.title,
        job.companyName,
        job.client,
        job.location,
        job.description,
        job.field,
        job.role,
        ...(job.requirements || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }

    if (filters.fields.length > 0) {
      const jobField = job.field?.trim() || '';
      if (!filters.fields.includes(jobField)) return false;
    }

    if (filters.jobTypes.length > 0) {
      const parts = job.jobType.split('/').map((p) => p.trim());
      if (!filters.jobTypes.some((jt) => parts.includes(jt))) return false;
    }

    if (filters.locations.length > 0) {
      const matchesLocation = filters.locations.some((loc) => {
        if (loc.type === 'city') {
          return job.city === loc.value || job.location.includes(loc.value);
        }
        if (loc.type === 'region') {
          return job.region === loc.value || job.location.includes(loc.value);
        }
        return job.location.includes(loc.value);
      });
      if (!matchesLocation) return false;
    }

    return true;
  });
}
