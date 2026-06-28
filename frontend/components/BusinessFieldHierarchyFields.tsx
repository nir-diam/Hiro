import React, { useEffect, useMemo, useState } from 'react';

import { FormMultiSelect } from './FormMultiSelect';

import {
    BUSINESS_FIELD_CATEGORY_ID,
    fetchPicklistCategoryValues,
    fetchPicklistSubcategories,
    picklistRowLabel,
    type PicklistSubcategoryRow,
    type PicklistValueRow,
} from '../services/picklistValuesApi';

export type BusinessFieldHierarchyValues = {
    mainField: string[];
    subField: string[];
    secondaryField?: string;
};

/** Combine API mainField + mainField2 into a single multiselect value. */
export function mainFieldsFromApi(mainField: string, mainField2?: string[]): string[] {
    const out: string[] = [];
    const primary = String(mainField || '').trim();
    if (primary) out.push(primary);
    for (const f of mainField2 || []) {
        const t = String(f || '').trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out;
}

/** Split multiselect value back to API mainField (first) + mainField2 (rest). */
export function mainFieldsToApi(mainFields: string[]): { mainField: string; mainField2: string[] } {
    const clean = mainFields.map((s) => String(s || '').trim()).filter(Boolean);
    return {
        mainField: clean[0] || '',
        mainField2: clean.slice(1),
    };
}

type BusinessFieldHierarchyFieldsProps = {
    apiBase: string;
    values: BusinessFieldHierarchyValues;
    onChange: (next: BusinessFieldHierarchyValues) => void;
    /** Show free-text secondary occupation field */
    showSecondary?: boolean;
    /** Compact layout for filter toolbar */
    compact?: boolean;
    className?: string;
};

const BusinessFieldHierarchyFields: React.FC<BusinessFieldHierarchyFieldsProps> = ({
    apiBase,
    values,
    onChange,
    showSecondary = true,
    compact = false,
    className = '',
}) => {
    const [industries, setIndustries] = useState<PicklistSubcategoryRow[]>([]);
    const [subFieldOptions, setSubFieldOptions] = useState<PicklistValueRow[]>([]);

    useEffect(() => {
        if (!apiBase) return;
        let cancelled = false;
        void fetchPicklistSubcategories(apiBase, BUSINESS_FIELD_CATEGORY_ID).then((rows) => {
            if (!cancelled) setIndustries(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase || !values.mainField.length) {
            setSubFieldOptions([]);
            return;
        }

        const categoryIds = values.mainField
            .map((name) => industries.find((i) => i.name === name)?.id)
            .filter((id): id is number => id != null);

        if (!categoryIds.length) {
            setSubFieldOptions([]);
            return;
        }

        let cancelled = false;
        void Promise.all(categoryIds.map((id) => fetchPicklistCategoryValues(apiBase, id))).then(
            (results) => {
                if (cancelled) return;
                const seen = new Set<string>();
                const merged: PicklistValueRow[] = [];
                for (const rows of results) {
                    for (const row of rows) {
                        const label = picklistRowLabel(row);
                        if (!label || seen.has(label)) continue;
                        seen.add(label);
                        merged.push(row);
                    }
                }
                setSubFieldOptions(merged);
            },
        );

        return () => {
            cancelled = true;
        };
    }, [apiBase, values.mainField, industries]);

    const mainFieldSelectOptions = useMemo(
        () => industries.map((ind) => ({ value: ind.name, label: ind.name })),
        [industries],
    );

    const subFieldSelectOptions = useMemo(
        () =>
            subFieldOptions.map((row) => {
                const label = picklistRowLabel(row);
                return { value: label, label };
            }),
        [subFieldOptions],
    );

    const inputClass = compact
        ? 'w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none'
        : 'w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500';

    const filterSubFieldsForMainFields = async (
        mainField: string[],
        currentSubField: string[],
    ): Promise<string[]> => {
        if (!apiBase || !mainField.length) return [];
        const categoryIds = mainField
            .map((name) => industries.find((i) => i.name === name)?.id)
            .filter((id): id is number => id != null);
        if (!categoryIds.length) return [];
        const results = await Promise.all(categoryIds.map((id) => fetchPicklistCategoryValues(apiBase, String(id))));
        const validLabels = new Set<string>();
        for (const rows of results) {
            for (const row of rows) {
                const label = picklistRowLabel(row);
                if (label) validLabels.add(label);
            }
        }
        return currentSubField.filter((s) => validLabels.has(s));
    };

    const handleMainFieldChange = (mainField: string[]) => {
        const prevMain = values.mainField;
        const onlyAdditions =
            mainField.length >= prevMain.length && prevMain.every((m) => mainField.includes(m));

        if (onlyAdditions) {
            onChange({ ...values, mainField, subField: values.subField });
            return;
        }

        if (!mainField.length) {
            onChange({ ...values, mainField, subField: [] });
            return;
        }

        void filterSubFieldsForMainFields(mainField, values.subField).then((subField) => {
            onChange({ ...values, mainField, subField });
        });
    };

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
                <div className={compact ? 'flex-1 min-w-[140px]' : ''}>
                    <FormMultiSelect
                        label={compact ? undefined : 'תעשייה'}
                        compact={compact}
                        options={mainFieldSelectOptions}
                        value={values.mainField}
                        onChange={handleMainFieldChange}
                        placeholder={compact ? 'תעשיית אם' : 'בחר מתוך רשימה…'}
                    />
                </div>

                <div className={compact ? 'flex-1 min-w-[140px]' : ''}>
                    <FormMultiSelect
                        label={compact ? undefined : 'תחום עיסוק'}
                        compact={compact}
                        disabled={!values.mainField.length || subFieldOptions.length === 0}
                        placeholder={
                            !values.mainField.length
                                ? 'בחר תעשיית אם תחילה'
                                : subFieldOptions.length === 0
                                  ? 'אין תת-תחומים'
                                  : compact
                                    ? 'תחום עיסוק'
                                    : 'בחר תת-תחום…'
                        }
                        options={subFieldSelectOptions}
                        value={values.subField}
                        onChange={(subField) => onChange({ ...values, subField })}
                    />
                </div>

                {showSecondary && (
                    <div className={compact ? 'flex-1 min-w-[160px]' : 'md:col-span-2'}>
                        {!compact && (
                            <label className="block text-xs font-semibold text-text-muted mb-1">תחום עיסוק משני</label>
                        )}
                        <input
                            type="text"
                            value={values.secondaryField ?? ''}
                            onChange={(e) => onChange({ ...values, secondaryField: e.target.value })}
                            placeholder={compact ? 'תחום עיסוק משני' : 'טקסט חופשי — תחומים נוספים (אופציונלי)'}
                            className={inputClass}
                        />
                    </div>
                )}
            </div>

            {values.mainField.length > 0 && (
                <button
                    type="button"
                    onClick={() =>
                        onChange({ mainField: [], subField: [], secondaryField: values.secondaryField ?? '' })
                    }
                    className="text-xs font-bold text-text-muted hover:text-red-600 self-start"
                >
                    נקה תעשייה
                </button>
            )}
        </div>
    );
};

export default BusinessFieldHierarchyFields;
